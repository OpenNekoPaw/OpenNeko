## Why

Agent、Canvas、Assets 与主 Preview 目前重复实现图片、视频和音频的只读展示、加载状态、错误处理与原生媒体元素生命周期，导致样式、播放策略、资源授权消费和全屏行为不一致。需要建立由 Preview package 拥有的可嵌入只读 Viewer，同时保留各领域独立的卡片、节点、时间线和 View 生命周期。

## What Changes

- 在 `@neko/preview-webview` 建立明确分层的公共 Surface：轻量 `QuickPreviewSurface`、可嵌入沉浸式 `EmbeddedPreviewSurface` 与独立主面板 `PreviewRoot`，三者复用一个 package-owned Viewer registry。
- 轻量和沉浸式 Surface 只消费 Host 授权的 `PreviewMediaDescriptor` 与 opaque resource URL；图片使用 `<img>`，普通视频/音频分别使用原生 `<video>` / `<audio>`，不得接收 raw path 或自行解析 Workspace authority。
- Agent 保留消息卡片、Tool 状态、折叠和结果分组外壳，使用公共轻量 Viewer 渲染媒体内容；不再维护平行的图片、视频和音频成功渲染路径。
- Canvas 保留节点、快捷操作、结果组、播放协调与全屏 Overlay ownership；普通节点播放继续遵守 Canvas 的原生元素契约，沉浸式只读预览复用公共嵌入式 Viewer，不再跳转主 Preview。
- Assets/Resource Browser 的快速预览复用同一轻量 Viewer。
- 主 Preview 继续拥有独立 View/session、完整 image/video/audio/text/document/model Viewer、持久 presentation snapshot 与复杂文档/3D 生命周期。
- Cut 时间线监视器明确不接入单资源 Preview Surface；继续由 Cut 拥有双视频槽、Canvas 合成、PCM 主时钟与帧精确播放，仅复用 `@neko/media` 底层契约和 browser runtime。
- 文本编辑只保留 Canvas 的轻量 Markdown 节点编辑与 Text Editor 的完整文档 authoring；主 Preview 仅提供完整文本/Markdown 的只读查看，Agent 的 Streamdown/Markdown 展示不成为编辑器。
- 快捷操作由调用方外壳拥有；公共 Viewer 不解释裁剪、重绘、复制、加入参考、保存为素材或 Tool 状态。

## Capabilities

### New Capabilities

- `embedded-preview-surfaces`: 定义轻量、沉浸式与主 Preview 的职责、授权输入、原生媒体元素、文本展示/编辑边界、状态生命周期及各领域组合规则。

### Modified Capabilities

- `desktop-media-consumer-projection`: 将 Agent、Canvas、Assets 的只读嵌入式媒体展示收敛到 Preview package-owned Surface，同时保持 Canvas 普通播放与 Cut 时间线监视器的专用 canonical 路径。

## Impact

- `@neko/preview-domain`：扩展精确 owner identity 与授权 descriptor/session contract，以支持 Canvas 等嵌入式消费者；不引入通用 active owner 或内部 contract 版本字段。
- `@neko/preview-webview`：拥有公共 Viewer registry、轻量/嵌入式 Surface、临时与持久 snapshot 策略，以及媒体加载和释放行为。
- `@neko/agent-webview`：消息和 Tool 结果卡片保留业务外壳，删除平行媒体渲染实现并组合公共轻量 Surface。
- `@neko/canvas-webview`：全屏 Overlay 组合公共嵌入式 Surface；Canvas 节点与 Playback Workspace 的专用播放协调仅在证明确有一致契约后局部复用，不通过本变更强行替换。
- `@neko/assets-*`：Resource Browser 快速预览消费公共轻量 Surface。
- `@neko/text-editor-*`、`@neko/markdown`、`@neko/ui/markdown`：维持完整 authoring、共享 Milkdown engine 与只读 Markdown renderer 的既有 owner，不把编辑能力移动到 Preview。
- `@neko/cut-*`：生产监视器行为不变，并通过架构和测试明确排除通用单资源 Surface。
- `apps/neko-desktop`：只负责 sender/window 绑定、ContentLocator 授权、短生命周期资源投影和 package public Root wiring，不拥有 Viewer 或媒体业务策略。
