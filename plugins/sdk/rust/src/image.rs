//! Automatic still-image decoder protocol. Output must be oriented sRGB RGB8/RGBA8 PNG.
use crate::{Context, Result, Value, json};
pub const MAX_PIXELS: u64 = 32 * 1024 * 1024;
pub const MAX_SOURCE_BYTES: u64 = 256 * 1024 * 1024;

pub fn probe(width: u32, height: u32) -> Value {
    json!({"width":width,"height":height,"colorSpace":"srgb","orientation":1})
}

/// Send binary pixels before their JSON descriptor; the host consumes the named channel.
pub fn png(
    context: &mut Context<'_>,
    bytes: &[u8],
    dimensions: (u32, u32),
    source: (u32, u32),
) -> Result<Value> {
    context.binary("image", bytes)?;
    Ok(
        json!({"channel":"image","mime":"image/png","width":dimensions.0,"height":dimensions.1,
        "sourceWidth":source.0,"sourceHeight":source.1,"colorSpace":"srgb","orientation":1}),
    )
}
