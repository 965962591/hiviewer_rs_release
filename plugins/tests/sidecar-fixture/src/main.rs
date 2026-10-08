//! Deliberately broken subprocesses used only by host lifecycle tests.
use serde_json::json;
use std::io::{BufRead, Write};
fn main() {
    let id = std::env::var("HIVIEWER_PLUGIN_ID").unwrap();
    if id.ends_with("crash") {
        std::process::exit(7);
    }
    if id.ends_with("malformed") {
        println!("invalid JSON");
        return;
    }
    let mut lines = std::io::stdin().lock().lines();
    let init: serde_json::Value = serde_json::from_str(&lines.next().unwrap().unwrap()).unwrap();
    let identity = if id.ends_with("bad-handshake") {
        "wrong.identity"
    } else {
        &id
    };
    println!(
        "{}",
        json!({"jsonrpc":"2.0","id":init["id"],"result":{"protocolVersion":1,"plugin":{"id":identity,"version":"1.0.0"}}})
    );
    std::io::stdout().flush().unwrap();
    // Never read stdin again: an unbounded synchronous writer would hang here.
    loop {
        std::thread::park();
    }
}
