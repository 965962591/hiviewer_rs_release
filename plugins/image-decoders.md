# 开发自动图片格式插件

[返回开发指南](README.md) · [Rust sidecar](native-sidecars.md) · [调试与发布](development.md)

本文用于让用户安装插件后，主列表缩略图和双击看图自动识别新格式。插件源码放在自己的目录；宿主的格式支持模块位于 `src-tauri/src/plugins/formats/`，前端路由及刷新订阅位于 `src/hiviewer/plugins/`。普通插件开发无需修改这些宿主文件。

`contributions.kind: "image-viewer"` 只注册一个工具入口。自动识别扩展名必须声明 imageDecoders，并提供 Rust sidecar；JS/TS Worker 不能单独实现这条自动解码链路。

## 用户体验

1. 下载对应平台的 `.hvp` / ZIP。
2. 设置 → 自定义插件 → 从包安装。
3. 启用并确认原生程序、自动格式读取权限。
4. 当前目录重新扫描，新格式自动出现在图片列表中，生成缩略图，双击使用现有看图窗口。文件夹图标、搜索缩略图也使用同一后端。

停用/更新/回滚/卸载会撤销旧会话、更新注册表、发出 `hiviewer:plugin-formats-changed`，并刷新目录与打开的看图窗口。更新、回滚后默认停用，重新启用才能继续解码。配置和安装状态变化会更新 revision；普通命令运行不重扫目录。

每个窗口通过只读 IPC `hiviewer_plugins_image_formats` 获取后端已验证的 `{ 扩展名: 提供器版本身份 }` 快照。`src/hiviewer/plugins/imageFormats.ts` 先订阅变化事件、再获取首次快照；只接受最新请求结果，更新格式判断后才通知 UI。`hiviewerMediaTypes.ts` 的可预览判断合并该快照，供列表缩略图、预览区、打开看图和导航共同使用。不能仅修改解码入口或向固定白名单添加 `psd`：前端过滤会在解码之前运行，且其他插件格式也必须生效。

## 从 PSD 模板开始

在仓库根目录创建独立项目：

```powershell
npm run plugin -- create plugins/local-psd psd-decoder
```

CLI 复制解析器、协议入口、锁文件及 sdk/，不复制 bin/ 和 target/。首次修改以下内容：

| 文件 | 修改内容 |
| --- | --- |
| manifest.json | 自己的 ID、名称、作者、版本；backend.target 对应平台；复制后修正或去掉可选 $schema 路径 |
| src/main.rs | serve 的 ID/version 与 manifest 一致；probe/decode 分派方法与声明一致 |
| src/psd.rs | 解析与色彩转换实现；开发其他格式时替换此模块并更新 mod/import |
| Cargo.toml | crate 版本、依赖与 SDK 路径；修改 package name 时同步二进制名称 |

Windows x86_64 下，保留模板 package name `hiviewer-psd-decoder` 时执行：

```powershell
cargo test --manifest-path plugins/local-psd/Cargo.toml
cargo build --release --manifest-path plugins/local-psd/Cargo.toml --target-dir plugins/local-psd/target
New-Item -ItemType Directory -Force plugins/local-psd/bin | Out-Null
Copy-Item -LiteralPath plugins/local-psd/target/release/hiviewer-psd-decoder.exe -Destination plugins/local-psd/bin/hiviewer-psd-decoder.exe
npm run plugin -- check plugins/local-psd
New-Item -ItemType Directory -Force plugins/artifacts | Out-Null
npm run plugin -- pack plugins/local-psd plugins/artifacts/local-psd-1.0.0-windows-x86_64.hvp
```

其他平台同步替换 target、可执行文件名及复制路径，见[平台映射](native-sidecars.md)。将来升级时重新编译、复制、打包；npm 的 plugin build 不会处理 Rust。

## Manifest

```json
{
  "manifestVersion": 1,
  "apiVersion": 1,
  "id": "your.image-decoder",
  "name": "My format decoder",
  "version": "1.0.0",
  "description": "Decode my image format",
  "author": "Your name",
  "entry": "main.js",
  "permissions": ["native.execute", "image.decode"],
  "commands": [],
  "backend": {
    "executable": "bin/my-decoder.exe",
    "target": "windows-x86_64",
    "transport": "stdio-framed"
  },
  "imageDecoders": [{
    "id": "my-format",
    "extensions": ["myformat"],
    "probe": "image/probe",
    "decode": "image/decode"
  }]
}
```

扩展名为 1–16 位小写 ASCII 字母/数字，无点、通配符、路径；每个提供器 1–32 个扩展名，每包最多 16 个提供器，不得重复。输入路径识别不区分扩展名大小写。probe/decode 必须不同，不能使用保留的 `host/`、`plugin/` 前缀。纯格式插件无需 main.js 文件。

内置图片/视频格式禁止被覆盖。同一扩展名只能由一个启用的插件提供；启用冲突返回 `plugins/format-conflict` 并保留原状态。没有根据文件内容自动猜测所有插件的回退链。

## 协议与尺寸

宿主通过现有 sidecar 握手检查 ID/版本/协议，然后调用声明的方法：

```json
{"path":"D:/images/example.myformat","configuration":{},"maxEdge":512,"maxPixels":33554432}
```

probe 仅读取头部，不应解压整张图片，返回完整的、已归一方向的尺寸。decode 返回完整图片（maxEdge 为 null）或不超过指定长边的等比例缩略图，不允许放大原图。

```rust
use hiviewer_plugin_sdk::image;
// probe
let description = image::probe(source_width, source_height);
// decode：PNG 字节先通过二进制帧发送，descriptor 再作为 RPC result。
let description = image::png(ctx, &png_bytes, (width, height), (source_width, source_height))?;
```

输出只接受 sRGB、Orientation 1 的 RGB8/RGBA8 PNG。插件负责应用源 ICC 和方向；无源 ICC 可以按 sRGB 解释，并在自己的文档中说明。宿主会核对二进制 PNG 的尺寸，不信任 JSON 声明；SVG、任意本地输出路径、Base64 像素和 URL 都不作为解码结果。

## 生命周期与性能

- 目录过滤只查内存注册表，不启动 sidecar，也不逐文件读取插件 manifest。
- probe / decode 在阻塞工作线程中调度；全局最多两个 sidecar 请求同时执行，35 秒截止包含信号量等待。每次请求使用独立会话与子进程，完成、失败或超时都释放进程树。
- 宿主校验插件 revision、权限、包摘要，以及输入文件的规范路径、长度和修改时间；停用后的迟到结果被拒绝。
- 缩略图磁盘/内存键、比较解码缓存和统计缓存都包含插件 revision；原有缓存容量限制与清理策略继续生效。配置、升级、切换提供器不会复用旧插件输出。
- 每个请求源文件最多 256 MiB；源与输出最多 32 Mi 像素且单边不超过 32768。输出二进制帧最大 64 MiB。超限返回错误，不截断图像或自动缩小大图冒充原图。
- 原生进程以当前用户权限运行。以上是宿主资源与协议限制，不是操作系统内存/文件/网络沙箱。插件应自行限制内部解压和线程开销。

## PSD 示例

```powershell
node plugins/tools/build-examples.mjs
New-Item -ItemType Directory -Force plugins/artifacts | Out-Null
npm run plugin -- pack plugins/examples/psd-decoder plugins/artifacts/psd-decoder-windows.hvp
cargo test --manifest-path plugins/examples/psd-decoder/Cargo.toml
```

示例依赖锁定 image 0.25.10、flate2 1.1.9、lcms2 6.2.0；不向宿主增加 PSD 解码依赖。实现只解析头部、ICC 资源及已保存的合成图，跳过图层/蒙版内容；读取全尺寸合成图后缩小生成缩略图。

支持 PSD v1、RGB 8 位、原始/RLE/ZIP/ZIP 预测压缩。负图层计数标记的合成透明度作为 alpha；其他额外 alpha 通道不用于显示。嵌入 ICC 转换到 sRGB，无 ICC 按 sRGB 解释。损坏 RLE、截断输入、超限尺寸明确失败。

不支持 PSB、CMYK、Lab、灰度、16/32 位和图层编辑；没有已保存合成图的文件无法显示。宿主当前大图渲染仍沿用现有 JPEG/RGB 比较流程，不保留可编辑图层，也不保证透明背景棋盘显示。后续可替换此 sidecar 的解析库并遵守同一输出契约。

自动格式扩展目前面向本机文件浏览和看图；远端服务器和压缩包内部格式过滤未接入此注册表。JS/TS 仍可开发分析/EXIF/显示处理插件；单纯的 Worker 不作为自动图片解码后端。

## 必须覆盖的验收

### 解析器与协议

- 正常文件：校验 probe 尺寸、实际 PNG 尺寸和已知像素，不能只检查进程返回成功。
- 缩略图：maxEdge 有值时保持比例且不放大；null 时返回全尺寸。每次请求独立，不依赖上一进程的 probe 状态。
- 色彩/方向：ICC 转 sRGB，应用方向，RGB8/RGBA8；声明尺寸和真实 PNG 必须一致。
- 异常输入：截断、损坏压缩、错误格式/位深、超限尺寸和超大文件明确失败；不要返回一张占位图当作成功。

### 真实桌面

1. 从本地包安装并启用，确认 image.decode 与 native.execute 均已授权。
2. 打开含目标格式的本机目录，确认文件纳入图片列表且出现实际缩略图。
3. 双击该文件打开看图子窗口，核对内容、尺寸与方向；新开窗口后再次验证。
4. 测试大写扩展名、多个文件与损坏文件，错误不阻塞其他图片。
5. 停用插件，确认格式不再可用；重新启用后恢复。
6. 更新包后确认默认停用，重新启用后列表与已打开窗口刷新，使用新版本输出。

只验证 sidecar、后端缩略图函数或 `cargo build`，不能证明前端主列表和看图已经接入。历史问题及修复证据见[验收记录](verification.md)。

### 文件出现但不显示

先检查是否启用、target 与二进制是否一致、是否有扩展名冲突，再核对输入是否在插件支持范围内。PSD 示例仅接受 RGB8 合成图，文件后缀正确不代表模式受支持。

若独立 sidecar 能返回有效 PNG，真实宿主仍无缩略图或无法打开，应确认使用的是包含动态格式快照接入的宿主版本。当前宿主已统一处理各插件扩展名；不要通过修改固定白名单或要求用户清空全部缓存来代替定位。
