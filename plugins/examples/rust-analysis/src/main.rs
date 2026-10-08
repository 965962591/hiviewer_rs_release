use hiviewer_plugin_sdk::{Result, Transport, json, serve};
fn main() -> Result<()> {
    serve(
        "org.hiviewer.example.rust-analysis",
        "1.0.0",
        Transport::Framed,
        |method, params, ctx| {
            if method != "analyze/files" {
                return Err("unknown method".into());
            }
            let files = params["files"].as_array().ok_or("files required")?;
            let mut rows = Vec::new();
            for (index, file) in files.iter().enumerate() {
                let path = file["path"].as_str().ok_or("path required")?;
                let metadata = std::fs::metadata(path)?;
                rows.push(json!([file["filename"], metadata.len()]));
                ctx.progress((index + 1) as f64 / files.len().max(1) as f64, path)?;
            }
            let report =
                json!({"title":"Rust file analysis","columns":["File","Bytes"],"rows":rows});
            ctx.binary("report.json", report.to_string().as_bytes())?;
            Ok(report)
        },
    )
}
