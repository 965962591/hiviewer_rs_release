//! Reads the saved composite only. Layer/mask blocks are skipped without decoding layers.
use hiviewer_plugin_sdk::{Result, image::MAX_PIXELS};
use image::{DynamicImage, RgbaImage};
use std::io::Read;

pub struct Header {
    pub width: u32,
    pub height: u32,
    channels: usize,
}
struct Reader<'a> {
    bytes: &'a [u8],
    offset: usize,
}
impl<'a> Reader<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, offset: 0 }
    }
    fn take(&mut self, len: usize) -> Result<&'a [u8]> {
        let end = self.offset.checked_add(len).ok_or("PSD offset overflow")?;
        let bytes = self.bytes.get(self.offset..end).ok_or("truncated PSD")?;
        self.offset = end;
        Ok(bytes)
    }
    fn u16(&mut self) -> Result<u16> {
        Ok(u16::from_be_bytes(self.take(2)?.try_into()?))
    }
    fn u32(&mut self) -> Result<u32> {
        Ok(u32::from_be_bytes(self.take(4)?.try_into()?))
    }
    fn block(&mut self) -> Result<&'a [u8]> {
        let len = self.u32()?;
        self.take(len as usize)
    }
    fn remaining(&self) -> &'a [u8] {
        &self.bytes[self.offset..]
    }
}

pub fn header(bytes: &[u8]) -> Result<Header> {
    let mut input = Reader::new(bytes);
    if input.take(4)? != b"8BPS" || input.u16()? != 1 {
        return Err("Only PSD version 1 is supported; PSB is unsupported".into());
    }
    if input.take(6)? != [0; 6] {
        return Err("Invalid PSD reserved bytes".into());
    }
    let channels = input.u16()? as usize;
    let height = input.u32()?;
    let width = input.u32()?;
    let depth = input.u16()?;
    let mode = input.u16()?;
    if depth != 8 || mode != 3 {
        return Err(
            "PSD example requires RGB 8-bit; CMYK, Lab, grayscale and 16/32-bit are unsupported"
                .into(),
        );
    }
    if !(3..=16).contains(&channels)
        || width == 0
        || height == 0
        || width > 32768
        || height > 32768
        || u64::from(width) * u64::from(height) > MAX_PIXELS
        || u64::from(width) * u64::from(height) * channels as u64 > 256 * 1024 * 1024
    {
        return Err("PSD dimensions/channels exceed decoder limits".into());
    }
    Ok(Header {
        width,
        height,
        channels,
    })
}

fn icc_profile(bytes: &[u8]) -> Result<Option<&[u8]>> {
    let mut input = Reader::new(bytes);
    let mut icc = None;
    while !input.remaining().is_empty() {
        if input.take(4)? != b"8BIM" {
            return Err("Invalid PSD image resource signature".into());
        }
        let id = input.u16()?;
        let len = input.take(1)?[0] as usize;
        input.take(len)?;
        if (len + 1) % 2 != 0 {
            input.take(1)?;
        }
        let data = input.block()?;
        if data.len() % 2 != 0 {
            input.take(1)?;
        }
        if id == 1039 {
            if data.len() > 4 * 1024 * 1024 {
                return Err("PSD ICC profile too large".into());
            }
            icc = Some(data);
        }
    }
    Ok(icc)
}

fn unpack_row(bytes: &[u8], target: &mut [u8]) -> Result<()> {
    let mut input = Reader::new(bytes);
    let mut offset = 0;
    while !input.remaining().is_empty() {
        let tag = input.take(1)?[0] as i8;
        if tag == -128 {
            continue;
        }
        let len = if tag >= 0 {
            tag as usize + 1
        } else {
            (1i16 - tag as i16) as usize
        };
        let end = offset + len;
        let out = target.get_mut(offset..end).ok_or("PSD RLE row overflow")?;
        if tag >= 0 {
            out.copy_from_slice(input.take(len)?);
        } else {
            out.fill(input.take(1)?[0]);
        }
        offset = end;
    }
    if offset != target.len() {
        return Err("PSD RLE row underflow".into());
    }
    Ok(())
}

pub fn decode(bytes: &[u8]) -> Result<DynamicImage> {
    let info = header(bytes)?;
    let mut input = Reader::new(bytes);
    input.take(26)?;
    input.block()?; // Color mode data.
    let icc = icc_profile(input.block()?)?;
    let layers = input.block()?;
    // A negative layer count specifies a merged transparency channel. Extra
    // saved alpha channels must not accidentally become display transparency.
    let transparency = if layers.len() >= 6 {
        let mut layers = Reader::new(layers);
        let info_len = layers.u32()?;
        info_len >= 2 && (layers.u16()? as i16) < 0
    } else {
        false
    };
    let compression = input.u16()?;
    let pixels = info.width as usize * info.height as usize;
    let samples = pixels * info.channels;
    let mut planar = match compression {
        0 => input.take(samples)?.to_vec(),
        1 => {
            let rows = info.height as usize * info.channels;
            let lengths = (0..rows).map(|_| input.u16()).collect::<Result<Vec<_>>>()?;
            let mut planar = vec![0; samples];
            for (row, len) in planar.chunks_exact_mut(info.width as usize).zip(lengths) {
                unpack_row(input.take(len as usize)?, row)?;
            }
            planar
        }
        2 | 3 => {
            let mut planar = Vec::new();
            flate2::read::ZlibDecoder::new(input.remaining())
                .take(samples as u64 + 1)
                .read_to_end(&mut planar)?;
            if planar.len() != samples {
                return Err("PSD ZIP sample count mismatch".into());
            }
            planar
        }
        _ => return Err("Unsupported PSD composite compression".into()),
    };
    if compression == 3 {
        for row in planar.chunks_exact_mut(info.width as usize) {
            for x in 1..row.len() {
                row[x] = row[x].wrapping_add(row[x - 1]);
            }
        }
    }
    let mut rgb = vec![0; pixels * 3];
    for (index, pixel) in rgb.chunks_exact_mut(3).enumerate() {
        for channel in 0..3 {
            pixel[channel] = planar[channel * pixels + index];
        }
    }
    if let Some(icc) = icc {
        let source = lcms2::Profile::new_icc(icc)?;
        let transform = lcms2::Transform::<u8, u8>::new(
            &source,
            lcms2::PixelFormat::RGB_8,
            &lcms2::Profile::new_srgb(),
            lcms2::PixelFormat::RGB_8,
            lcms2::Intent::RelativeColorimetric,
        )?;
        transform.transform_in_place(&mut rgb);
    }
    let mut rgba = vec![255; pixels * 4];
    for (index, pixel) in rgba.chunks_exact_mut(4).enumerate() {
        pixel[..3].copy_from_slice(&rgb[index * 3..index * 3 + 3]);
        if transparency && info.channels > 3 {
            pixel[3] = planar[3 * pixels + index];
        }
    }
    Ok(DynamicImage::ImageRgba8(
        RgbaImage::from_raw(info.width, info.height, rgba).ok_or("invalid RGBA size")?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(compression: u16) -> Vec<u8> {
        let mut bytes = b"8BPS\0\x01\0\0\0\0\0\0\0\x03".to_vec();
        bytes.extend(1u32.to_be_bytes());
        bytes.extend(2u32.to_be_bytes());
        bytes.extend(8u16.to_be_bytes());
        bytes.extend(3u16.to_be_bytes());
        bytes.extend([0; 12]);
        bytes.extend(compression.to_be_bytes());
        let raw = [255, 0, 0, 255, 0, 0];
        match compression {
            0 => bytes.extend(raw),
            1 => {
                bytes.extend([0, 3, 0, 3, 0, 3]);
                for row in raw.chunks_exact(2) {
                    bytes.push(1);
                    bytes.extend(row);
                }
            }
            2 | 3 => {
                use std::io::Write;
                let raw = if compression == 3 {
                    [255, 1, 0, 255, 0, 0]
                } else {
                    raw
                };
                let mut writer =
                    flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
                writer.write_all(&raw).unwrap();
                bytes.extend(writer.finish().unwrap());
            }
            _ => unreachable!(),
        }
        bytes
    }
    #[test]
    fn raw_rle_zip_and_prediction_produce_identical_pixels() {
        for compression in 0..4 {
            let image = decode(&fixture(compression)).unwrap().into_rgba8();
            assert_eq!(image.dimensions(), (2, 1));
            assert_eq!(image.as_raw(), &[255, 0, 0, 255, 0, 255, 0, 255]);
        }
    }
    #[test]
    fn malformed_and_unsupported_files_fail_without_panicking() {
        let bytes = fixture(1);
        for end in 0..bytes.len() {
            assert!(decode(&bytes[..end]).is_err());
        }
        let mut unsupported = fixture(0);
        unsupported[23] = 16;
        assert!(decode(&unsupported).is_err());
        unsupported[23] = 8;
        unsupported[25] = 4;
        assert!(decode(&unsupported).is_err());
        assert!(unpack_row(&[127], &mut [0; 2]).is_err());
        assert!(unpack_row(&[255, 4], &mut [0; 1]).is_err());
    }
}
