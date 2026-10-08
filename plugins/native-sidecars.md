# Rust sidecar 开发

[返回开发指南](README.md) · [协议参考](api-v1.md) · [自动格式解码](image-decoders.md)

sidecar 是插件包中的本机程序，通过 stdin/stdout JSON-RPC 与宿主通信。适合本机库、文件解析和计算。它以当前用户权限运行，`native.execute` 表示用户信任执行，不是操作系统沙箱。

## 1. 创建自包含项目

```powershell
npm run plugin -- create plugins/acme-file-analysis rust-analysis
```

CLI 会复制 Rust SDK 到该插件的 `sdk/` 并修正 Cargo 路径。使用 Rust 1.96.0 / Edition 2024；Windows 需要 MSVC 工具链及 Windows SDK。下面示例完整对应 Windows x86_64。

替换插件 `Cargo.toml`：

```toml
[package]
name = "acme-file-analysis"
version = "1.0.0"
edition = "2024"
publish = false

[dependencies]
hiviewer-plugin-sdk = { path = "sdk" }
```

替换 `manifest.json`：

```json
{
  "manifestVersion": 1,
  "apiVersion": 1,
  "id": "com.example.native-file-analysis",
  "name": "Rust 文件分析",
  "version": "1.0.0",
  "author": "Your name",
  "description": "通过本机 Rust 程序读取所选文件的大小。",
  "entry": "main.js",
  "permissions": ["selection.read", "native.execute"],
  "commands": [
    { "id": "run", "title": "Rust 文件分析", "contexts": ["selection"], "requiresSelection": true, "handler": "sidecar", "method": "analyze/files" }
  ],
  "backend": {
    "executable": "bin/acme-file-analysis.exe",
    "target": "windows-x86_64",
    "transport": "stdio-framed"
  },
  "dataVersion": 1
}
```

替换 `src/main.rs`：

```rust
use hiviewer_plugin_sdk::{json, serve, Result, Transport};

fn main() -> Result<()> {
    serve(
        "com.example.native-file-analysis",
        env!("CARGO_PKG_VERSION"),
        Transport::Framed,
        |method, params, context| {
            if method != "analyze/files" {
                return Err("unknown method".into());
            }
            let files = params["files"].as_array().ok_or("files required")?;
            let mut rows = Vec::new();
            for (index, file) in files.iter().enumerate() {
                let path = file["path"].as_str().ok_or("path required")?;
                let metadata = std::fs::metadata(path)?;
                rows.push(json!([file["filename"], metadata.len()]));
                context.progress((index + 1) as f64 / files.len().max(1) as f64, "Reading files")?;
            }
            Ok(json!({"title":"Rust file analysis","columns":["File","Bytes"],"rows":rows}))
        },
    )
}
```

三个身份必须一致：manifest.id 与 `serve` 的 ID；manifest.version 与 Cargo 版本；manifest.backend.executable 与实际复制的二进制。Cargo package name 可以不同于插件 ID，它决定默认二进制文件名。

## 2. 编译、复制和打包

```powershell
cargo test --manifest-path plugins/acme-file-analysis/Cargo.toml
cargo build --release --manifest-path plugins/acme-file-analysis/Cargo.toml --target-dir plugins/acme-file-analysis/target
New-Item -ItemType Directory -Force plugins/acme-file-analysis/bin | Out-Null
Copy-Item -LiteralPath plugins/acme-file-analysis/target/release/acme-file-analysis.exe -Destination plugins/acme-file-analysis/bin/acme-file-analysis.exe
npm run plugin -- check plugins/acme-file-analysis
New-Item -ItemType Directory -Force plugins/artifacts | Out-Null
npm run plugin -- pack plugins/acme-file-analysis plugins/artifacts/acme-file-analysis-1.0.0-windows-x86_64.hvp
```

本最小程序未自带业务单元测试；作者应为真实计算/解析代码增加有效用例。`npm run plugin -- build` 不编译 Rust、不复制原生二进制。浏览器 `dev` 不启动 sidecar，必须在桌面从目录/包安装并启用，选中文件运行。

`node plugins/tools/build-examples.mjs` 用于仓库自带示例，不会自动构建任意新建的自定义目录。

## 3. 平台映射

| manifest target | 常见 Rust target |
| --- | --- |
| windows-x86_64 | x86_64-pc-windows-msvc |
| windows-aarch64 | aarch64-pc-windows-msvc |
| macos-x86_64 | x86_64-apple-darwin |
| macos-aarch64 | aarch64-apple-darwin |
| linux-x86_64 | x86_64-unknown-linux-gnu |
| linux-aarch64 | aarch64-unknown-linux-gnu |

一份包声明一个 target。在目标系统编译/验证后分别打包；macOS/Linux 二进制通常无 `.exe`，同步修改 executable 和复制命令。只修改 target 字符串不会把 Windows 程序变成 macOS 程序。交叉编译还需要对应 linker、系统库和 SDK；上表不是跨编译已配置的承诺。

当前目录是安装包根，持久化写入 `HIVIEWER_PLUGIN_DATA_DIR`。另提供 `HIVIEWER_PLUGIN_ID`、`HIVIEWER_PLUGIN_VERSION`。宿主清理继承环境，仅传入有限的 PATH/系统/临时目录/语言变量；不能假设开发 shell 的自定义变量或密钥会被继承。需要的本机库随包放入 bin/，验证在无开发环境的机器上能启动。

## 4. 请求、日志和二进制

- 独立 sidecar 命令接收 `{files, configuration}`；未授予 `selection.read` 时 files 为空。
- Worker/View 的 `api.backend.invoke(method, params)` 只发送调用方提供的 params，不自动补充 files。需要文件列表时先 `selection.get()` 再传入。
- 允许的方法来自 `commands[].method` 与 `imageDecoders[].probe/decode`。`host/*` 回调、前端向 sidecar 的二进制输入目前未开放。
- stdout 只能输出协议；用 `eprintln!` 写诊断到 stderr。`println!("started")` 会破坏协议。Worker/View 可调用 `api.backend.logs()` 读取本会话最近日志。
- 使用 `context.binary("result", bytes)` 先发二进制，再返回描述；前端 `api.backend.readBinary("result")` 读取并消费一次。JSONL 不支持二进制，使用 `Transport::Framed`。
- 握手由 Rust SDK 处理，协议版本为 1；详细帧布局见 [API v1](api-v1.md)。

混合 Worker/View 插件可在同一命令声明 `method` 白名单，然后自行调用后端。不要把所有方法放进字符串约定而漏掉 manifest 声明。

```ts
// 位于 Worker 命令中；manifest 需同时声明 selection.read/native.execute 和 analyze/files。
const files = await api.selection.get();
const result = await api.backend.invoke('analyze/files', {
  files,
  configuration: api.configuration,
});
```

## 5. 生命周期和资源约束

原生 RPC 截止 30 秒，普通命令截止 60 秒；UI 常驻不等于单个 RPC 可以无限运行。视图中的长任务应拆成有界请求。每次自动图片 probe/decode 使用独立会话与进程，不能依赖上次 probe 留下的内存状态。

取消、关闭、停用、更新、配置变化会撤销会话并结束进程树，不保证收到 `plugin/shutdown` 或执行清理回调。持久化应采用可中断的写入方式，不能把必需保存工作留到进程退出。

原生 JSON 最大 8 MiB，二进制帧最大 64 MiB，前端报告仍受普通消息限额约束。解析文件时自行限制内部解压、线程和内存规模；宿主的协议限额不是子进程的 OS 内存限制。
