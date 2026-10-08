# Hiviewer 插件架构

范围：图片分析、图片显示处理、视频显示、EXIF 扩展、图片/视频详情侧栏，以及自动图片格式提供器。安装仅使用本地目录或下载好的 .hvp / ZIP；不提供签名校验、仓库安装或工作流执行器。

## 基线与参考

参考 [DBX commit 89964da](https://github.com/t8y2/dbx/tree/89964dafe411b6ad36d3db1ac03b0915ff52627c) 的 manifest、host bridge、sidecar runtime、installer 和 SDK 结构。采用架构思路，媒体与解码契约由 Hiviewer 独立定义。DBX 使用 Apache-2.0；如移植源码必须保留版权与修改说明。

React 19.2.6 / TypeScript 7.0.2 / Vite 8.0.16 / MUI 9.0.1 / Tauri 2.12.0；Host API 1.0.0、Manifest 1、Sidecar Protocol 1、Media Protocol 1。

## 模块与所有权

| 目录 | 职责 |
| --- | --- |
| src/hiviewer/plugins/ | 设置中心、命令注册、Worker/iframe 消息桥、视图工作区、格式路由及刷新 |
| src-tauri/src/plugins/ | manifest、包校验、版本化存储、权限、会话、资源和 sidecar |
| src-tauri/src/plugins/formats/ | 内存扩展名注册表、原生解码协议、限额和结果校验 |
| src-tauri/src/commands/hiviewer_plugins.rs | 插件管理和 Host API 的唯一 IPC 入口 |
| plugins/sdk/ | 独立的 JS/TS 与 Rust SDK |
| plugins/examples/psd-decoder/ | 宿主外的 PSD 解析、ICC 转换、PNG 输出 |

Rust 拥有安装 revision、授权、会话和资源；前端仅持有显示/运行状态。安装与设置使用进程互斥和跨进程文件锁、原子 JSON。回滚检查 dataVersion，避免旧代码读取不兼容数据。

## 执行形态

1. Worker：单文件 ESM；opaque iframe 创建 classic Worker，再动态 import。60 秒截止；取消销毁容器。
2. View：包内 HTML/CSS/JS，iframe 仅 allow-scripts；宿主负责停靠、标签与独立窗口，实时同步主题/语言。选择快照固定。
3. Sidecar：Rust 原生程序，JSON-RPC 2.0、身份握手、JSONL 或二进制分帧；stdout 为协议，stderr 为日志。Windows 隐藏窗口/Job Object，Unix 进程组负责回收。

native.execute 授权原生代码以当前用户权限执行；API 权限/CSP 不构成原生 OS 沙箱。Host API 每次检查 owner、session、revision 和权限。

## 详情面板

详情扩展由 `detailsRegistry.ts` 读取 `details-panel` 贡献，`PluginDetailsSections.tsx` 挂载到图片/视频共享详情滚动区。每次只展开一个扩展，Worker/Sidecar 复用 `runPlugin` 与报告渲染，View 复用隔离 iframe。当前详情文件、mtime、size、插件 revision 或命令变化时销毁旧会话；收起、关闭和停用同样清理。语言/主题变更不重启任务，View 继续接收环境事件。

## 自动图片格式

```text
安装/启用/配置 -> Store -> formats 注册表 -> 格式变化事件
目录过滤 -> 注册表查扩展名（不启动解码器）
缩略图/大图/统计 -> formats runtime -> scoped sidecar -> 有界 PNG
PNG -> 既有缩略图、Compare、直方图和 ROI 管线
```

提供器声明 extensions/probe/decode，要求 image.decode 和 native.execute。内置格式不可覆盖；相同扩展名启用冲突时失败。全局最多两个格式 RPC 同时执行，排队/握手/调用合计 35 秒截止，单 RPC 30 秒。

响应为已归一方向的 sRGB RGB8/RGBA8 PNG；JSON 尺寸必须匹配实际二进制。完整图片保持原始尺寸，缩略图遵循 maxEdge。源文件最大 256 MiB，源/输出最大 32 Mi 像素，单边最大 32768；二进制帧最大 64 MiB。

缩略图、比较和统计缓存键包含 revision。停用后不使用旧键；迟到结果被会话/revision 校验拒绝。专用格式变化事件刷新当前目录、文件夹/搜索缩略图和看图窗口；普通命令不重扫目录。生命周期监控同步其他应用实例的激活变更。

自动解码不依赖前端窗口；JS/TS Worker 继续承担分析和界面扩展。远端及压缩包内部格式识别不在当前注册表范围。详情见 [image-decoders.md](image-decoders.md)。

## 本地安装与数据

inspect -> 用户确认 -> 再核对摘要 -> 不可变包目录 -> 原子激活记录。摘要用于损坏和确认后替换检测，不验证发布者身份。拒绝路径穿越、链接/Windows 重解析点、重复路径和资源超限。

安装、升级、回滚后默认停用；启用时授予声明权限。配置更改产生新 revision 并撤销旧会话。卸载默认保留数据，可选择删除；保留数据继续约束重装的 dataVersion。JSON 存储每插件 256 KiB。

## 验证

前端构建、三语、Schema/CLI、真实 sidecar 协议、PSD 像素、生产目录/缩略图/Compare 链路分别测试。结果记录 [verification.md](verification.md)，浏览器模拟器不能等同于完整桌面验收。
