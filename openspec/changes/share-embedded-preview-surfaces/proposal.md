## Why

Agent、Canvas 与 Assets 的内置预览仍存在 package-local 图片、音频和视频组件，主 Preview 又拥有另一套播放器。当前 `quick`、`embedded`、`main` presentation 参与 Viewer 选择，导致同一资源在不同入口使用不同元素生命周期、媒体准备、错误处理和适配规则。Canvas 普通节点还保留独立 media host/player 路径，因此会出现主 Preview 可播放 WebM、Canvas 却拒绝或卡在准备阶段的问题。

产品只需要两套 UI：Agent/Canvas/Assets 共用的轻量预览 UI，以及主面板独立的完整预览 UI。两套 UI 必须组合同一个 Preview Viewer 与相同的 Host 资源处理能力；全屏只是调用方容器，不是第三种预览模式。

## What Changes

- `@neko/preview-webview` 只公开一个 `LightweightPreview` 轻量组件给 Agent、Canvas 和 Assets；删除 `QuickPreviewSurface`、`EmbeddedPreviewSurface` 及 `main | quick | embedded` Viewer 分发。
- 主 Preview 保留独立 View/session、标题栏、完整控制 UI 和持久 snapshot，但通过同一个 Viewer kernel、图片元素、音频播放器和视频播放器渲染内容。
- 图片、音频和视频统一使用同一 `PreviewMediaDescriptor`、授权资源 URL、加载/错误/释放规则以及原生 `<img>`、`<audio>`、`<video>` 终点。轻量与主面板差异仅由 UI 参数、外层 chrome 和 snapshot owner 表达。
- Canvas 普通图片、音频和视频节点改用 `LightweightPreview`，删除 Canvas 自有 `InlineVideoPlayer`、`InlineAudioPlayer` 及其独立成功路径；Canvas 仍拥有节点、选择、工具栏和播放意图。
- Canvas 全屏 Overlay 也组合同一 `LightweightPreview`；Overlay 只负责尺寸、背景、关闭、焦点和快捷键隔离。
- Agent 与 Assets 保留卡片、集合和业务操作，媒体 body 统一使用 `LightweightPreview`；多图网格缩略图可由集合外壳裁切，但单资源预览不得复制 Viewer。
- Desktop 对 Agent、Canvas、Assets 和主 Preview 使用相同的 exact-resource registration 与 `openneko://resource` Range 能力；调用方不得自行按扩展名建立另一套可播放格式判断。
- Cut 时间线监视器继续是独立编辑执行端点，不属于单资源预览 UI。

## Capabilities

### New Capabilities

- `embedded-preview-surfaces`: 定义一个共享轻量预览 UI、一个独立主面板 UI以及唯一 Viewer/资源处理链。

### Modified Capabilities

- `desktop-media-consumer-projection`: 将 Agent、Canvas、Assets 与主 Preview 的单资源图片、音频和视频收敛到相同 descriptor、resource registration 和 Viewer 能力。

## Impact

- `@neko/preview-domain`：继续拥有唯一 `PreviewMediaDescriptor` 和授权会话契约。
- `@neko/preview-webview`：拥有唯一 Viewer kernel、`LightweightPreview`、主面板组合和媒体元素生命周期。
- `@neko/agent-webview`、`@neko/canvas-webview`、`@neko/assets-webview`：只保留调用方外壳并组合轻量组件。
- `apps/neko-desktop`：只负责精确 ContentLocator 授权、资源注册、Range 响应和 lease 生命周期。
- `@neko/cut-*`：时间线监视器不变。
