# 交给 AI 开发插件

[返回开发指南](README.md) · [快速入门](quick-start.md) · [开发与发布](development.md)

本页既可供作者准备需求，也可直接作为 AI 的开发约束。请给 AI 提供匹配宿主版本的源码仓库或至少 `docs/plugins/`、`plugins/sdk/`、`plugins/schema/`、`plugins/tools/` 和所选示例。CLI 运行还需要仓库的 Node 依赖；只给本文不能获得可执行 SDK。

## 1. 先选择扩展方式

| 用户目标 | 实现选择 | 关键限制 |
| --- | --- | --- |
| 计算图片指标并显示表格 | image-analysis Worker | 媒体 API 是最长边 2048 的 sRGB 预览 |
| 图片处理面板、交互和导出 | image-viewer View | 隔离 DOM，导出新文件；不覆盖输入 |
| 视频控件、标注或显示 | video-viewer View | 当前 WebView 编码能力；不自动转码 |
| EXIF 解读或派生字段 | exif-provider Worker/View | 只读报告/视图；增加 details-panel 贡献后可在图片详情侧栏显示 |
| 图片/视频详情扩展 | details-panel + Worker/View/Sidecar | 当前详情文件快照，按需展开、会话隔离，见 [详情面板扩展](details-panels.md) |
| 访问本机库或计算 | Rust sidecar，可结合 Worker/View | 声明 native.execute 和方法白名单；单 RPC 有时限 |
| 安装后列表缩略图和双击支持新格式 | imageDecoders + Rust sidecar | framed PNG 输出；image-viewer contribution 不能注册格式 |

用户要求当前 API 没有的能力时，先说明具体缺口。不要写出不存在的 API，或为了单个插件修改宿主格式白名单、私有 IPC、主窗口组件。

## 2. 阅读顺序与接口依据

1. 仓库 `AGENTS.md` 及其规则索引；插件边界在 `.codex/rules/09-插件系统契约.md`。
2. [开发首页](README.md)、[Manifest](manifest.md)、[Host API](api-v1.md)。
3. 对应专题：[视图](views.md)、[Rust](native-sidecars.md)、[自动格式](image-decoders.md)。
4. [`plugins/sdk/typescript/index.ts`](../../plugins/sdk/typescript/index.ts) 或 [`plugins/sdk/rust/src/lib.rs`](../../plugins/sdk/rust/src/lib.rs)：真实导出、方法签名和类型。
5. [`plugins/schema/manifest.v1.json`](../../plugins/schema/manifest.v1.json)、[`plugins/tools/cli.mjs`](../../plugins/tools/cli.mjs)、对应 [`plugins/examples/`](../../plugins/examples/)：可运行模板及工具行为。
6. 有歧义时核对 [`manifest.rs`](../../src-tauri/src/plugins/manifest.rs)、[`package.rs`](../../src-tauri/src/plugins/package.rs) 和 [`formats/runtime.rs`](../../src-tauri/src/plugins/formats/runtime.rs)。文档、Schema 提示不能替代桌面验证。

基线为 Host API 1.0.0 / apiVersion 1，TypeScript 7.0.2、Node 24.4.0、npm 11.4.2、Rust 1.96.0 / Edition 2024。SDK 来自本仓库，不编造 npm/crates.io 包名或版本。DBX 是架构参考，其插件格式不能直接套用。

## 3. 可直接复制的需求模板

将尖括号内容替换后交给 AI。未明确的项要求 AI 先检查现有代码并列出真正缺失的决策。

```text
请在 Hiviewer 仓库开发一个独立插件。

需求：
- 插件 ID：<例如 com.acme.image-inspector，小写且长期稳定>
- 功能和用户操作：<从哪里触发，完成什么任务>
- 输入：<选择文件/自动浏览格式；格式、尺寸、数量和异常样本>
- 输出：<报告列/交互界面/导出文件/主列表缩略图及双击看图>
- 扩展方式：<Worker / View / Rust sidecar / imageDecoders>
- 开发目录：plugins/<自定义目录，不修改官方 examples>
- 平台与宿主版本：<Windows x86_64 等；当前使用的 Hiviewer 版本>
- 语言：<JS/TS/Rust；是否需要本机库，是否涉及外部网络>
- 配置与数据：<配置项、默认值、需持久化的业务状态>
- 界面语言：<例如 zh-CN、zh-TW、en-US>
- 性能/范围：<最大输入、计算期限、不支持的输入及错误行为>
- 验收样本：<可使用的测试文件及预期结果>

执行要求：
1. 先读取 AGENTS.md、docs/plugins/README.md、ai-development.md，
   再读取对应专题、公开 SDK、Schema 和现有示例。
2. 先给出能力选择、文件清单、权限用途、输入输出契约和验收方法，
   识别当前 API 的缺口，再依据已确认范围编码。
3. 全部插件代码独立放在指定目录，运行资源放 ui/ 或 bin/。
   只用公开 SDK，不依赖 src/ 私有组件或 Tauri invoke。
4. manifest 与真实代码一致。配置 key 用小写 ID；
   Rust ID/version/transport/target/二进制路径保持一致。
5. 不引入签名校验、仓库安装或工作流。
6. 提供完整源码、manifest、必要锁文件、README、构建和安装命令。
   TS 显式类型检查；Rust 显式编译并复制到 bin/；然后 check、pack。
7. 执行与功能匹配的验证，记录命令、结果和未实测项。
   格式插件必须把真实主列表缩略图和双击看图列入验收；
   不能把 CLI check、模拟器或 cargo build 成功当成桌面显示已通过。
8. 最终给出生成的 .hvp 路径、支持范围、权限说明和迭代方式。
   不修改用户原始图片，不清除已有插件数据来掩盖问题。
```

## 4. 代码交付检查

- **可复制**：代码块标明文件和完整/片段；交付文件不保留占位函数；命令可从仓库根目录执行。
- **可安装**：构建结果在 main.js/ui/bin，check 通过；.hvp 中 manifest 直接在根目录；pack 前先 build。
- **可维护**：拆分解析、计算与 UI 代码；SDK 仅用公开接口，Rust 依赖锁版本，说明第三方库/资源许可证。
- **可诊断**：异常说明输入及原因；sidecar 日志写 stderr；不无限重试、不把解码失败返回空白成功图。
- **资源正确**：图片句柄 release，ImageBitmap close，自建 Blob URL revoke；不把媒体 URL/token 持久化到 storage。
- **数据正确**：selection 为当前会话快照；预览不能当全尺寸原图；JSON 报告字段与列数匹配。
- **生命周期正确**：配置、重装、停用后旧会话失效；取消可能强制结束进程/Worker，不依赖退出回调保存必需数据。
- **范围真实**：明确支持格式、颜色/位深、平台和限额；没有测试的平台标为未验证。

## 5. 区分插件迭代与宿主扩展

普通插件迭代在插件目录完成，经构建、check、重装、启用验证。自动格式插件遵守 imageDecoders 后由宿主统一接入，无需为 PSD 等扩展名单独写分支。

只有确需新增公开能力时才进入宿主扩展：先定义契约，再同时更新 Schema、SDK、Rust 校验/分派、前端桥、示例和文档，并执行宿主回归。文件归属见[架构文档](architecture.md)。不能只在说明中增加一个未实现的 capability。
