## Context

`@neko/preview-webview` 的 `SharedImagePreview` 是 Lightweight Preview 与 Main Preview 的唯一图片终点。Canvas 普通节点和 Canvas 全屏 Overlay 均组合 `LightweightPreview`，Desktop 为两者投影相同语义的原始 `viewer-source`。当前 `<img>` 自身没有确定的宽高，只依赖 `max-width: 100%`、`max-height: 100%`；在 CSS Grid 与固定高度父容器内，浏览器可能把长图布局为超出容器的替换元素，随后由 Viewer 裁切。

### Five-layer analysis

| Layer          | Decision                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Preview Webview 拥有图片元素的 fit、居中、缩放与错误 presentation；Canvas 只拥有节点和 Overlay 外壳。                 |
| Dependency     | 只修改 Preview L2 scoped CSS 与测试；不引入 Canvas、Desktop、Node 或媒体处理依赖。                                    |
| Interface      | `PreviewMediaDescriptor`、`LightweightPreview` props、Canvas node size 和 Desktop IPC 均不变。                        |
| Extension      | 所有图片调用方继续命中 `SharedImagePreview`；不新增 caller mode、专用 renderer、fallback source 或重复适配参数。      |
| Test           | 单元测试锁定 canonical CSS；真实 Chromium 用极端长宽比验证图片布局框、可见首尾标记、节点/全屏比例与缩放后的受控裁切。 |

## Goals / Non-Goals

**Goals:**

- 图片默认以完整内容适配当前 Viewer，保持 intrinsic aspect ratio，不拉伸、不裁切。
- 同一修复同时覆盖 Canvas 节点、Canvas 全屏、生成结果卡片及 Main Preview。
- 保持用户主动缩放/平移时由 Viewer 边界裁切的既有交互语义。

**Non-Goals:**

- 不根据图片 intrinsic dimensions 自动改写已持久化的 Canvas node size。
- 不修改图片文件、生成缩略图、裁剪资源或增加 Host 图像处理。
- 不重做图片缩放控件、snapshot contract 或 Canvas Overlay chrome。

## Decisions

### 1. 在 canonical 图片 Viewer 中建立确定的 contain box

图片元素使用 `width: 100%` 与 `height: 100%` 占满 Viewer 的确定布局框，`object-fit: contain` 在该框内计算实际绘制区域。这样长图、宽图和与节点比例不一致的图片都在初始 scale 1 下完整可见；多余空间由调用方现有媒体背景呈现。

不使用只设置一轴、JavaScript 读取 `naturalWidth/naturalHeight` 或按图片尺寸改写 Canvas 节点。前者仍会受替换元素 intrinsic sizing 影响，后两者把 Viewer presentation 泄漏到 Canvas durable layout，并增加异步重排与第二事实来源。

### 2. 保留既有缩放与裁切边界

现有 transform 继续作用于确定的图片框。初始/重置 scale 1 表示“适合容器”，完整显示；用户主动放大或平移后，超出 Viewer 的部分继续被局部裁切，这是显式交互结果，不是默认展示缺陷。compact Surface 不暴露缩放控件，始终以初始 contain presentation 展示。

### 3. 不在 Canvas 增加补丁路径

Canvas 节点和全屏 Overlay 不添加 `<img>`、ratio CSS、intrinsic-size state 或 `chrome` 分支。两者继续通过 `@neko/preview-webview/root` 的 `LightweightPreview` 命中 `SharedImagePreview`，从而让相同 descriptor 在所有 Surface 使用同一布局算法。

## Boundary inventory

| Owner / role                         | Canonical path                              | Producer -> consumer                         | Runtime boundary             | Replaced path / user-data impact |
| ------------------------------------ | ------------------------------------------- | -------------------------------------------- | ---------------------------- | -------------------------------- |
| `@neko/preview-webview` L2           | `/root` -> `SharedImagePreview`             | descriptor -> native `<img>`                 | Browser replaced-element CSS | 修正既有样式；无用户数据变化     |
| `@neko/canvas-webview` L2            | `PreviewSurface` / fullscreen Overlay       | exact node/output -> `LightweightPreview`    | Canvas scene presentation    | 无新增或替代路径；节点尺寸不变   |
| `@neko/preview-domain` L0            | canonical `PreviewMediaDescriptor`          | authorized projection -> Viewer              | 严格 descriptor              | contract 不变                    |
| `apps/neko-desktop` composition root | existing Canvas/Preview resource projection | exact `viewer-source` -> opaque resource URL | Electron trust boundary      | 生产代码不变；原始内容不变       |

## Risks / Trade-offs

- [图片框铺满容器后 transform 以容器中心为基准] → 与当前居中和 scale 1 语义一致；通过全屏 zoom/reset 测试验证。
- [透明或极端比例图片出现更明显留白] → 留白是保持原图完整和比例的必然结果，继续使用现有媒体场背景，不伪造裁切或拉伸。
- [视频/音频样式被误改] → selector 严格限定 `.neko-preview-viewer--image > img`，并运行相邻媒体回归。

## Migration Plan

1. 添加长图/宽图 canonical CSS 与浏览器布局断言。
2. 原子更新共享图片 Viewer 的 scoped 样式。
3. 验证 Canvas 节点、全屏和 Main/Lightweight Preview；确认调用方没有新增图片适配路径。

无 durable data 或 contract 迁移；回退该 scoped 样式即可恢复旧 presentation，不保留 feature flag 或双路径。

## Open Questions

无 apply-blocking open question。
