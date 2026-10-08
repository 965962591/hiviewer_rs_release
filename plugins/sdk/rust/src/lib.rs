//! Host protocol v1. stdout contains protocol frames only; use stderr for logs.
pub use serde_json::{Value, json};
pub mod image;
use std::io::{self, BufRead, BufReader, Read, Write};
pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
const MAX_JSON: usize = 8 * 1024 * 1024;
const MAX_BINARY: usize = 64 * 1024 * 1024;

#[derive(Clone, Copy)]
pub enum Transport {
    JsonLines,
    Framed,
}
pub struct Context<'a> {
    output: &'a mut dyn Write,
    transport: Transport,
}
impl Context<'_> {
    pub fn progress(&mut self, fraction: f64, message: &str) -> Result<()> {
        self.send(&json!({"jsonrpc":"2.0","method":"plugin/progress","params":{"value":fraction.clamp(0.0,1.0),"message":message}}))
    }
    pub fn binary(&mut self, channel: &str, bytes: &[u8]) -> Result<()> {
        if !matches!(self.transport, Transport::Framed) {
            return Err("binary frames require Framed transport".into());
        }
        if channel.is_empty() || channel.len() > 128 || bytes.len() + channel.len() + 2 > MAX_BINARY
        {
            return Err("binary frame too large".into());
        }
        let mut payload = Vec::with_capacity(2 + channel.len() + bytes.len());
        payload.extend_from_slice(&(channel.len() as u16).to_le_bytes());
        payload.extend_from_slice(channel.as_bytes());
        payload.extend_from_slice(bytes);
        frame(self.output, 1, &payload)
    }
    fn send(&mut self, value: &Value) -> Result<()> {
        let bytes = serde_json::to_vec(value)?;
        if bytes.len() > MAX_JSON {
            return Err("JSON message too large".into());
        }
        match self.transport {
            Transport::Framed => frame(self.output, 0, &bytes),
            Transport::JsonLines => {
                self.output.write_all(&bytes)?;
                self.output.write_all(b"\n")?;
                self.output.flush()?;
                Ok(())
            }
        }
    }
}
fn frame(output: &mut dyn Write, kind: u8, bytes: &[u8]) -> Result<()> {
    output.write_all(&((bytes.len() + 1) as u32).to_le_bytes())?;
    output.write_all(&[kind])?;
    output.write_all(bytes)?;
    output.flush()?;
    Ok(())
}
fn read(input: &mut impl BufRead, transport: Transport) -> Result<Option<Value>> {
    let mut bytes = Vec::new();
    match transport {
        Transport::JsonLines => {
            let count = input
                .take((MAX_JSON + 1) as u64)
                .read_until(b'\n', &mut bytes)?;
            if count == 0 {
                return Ok(None);
            }
            if count > MAX_JSON || bytes.last() != Some(&b'\n') {
                return Err("invalid JSONL frame".into());
            }
        }
        Transport::Framed => {
            let mut size = [0; 4];
            if input.read(&mut size[..1])? == 0 {
                return Ok(None);
            }
            input.read_exact(&mut size[1..])?;
            let size = u32::from_le_bytes(size) as usize;
            if size == 0 || size > MAX_JSON + 1 {
                return Err("invalid frame length".into());
            }
            let mut kind = [0];
            input.read_exact(&mut kind)?;
            if kind[0] != 0 {
                return Err("host binary input is not supported by this protocol version".into());
            }
            bytes.resize(size - 1, 0);
            input.read_exact(&mut bytes)?;
        }
    }
    Ok(Some(serde_json::from_slice(&bytes)?))
}

/// Identity must match manifest.json; handler errors become JSON-RPC errors.
pub fn serve(
    id: &str,
    version: &str,
    transport: Transport,
    mut handler: impl FnMut(&str, Value, &mut Context<'_>) -> Result<Value>,
) -> Result<()> {
    let mut input = BufReader::new(io::stdin().lock());
    let mut output = io::stdout().lock();
    let mut context = Context {
        output: &mut output,
        transport,
    };
    let mut initialized = false;
    while let Some(message) = read(&mut input, transport)? {
        if message["jsonrpc"] != "2.0" {
            return Err("invalid JSON-RPC version".into());
        }
        let method = message["method"].as_str().ok_or("missing method")?;
        if method == "plugin/shutdown" {
            break;
        }
        let result = if method == "plugin/initialize" {
            if message["params"]["plugin"]["id"] != id
                || message["params"]["plugin"]["version"] != version
            {
                Err("identity mismatch".into())
            } else {
                initialized = true;
                Ok(
                    json!({"protocolVersion":1,"plugin":{"id":id,"version":version},"capabilities":[]}),
                )
            }
        } else if !initialized {
            Err("not initialized".into())
        } else {
            handler(
                method,
                message.get("params").cloned().unwrap_or(Value::Null),
                &mut context,
            )
        };
        if let Some(request_id) = message.get("id") {
            context.send(&match result { Ok(value) => json!({"jsonrpc":"2.0","id":request_id,"result":value}), Err(error) => json!({"jsonrpc":"2.0","id":request_id,"error":{"code":-32000,"message":error.to_string()}}) })?;
        }
    }
    Ok(())
}
