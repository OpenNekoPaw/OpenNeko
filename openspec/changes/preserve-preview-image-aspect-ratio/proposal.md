## Why

Preview 的共享图片 Viewer 目前只对 `<img>` 声明 `max-width` 与 `max-height`。浏览器对替换元素的百分比最大高度不会在所有父布局中同时约束两轴：长图可能先按宽度缩放后仍高于节点，或在全屏容器内继续保持原始高度，最终被 Viewer 的 `overflow: hidden` 裁切。Canvas 节点和 Canvas 全屏预览复用该 Viewer，因此两处同时暴露相同缺陷。

## What Changes

- 由 Preview Webview 的共享图片 Viewer 明确提供完整可用的图片布局框，再用 `object-fit: contain` 保持原始宽高比并完整显示内容。
- 保持 Canvas 节点的 durable size、用户手动调整尺寸和全屏 Overlay 尺寸不变；比例不一致时允许留白，不拉伸也不裁切。
- 继续让 Canvas 节点、Canvas 全屏和 Main Preview 使用同一个图片 Viewer，不增加调用方专用图片渲染路径。
- 补充长图、宽图、节点尺寸与全屏尺寸的布局级测试和可见 UI 证据，并回归图片缩放与视频/音频 Surface。

## Capabilities

### New Capabilities

- `preview-image-contain-layout`: 定义共享图片 Viewer 在任意调用方容器内完整显示原图、保持比例和缩放的布局语义。

### Modified Capabilities

- 无。

## Impact

- `@neko/preview-webview` L2：拥有共享图片 Viewer 的浏览器布局与交互；仅修改 scoped Viewer 样式和相关测试。
- `@neko/canvas-webview` L2：继续作为节点与全屏 Overlay 调用方，不拥有图片适配算法，不改变 Canvas document facts。
- `@neko/preview-domain`、Desktop resource projection 与 `apps/neko-desktop`：contract、授权资源和生产代码均不变；仍投影精确原始 `viewer-source`。
