# 插件验收记录

## 详情扩展（2026-10-03）

新增 `details-panel` 贡献和 image/video 筛选；详情侧栏按需运行报告或隔离 HTML 界面，复用既有会话、权限和资源清理。Schema、TypeScript SDK、Rust/CLI 校验器、三语、EXIF 示例和自定义详情模板同步更新。

| 命令 | 本轮结果 |
| --- | --- |
| `npm run build` | TypeScript/Vite 通过；保留既有大 chunk 提示 |
| `npm run test:plugins` | 11 项 Vitest、4 项 Node 测试通过，覆盖详情筛选、单文件快照、会话身份、模板打包和非法贡献 |
| `npm run test:i18n` | 5 项通过；default.json 已重新生成 |
| `cargo test --manifest-path plugins/examples/psd-decoder/Cargo.toml` | 2 项通过 |
| `./plugins/tools/test-host.ps1` | 16 项通过，包含详情贡献校验和既有真实 PSD/原生进程回归 |
| `cargo check --manifest-path src-tauri/Cargo.toml` | 通过；既有 remote::uri::child 未使用警告 |
| `node .tmp/plugin-details-browser.mjs` | Windows Edge 中加载真实 Provider、详情组件、Worker 和 iframe；Host API 使用测试替身 |

浏览器断言通过：默认收起不执行；切换文件只返回当前文件；迟到旧结果不覆盖新报告；语言切换不重启报告；错误展示和重新加载；取消回收；revision 变更重启；停用清理；视频过滤；真实详情模板显示视频文件、响应语言变化并阻止访问父页面；关闭后 iframe 和会话清零。截图保存在本机 `.tmp/plugin-details.png`。

本轮未执行真实桌面安装流程、真实详情 sidecar 交互或 macOS/Linux 实机验证；浏览器 Host API 测试替身不等于桌面权限验收。详情扩展目前面向本地文件，压缩包虚拟路径和网络 URL 不显示扩展区块。历史记录保留如下。

日期：2026-09-30。环境：Windows x86_64、Node 24.4.0、Rust 1.96.0、Microsoft Edge。

## 本次执行

| 检查 | 结果 |
| --- | --- |
| npm run build | TypeScript/Vite 通过；保留既有大 chunk 提示 |
| npm run test:i18n | 6 项通过 |
| npm run test:plugins | 7 项路由/窗口格式同步 Vitest、3 项包/manifest Node 测试通过 |
| cargo test --manifest-path plugins/examples/psd-decoder/Cargo.toml | 2 项通过：4 种压缩像素一致、损坏/不支持输入失败 |
| node plugins/tools/build-examples.mjs | 两个 TS 示例、两个 Rust 示例和异常进程 fixture 构建，六个示例检查通过 |
| ./plugins/tools/test-host.ps1 | 15 项通过，含真实 PSD sidecar 的宿主全链路测试；运行约 32 秒，另计编译时间 |
| cargo check --manifest-path src-tauri/Cargo.toml | 通过；既有 build key / unused child 警告 |
| node plugins/tools/browser-check.mjs | 图片分析、EXIF、隔离和死循环终止通过 |
| PSD 本地包 | plugins/artifacts/psd-decoder-windows.hvp，可从设置选择安装 |
| git diff --check | 通过 |

## 自动格式集成测试

生产测试文件：src-tauri/src/plugins/formats/viewer_tests.rs，从既有 commands/hiviewer.rs 的测试模块调用真实生产函数。使用临时安装库、本地 RGB8 PSD fixture 和实际编译的 sidecar，不模拟解码结果。

- 安装默认停用；启用前目录图片过滤不接收 PSD，启用后大小写扩展名识别成功，文件夹预览纳入 PSD。
- probe 返回 2×1；PNG 解码得到红、绿两个准确像素；统计加载复用相同像素。
- 调用生产 get_thumbnail 生成可解码 JPEG 缩略图；调用 Compare 二进制准备函数得到正确尺寸和实际可解码的大图字节。
- 更新后自动停用；旧比较缓存不能继续使用。重新启用产生不同的缓存身份和缩略图路径。
- 同一扩展名的第二个插件启用失败；停用/卸载后从图片过滤与文件夹预览中移除。
- JSON 声明尺寸与 PNG 不符、超限尺寸、方向/色彩空间错误、非法 MIME 被拒绝。

既有插件测试覆盖：非法 ID/API/权限/配置、ZIP 穿越/Windows 别名、摘要篡改、Node 本地打包与 Rust 读取互通、更新撤销、回滚、数据保留与重装兼容、跨 owner 拒绝、配额、帧长度、Range、真实子进程握手/方法白名单/二进制结果，以及崩溃、非法 JSON、不读 stdin 时的取消和 30 秒截止。

## 独立 PSD 样本

运行 `node plugins/examples/psd-decoder/check-fixtures.mjs <psd-0.3.5/tests/fixtures>`，使用 crates.io psd 0.3.5 自带的 20 个第三方样本（没有复制到本项目）：18 个成功解码，尺寸与原始头部一致；2 个不支持的颜色/通道模式明确失败；green-1x1 的 RGBA 像素精确为 0,255,0,255。此结果不覆盖所有 Photoshop 版本或色彩配置。

## 浏览器结果

使用真实生产 sandbox.ts / workerBootstrap.js 和模拟 Host API：16×16 灰图平均亮度 128；EXIF 示例返回报告；Worker 中 document / __TAURI_INTERNALS__ 不可见，直接网络请求被 CSP 拒绝；死循环取消后 iframe 数量为 0。

上一轮图片/视频隔离视图的浏览器结果保留为历史证据，本次没有重新实测视图停靠、独立窗口或视频播放。

## 平台与手工验收边界

- macOS/Linux 未实机验证；需要各平台分别构建原生插件。
- 初次交付时 MCP 桌面连接不可达，仅完成生产链路测试；后续 PSD 故障回归已连接真实桌面，并由用户确认显示恢复正常，详见下节。设置选择文件和权限对话框的完整安装流程本轮没有重新测试。
- PSD fixture 覆盖 RGB8 合成图；未对完整真实 Photoshop 文件集合或各种 ICC 配置做兼容性认证。示例不支持 PSB、CMYK/Lab/灰度、16/32 位或图层编辑。
- 远端/压缩包内部格式过滤、超大型文件压力和所有视频编码未覆盖。自动格式 API 的限额和限制见 image-decoders.md。

Windows 测试 EXE 使用 plugins/tools/test-controls.manifest 嵌入 Common Controls v6，解决对话框依赖的 TaskDialogIndirect 加载问题；不修改系统 DLL。测试串行运行，避免全局会话配额导致用例互相干扰。

## PSD 不显示故障回归

用户现场文件 `hiviewer.psd` 为 32×32、RGB8、4 通道、5887 字节。检查已安装记录，插件已启用且权限完整；直接调用已安装 sidecar 成功返回 32×32 PNG，真实宿主 image_info 也能读出尺寸。故障发生在前端：`hiviewerMediaTypes.ts` 的固定白名单在缩略图请求和打开 Compare 之前过滤了插件格式，因此此前只测后端解码未覆盖此问题。

修复为读取后端已激活格式快照，并统一接入可预览判断。新增测试验证窗口首次加载、大小写/自定义扩展名、停用、同扩展名升级、事件订阅顺序、过期请求和卸载后迟到回调；原有后端集成测试增加格式快照与解码注册表一致性断言。

本轮实际通过：`npm run build`、`npm run test:i18n`（6 项）、`npm run test:plugins`（7 项 Vitest + 3 项 Node）、`cargo test --manifest-path plugins/examples/psd-decoder/Cargo.toml`（2 项）、`cargo check --manifest-path src-tauri/Cargo.toml`、`./plugins/tools/test-host.ps1`（15 项），以及 `git diff --check`。

真实桌面证据：修复前 open_compare 返回后窗口仍未打开；修复后通过 MCP 调用相同入口，compare_state 返回 1 个 tile，路径为用户的 `hiviewer.psd`。随后用户明确确认“已经 ok 了”。本轮 WebView 调试端口未成功启用，因此未将 DOM 像素检查计为通过，相关临时检查脚本已移除。没有修改原 PSD 或重新安装插件；修复位于宿主侧。

## 开发指南示例验证（2026-09-30）

本次补全文档后，直接从 Markdown 代码块提取示例到独立临时目录执行，避免测试代码与文档代码不一致。

| 对象 / 命令 | 本轮结果 |
| --- | --- |
| 文档相对链接、JSON 代码块 | 84 个链接存在；6 个 JSON 块解析成功 |
| quick-start.md：tsc → plugin build/check/pack | TypeScript 7 严格检查通过；生成可打包 main.js；实测发现并补上 `--ignoreConfig` |
| 文件概览命令 | 实际导入构建产物；默认双列、关闭大小列、空选择三种结果断言通过 |
| views.md：node --check → plugin check/pack | 提取的 view.js 语法通过；HTML/JS 与模板 manifest 可打包 |
| native-sidecars.md：cargo build --release --offline | 提取 Cargo.toml、manifest、main.rs，使用模板复制的 SDK，Windows x86_64 编译成功 |
| Rust 示例实际进程 | framed 握手身份、8 字节样本报告、空选择、进度、未知方法错误断言通过；复制到 bin 后 check/pack 成功 |
| npm run build | 通过；既有大 chunk 提示保留 |
| npm run test:plugins | 7 项 Vitest、3 项 Node 通过 |
| npm run test:i18n | 6 项通过 |
| git diff --check | 通过 |

本轮仅修改文档，没有重复运行完整宿主 cargo check/test、PSD 解析测试或桌面安装/显示流程；此前执行记录保留在上文。本轮视图只验证语法和打包，没有将浏览器交互、桌面导出、跨平台表现记为通过。验证用源码、二进制、包和临时构建缓存在完成后清理。
