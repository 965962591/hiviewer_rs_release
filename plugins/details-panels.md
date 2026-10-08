# 详情面板扩展

插件可在主界面的图片、视频“详情”侧栏追加独立区块。支持 Worker/Sidecar 返回报告，也支持 `handler: "view"` 内嵌自定义 HTML。Host API 仍为 1.0.0，Manifest / API 版本仍为 1；旧宿主不认识 `details-panel`，需要包含此扩展点的宿主。

## 注册

在现有 manifest 的 `contributions` 中增加：

```json
{
  "id": "extra-details",
  "kind": "details-panel",
  "title": "扩展信息",
  "command": "run",
  "mediaTypes": ["image", "video"]
}
```

`command` 引用 `commands` 中已有的 ID。`mediaTypes` 只接受 image/video，省略表示两类；空列表和重复值被拒绝。一个命令可以同时被工具贡献和详情贡献引用。`title` 支持 `%key%` 与 manifest.localizations；TypeScript SDK 提供 `PluginContribution` 类型。

启用插件并打开详情后，在“插件详情”中展开对应区块。每次只展开一个区块，收起即释放会话。默认全部收起，不会因为安装或选中文件就运行代码。重新加载按钮可重试失败、重新计算或重建视图。

## 当前文件与生命周期

- `api.selection.get()` 在详情中返回当前详情文件的单项快照，与主表格的多选集合无关；需要 `selection.read`。从命令面板直接运行同一命令时仍使用主表格选择。
- 图片和视频共用入口，通过 `mediaTypes` 决定是否显示。图片 EXIF 读取需要 `metadata.read`；视频工具可使用既有 `media.video` 或授权 sidecar，本扩展未增加视频元数据 API。
- 切换文件、文件 mtime/大小变化、插件更新或配置 revision 变化时，旧会话销毁，已展开区块为新文件重新加载。关闭详情、收起区块或停用/卸载插件也会终止会话；旧结果不会写回新文件。
- Worker/Sidecar 在展开后延迟 200 ms 启动，复用 60 秒任务截止、取消和报告校验。报告支持标题、文本、表格，表格在侧栏内滚动；失败仅显示在本区块。
- View 高度为 320 px，复用 `allow-scripts` iframe、Host API 权限和语义 CSS 变量。语言/主题实时同步；Worker 不因语言切换重跑，重新加载使用当前语言。
- 当前支持本地文件；压缩包虚拟路径和网络 URL 不显示详情扩展。所有权限仍按 owner/session/revision 校验，无法从详情读取其他路径。

## 可运行示例

自定义界面模板支持图片和视频的文件信息筛选，无需 Worker 构建：

```powershell
npm run plugin -- create plugins/my-details details-panel
npm run plugin -- check plugins/my-details
npm run plugin -- pack plugins/my-details plugins/my-details.hvp
```

在设置中从生成的目录或包安装、启用，再选中文件打开详情。`plugins/examples/details-panel/ui/view.js` 展示当前文件和语言同步；静态资源路径相对包根，HTML 中引用 `ui/view.js`。界面不得访问宿主 DOM 或裸 IPC。

报告示例 `plugins/examples/exif-provider` 已注册图片详情区块，仍保留原有 EXIF 工具命令。已有安装需要从更新后的目录或包重新安装并启用，宿主不会修改已安装插件的 Manifest。其他 Worker 返回符合 SDK `Report` 的结果即可；原生报告继续遵守 [Sidecar 契约](native-sidecars.md)。
