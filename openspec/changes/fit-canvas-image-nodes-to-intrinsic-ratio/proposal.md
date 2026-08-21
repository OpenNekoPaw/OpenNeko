## Why

Canvas 的普通图片创建路径仍继承 `media` 的固定 `120×90` 默认尺寸和 `80×50` 最小尺寸。竖图、方图与超宽图因此不能用自身比例建立节点；部分 Workspace Board 图片虽然读取了比例，却只固定宽度并设置最小高度，极端竖图会形成过高节点，占用大量画布空间。共享 Preview Viewer 已能完整 contain 图片，但节点几何仍与图片事实不一致。

## What Changes

- Canvas domain 根据图片 intrinsic width/height 为新图片节点计算保持比例的初始尺寸，并将两轴限制在统一的紧凑边界内。
- Workspace Board 投影、Host material authoring 与 Canvas Webview 文件拖放复用同一尺寸策略；音频、视频、文档和无有效图片尺寸的来源保持当前 canonical 默认尺寸。
- Renderer 对图片节点使用按节点比例计算的最小尺寸，避免通用 `media` 最小值二次改变图片比例。
- 已有节点、Entity representation 替换和用户手动调整后的 durable size 保持不变。

## Capabilities

### New Capabilities

- `canvas-image-node-intrinsic-sizing`: 定义新图片节点读取原始比例、紧凑缩放及跨创建入口一致性的语义。

### Modified Capabilities

- 无。

## Impact

- `@neko/canvas-domain` L0：拥有图片节点初始尺寸和最小几何策略，以及 Host/Webview 使用的单一纯函数。
- `@neko/canvas-node` L1：在已授权的本地图片边界读取有限字节并提取 intrinsic dimensions；不决定布局策略。
- `@neko/canvas-webview` L2：对浏览器 File 提取图片元数据并把它交给 domain 策略；不保存第二套尺寸算法。
- `@neko/content` L0：公开既有纯图片元数据探测器供 Canvas 边界复用，不新增文件格式解析路径。
- Durable Canvas contract shape 不变；只改变有有效 intrinsic dimensions 的新图片节点初始 `size`。
