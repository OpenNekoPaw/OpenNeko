# NekoCut

> VS Code 内的轻量 OTIO 视频剪辑器。

## 当前能力

- `.otio` 是唯一可写工程格式，支持新建、打开、保存、另存、备份和恢复。
- workspace 内媒体原地链接；workspace 外显式选择/拖入的媒体由 Host 原子复制到 `.otio` 同目录的 `media/`，不覆盖既有文件、不转码。`ExternalReference.target_url` 始终按 `.otio` 文件目录保存为 POSIX 相对路径。
- 基础编辑最多支持 5 个轨道：固定 1 个 Video、最多 3 个 Audio、最多 1 个 Subtitle；支持向指定轨道 link/relink、同类轨道内/之间拖拽、split、trim、ripple delete、Gap、undo/redo 和音频 gain/mute/fade。
- Subtitle Track 初版可链接 SRT/VTT 并在时间线排列；当前媒体 adapter 尚不支持字幕预览叠加或导出烧录，非空字幕轨导出会明确报错。
- 视频 Clip 默认保留内嵌音轨及独立静音按钮；显式“分离音频”创建引用同一媒体和范围的 Audio Clip，不生成 WAV。分离关系不会自动静音任一输入。
- 预览、PCM、抽帧和 MP4 导出通过文档级媒体端口接入当前 Neko Engine；OTIO Core 不依赖 Engine 类型。
- 项目 Inspector 可选择电视（16:9）、电影（2.39:1）、短视频（9:16）和方形（1:1）画布；尺寸持久化到 OTIO profile，并由自适应 Preview 与后台导出共同消费。
- Canvas 只能把有序 workspace media/Gap 快照交给新 `.otio`，或追加到已打开的明确 `.otio` URI + revision；不推断 active/recent Cut。

不支持 NKV/NKC、专业/基础模式、旧 NKV Minimap、多视觉层、变速、转场、富文本字幕编辑/样式/生成、调色、效果、关键帧、遮罩、形状或插件面板。基础时间线提供只读 OTIO Timeline Overview，用于查看整体结构和滚动 viewport；它不拥有项目状态或媒体缓存。

## 结构

```text
packages/neko-cut/
├── packages/domain/     # Host-neutral OTIO subset、命令、投影和文档会话
├── packages/extension/  # VS Code 文件生命周期、路径授权、Engine adapter
└── packages/webview/    # revisioned TimelineView 的基础编辑界面
```

Webview 只保存 selection、playhead、zoom、volume 等临时展示状态。持久事实、revision、dirty state 和 undo/redo 由 `CutDocumentSession` 持有；所有修改 intent 都携带 document URI、session ID 与 expected revision。

详细约束见 [Cut OTIO 与 VS Code 媒体运行时 ADR](../../docs/architecture/adr-cut-otio-vscode-media-runtime-boundary.md)。
