mod psd;
use hiviewer_plugin_sdk::{Result, Transport, image as protocol};
use std::{
    fs::File,
    io::{Cursor, Read},
};

fn main() -> Result<()> {
    hiviewer_plugin_sdk::serve(
        "example.psd-decoder",
        "1.0.0",
        Transport::Framed,
        |method, params, context| {
            if !matches!(method, "psd/probe" | "psd/decode") {
                return Err("unknown method".into());
            }
            let path = params["path"].as_str().ok_or("missing path")?;
            let mut file = File::open(path)?;
            if file.metadata()?.len() > protocol::MAX_SOURCE_BYTES {
                return Err("PSD exceeds 256 MiB".into());
            }
            if method == "psd/probe" {
                let mut header = [0; 26];
                file.read_exact(&mut header)?;
                let info = psd::header(&header)?;
                return Ok(protocol::probe(info.width, info.height));
            }
            let mut bytes = Vec::new();
            file.take(protocol::MAX_SOURCE_BYTES + 1)
                .read_to_end(&mut bytes)?;
            if bytes.len() as u64 > protocol::MAX_SOURCE_BYTES {
                return Err("PSD exceeds 256 MiB".into());
            }
            let mut image = psd::decode(&bytes)?;
            let source = (image.width(), image.height());
            if !params["maxEdge"].is_null() {
                let edge = params["maxEdge"]
                    .as_u64()
                    .filter(|n| (1..=32768).contains(n))
                    .ok_or("invalid maxEdge")? as u32;
                if image.width().max(image.height()) > edge {
                    image = image.thumbnail(edge, edge);
                }
            }
            let mut output = Cursor::new(Vec::new());
            image.write_to(&mut output, image::ImageFormat::Png)?;
            protocol::png(
                context,
                &output.into_inner(),
                (image.width(), image.height()),
                source,
            )
        },
    )
}
