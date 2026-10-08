# 开发、调试与发布

[返回开发指南](README.md) · [快速入门](quick-start.md) · [AI 开发模板](ai-development.md)

本文面向独立插件作者。先在开发目录验证，再安装到桌面；每次修改均通过重新安装更新版本副本。

## CLI 命令

所有命令在 Hiviewer 仓库根目录执行，`<dir>` 是插件源码目录。

| 命令 | 行为与边界 |
| --- | --- |
| `npm run plugin -- create <dir> <template>` | 复制模板及需要的 SDK；目录必须不存在 |
| `npm run plugin -- build <dir>` | 将 main.ts 打包成 main.js；没有 main.ts 时直接返回；不类型检查、不编译 Rust、不构建 UI 框架 |
| `npm run plugin -- check <dir>` | 校验 manifest、包路径、所需入口及文件限额；不执行代码，不验证解码结果 |
| `npm run plugin -- dev <dir>` | 先执行上述 build，再启动浏览器模拟器；无 Rust sidecar |
| `npm run plugin -- pack <dir> <output.hvp>` | 收集运行文件、生成摘要和 ZIP；不 build、不创建父目录、不覆盖已有文件 |

模板名：`image-analysis`、`image-viewer`、`video-viewer`、`exif-provider`、`details-panel`、`rust-analysis`、`psd-decoder`。省略模板时使用 image-analysis；详情侧栏开发见[详情面板扩展](details-panels.md)。

`create` 保留模板身份；首次开发先替换 ID、名称、作者。复制到不同层级后，manifest 的相对 `$schema` 路径可能不再有效，应指向仓库的 `plugins/schema/manifest.v1.json` 或去掉该可选字段；不要改 apiVersion 来修复编辑器提示。

`build` 的 `.hiviewer-build/` 是临时输出；安装和打包读取插件根的 main.js。使用 UI 框架时由插件自己的构建配置把静态产物输出到 ui/，引用路径须满足[视图指南](views.md)。

## 推荐迭代顺序

1. 修改 manifest 和源码。涉及 Rust 时同步握手身份、版本与 target。
2. TS 执行[快速入门的类型检查](quick-start.md)；Rust 执行 cargo test/build。对解析、计算代码验证正常值、边界与损坏输入。
3. 构建 JS/UI，复制本机二进制到 bin/，执行 check。
4. Worker/View 在模拟器检查报告、布局、资源释放和取消。
5. 设置 → 自定义插件 → 从目录安装 → 启用 → 确认权限，在真实桌面验证。
6. 发布时提高 version，构建并 check，pack 到新文件，再从包安装复测。

仅改源码、重启 Hiviewer 或刷新目录不会更新已安装内容。不要修改宿主安装目录，否则包摘要校验会拒绝执行。更新、回滚后默认停用，需要重新启用。

## 浏览器模拟器能验证什么

启动 `dev` 后访问 `http://127.0.0.1:4179/__plugin`，上传文件、选择命令并运行。一次启动一个实例；端口 4179 被占用时关闭先前的开发实例。修改 main.ts 后重新 build 并刷新；修改 manifest 后重启 dev。

| 能力 | 模拟器行为 | 桌面验收内容 |
| --- | --- | --- |
| Worker/View 隔离 | 使用真实隔离容器 | 安装、授权、窗口生命周期 |
| selection | 来自浏览器上传文件 | 主窗口选择快照、真实路径 |
| metadata | 固定 Simulator 字段 | 真实 EXIF、缺失字段 |
| configuration | 空对象，不注入 manifest 默认值 | 默认值、设置保存与会话撤销 |
| media.preview | 浏览器读取可解码图片 | 宿主色彩归一、特殊格式与尺寸 |
| media.video | 上传后提供资源；上传最多 16 MiB | 本机文件流、Range、WebView 编码支持 |
| storage | 页面内 Map，刷新丢失 | 插件私有持久化、配额与更新保留 |
| viewer.compare | 输出路径 | 实际打开看图窗口 |
| exports.save | 浏览器下载 | 保存对话框、取消、不覆盖已有文件 |
| backend / assets.read | 未实现 | sidecar 启动、RPC、二进制、包资源读取 |
| 自动格式解码 | 未实现 | 新扩展名扫描、缩略图、双击看图 |

浏览器成功不代表原生插件或桌面安装成功。模拟器中为配置提供与 manifest 一致的回退值；不要为了模拟器而删除桌面权限声明。

## 桌面验收清单

按插件能力选择用例，在交付说明中记录平台、宿主版本、插件版本、测试文件特征与结果。

- **所有插件**：首次安装默认停用；启用后出现命令/格式；无选择时行为明确；重复运行不残留资源；错误能定位到输入。
- **报告**：表头与每行列数一致；空文件列表、字段缺失、较多文件不超报告限额；用户取消后可以再次运行。
- **视图**：预览尺寸标注明确；重复打开/关闭、停靠、独立窗口可用；语言和主题切换正常；导出取消和重名目标不会损坏原文件。
- **视频**：真实目标容器和编码可播放；暂停、跳转、替换资源、关闭窗口后可释放资源。
- **Rust**：在目标系统运行包内二进制；缺库、错误输入、进程崩溃和超时有明确错误；stdout 没有普通日志。
- **格式插件**：用真实文件验证主列表缩略图和双击看图；新增窗口首次加载、大小写扩展名、停用后失效、更新再启用刷新；详见[解码器验收](image-decoders.md)。

## 常见错误

下面列出当前实现的诊断码；底层 IO、JSON 解析或业务错误也可能直接显示错误文本。先保留完整错误，再按前缀定位。

| 现象 / 错误 | 检查与处理 |
| --- | --- |
| `plugins/invalid-manifest` | 检查具体后缀；ID/配置 key 小写，version 为三段数字，无未知字段；用 check 复现 |
| 缺少 main.js / bin 文件 | build 后再 check；Rust 需手动编译并复制到 executable 声明路径 |
| `plugins/permission-denied` | 核对 manifest 权限，重新安装并启用；运行代码不能自行增加授权 |
| `plugins/path-not-selected` | 仅向媒体、元数据或 compare API 传入本次 selection 快照中的路径；新选择需重新运行/打开 |
| `plugins/resource-expired` / `plugins/session-expired` | 不复用关闭、取消、重装或停用前的句柄；重新获取资源 |
| `plugins/stale-revision` | 配置/版本已变化；结束旧操作，从当前启用版本新建会话 |
| `plugins/installed-package-modified` | 安装文件被改动；从源码重新构建并安装，不能手改 checksums 绕过 |
| `plugins/incompatible-platform` | target 必须对应本机 OS/架构，包内也必须是该平台二进制 |
| `plugins/start-failed` | 检查程序文件、目标系统动态库、执行权限和错误详情 |
| `plugins/invalid-handshake` | 核对 serve 的 ID、version、协议与 manifest，确认 stdout 仅协议数据 |
| `plugins/undeclared-method` | 将 method 声明到 commands 或 imageDecoders；不使用 host/、plugin/ 保留前缀 |
| `plugins/request-timeout` / `plugins/decoder-timeout` | 单 RPC 30 秒；自动解码总计 35 秒含排队。减少工作量并限定输入，不无限重试 |
| `plugins/no-binary-frame` | 使用 framed；先发帧再返回描述；channel 对应且仅消费一次 |
| `plugins/use-stream-url` | 视频资源使用 url 播放，不能 readBytes 读取整段视频 |
| `plugins/unsupported-web-video` | 核对容器与 WebView 编码能力；宿主不自动转码 |
| `plugins/invalid-report` | title 字符串，columns/rows 成对，行长一致，单元格为有限数字/字符串/布尔/null |
| `plugins/message-too-large` / `plugins/storage-quota` | 精简报告；像素走媒体/二进制；storage 只保存小型 JSON 状态 |
| `plugins/incompatible-data-version` / `plugins/incompatible-retained-data` | 与已有/保留数据不兼容；保持数据兼容，或明确由用户选择卸载并删除数据后重装 |
| `plugins/format-conflict` / `plugins/builtin-format` | 扩展名已由启用插件或内置解码器提供；不能覆盖内置格式 |
| `plugins/decoder-size-mismatch` / `plugins/decoder-requires-rgb8` | JSON 尺寸须与真实 PNG 一致；输出 sRGB RGB8/RGBA8、已归一方向 |
| `plugins/decoder-source-limit` / `plugins/decoder-dimensions-limit` | 文件超过 256 MiB 或源/输出尺寸超限，须明确拒绝，不能伪报尺寸 |

PSD 能独立解码却不显示时，还应检查宿主版本是否包含前端动态格式注册、插件是否重新启用，以及文件是否属于示例支持的 RGB8 合成图；见[自动图片格式](image-decoders.md)。

## 发布与维护

发布包旁附 README/发行说明，包含功能、权限用途、目标平台、宿主/API 基线、格式限制、安装和验收步骤。根目录 README 不会自动打进 .hvp。给 AI 或其他作者继续维护时，同时提供源码、锁文件、构建命令和 SDK 来源。

同 ID 是同一插件的版本；修改 ID 会新建独立安装。version 每次发布递增；dataVersion 仅描述数据兼容性，不跟随代码版本递增。当前没有迁移回调，更新、回滚和保留数据后重装都要求 dataVersion 一致。

用户自行下载后在设置选择本地 .hvp/ZIP 或目录安装。无需签名、密钥或仓库配置；摘要用于发现内容变化，不证明作者身份。原生程序以用户权限运行，发行说明应明确其文件、网络和系统访问行为。
