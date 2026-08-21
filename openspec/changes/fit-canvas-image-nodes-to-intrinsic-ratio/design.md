## Context

图片节点尺寸当前由三个入口分别决定：普通 headless/material authoring 使用 `media=120×90`，Canvas Webview 拖放通过 `buildCanvasNode` 使用同一固定值，Workspace Board 则以固定宽度和最小高度自行计算比例。Renderer 又把所有 `media` 节点限制为至少 `80×50`，会覆盖窄竖图或超宽图的比例。

### Five-layer analysis

| Layer          | Decision                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Canvas domain 拥有 durable 初始几何策略；Content 只解析图片元数据；Node/Webview 只在各自真实运行边界获取 intrinsic dimensions。    |
| Dependency     | Domain 纯函数不依赖 DOM、Node 或 Electron；Node 使用授权路径与纯 metadata probe；Webview 使用浏览器 File bytes。                   |
| Interface      | Host-resolved material descriptor 和 dropped-asset projection携带可选 dimensions；最终 Canvas node 继续只持久化 canonical `size`。 |
| Extension      | 所有图片创建入口调用同一 bounded-fit helper；未知尺寸明确使用当前 fresh default，不增加 legacy/fallback renderer。                 |
| Test           | 覆盖横、竖、方、极端比例、非法尺寸、Host import/reference、Workspace projection、Webview drop 和已有尺寸保留。                     |

## Goals / Non-Goals

**Goals:**

- 有效 intrinsic dimensions 的新图片节点保持原图比例。
- 新节点完整装入 `120×120` Canvas-unit 边界，避免长图或宽图过度占用空间。
- Renderer 最小尺寸不得改变图片节点的 durable 比例。
- 三类创建入口使用同一 domain 策略。

**Non-Goals:**

- 不自动修改已有 Canvas 节点或用户手动调整后的尺寸。
- 不强制用户后续等比缩放；自由调整仍是显式用户操作。
- 不探测视频比例，不生成缩略图，不改变图片文件。
- 不让无法读取 bytes 的 package resource 伪造尺寸。

## Decisions

### 1. Domain 用最大边界拟合 intrinsic ratio

`resolveCanvasImageNodeSize` 验证 width/height 为有限正数后，以 `120 / max(width, height)` 缩放两轴。长边固定为 120，短边保持比例；无有效尺寸时由调用方继续使用 `CANVAS_NODE_DEFAULT_SIZES.media`。该策略同时限制横向和纵向占用，不使用 Workspace Board 现有的固定宽度/最小高度分支。

### 2. 图片最小尺寸按当前节点比例计算

图片节点的 resize minimum 以当前 durable size 为比例，将长边的最小值设为 50，另一轴同比缩放。这样初始极端比例不会被通用 `80×50` 拉伸，同时仍保留可操作的长边。音频和视频继续使用通用 media minimum。

窄图片的外置标题允许使用图片节点最大边界 120 作为展示上限，不参与节点几何、碰撞或持久化，避免长图只显示单个字符。

### 3. 元数据获取留在真实运行边界

Node material authoring 对已授权 workspace path 或本次导入 bytes 调用 `probeImageMetadata`；生成结果优先使用已有 generation summary。Webview 原生 File drop 对即将提交的同一 bytes 调用相同纯 probe，并只把 dimensions 作为创建输入。解析失败时当前图片节点使用 canonical media default，并保持当前操作可用；这表示“未知 intrinsic size”的正常 fresh state，不切换 source、renderer 或 authority。

### 4. 已有 durable size 保持 authoritative

尺寸仅在 `node.create` 时计算。Entity representation replace 继续保留 current node size，加载既有文档和普通 renderer 不重算；用户手动 resize 后的 size 原样保存。

## Boundary inventory

| Owner / role              | Canonical path                   | Producer -> consumer                                 | Runtime boundary                   | Replaced path / user-data impact                      |
| ------------------------- | -------------------------------- | ---------------------------------------------------- | ---------------------------------- | ----------------------------------------------------- |
| `@neko/canvas-domain` L0  | `canvas-node-sizing`             | dimensions -> canonical node size/minimum            | host-neutral pure computation      | 替代固定比例与 Workspace 私有算法；仅新节点 size 改变 |
| `@neko/canvas-node` L1    | `CanvasMaterialAuthoringService` | authorized bytes -> resolved descriptor              | Node filesystem/Host authorization | 不新增 authority；解析失败局部返回未知尺寸            |
| `@neko/canvas-webview` L2 | Canvas file drop / node builder  | browser File bytes -> dropped asset -> domain helper | Browser File API                   | 替代 Webview 固定 media size；不持久化元数据副本      |
| `@neko/content` L0        | canonical image metadata probe   | encoded bytes -> dimensions                          | pure byte parsing                  | 仅扩大既有公共导出，无重复 parser                     |

## Risks / Trade-offs

- [极端比例图片的短边很窄] → 保持真实比例优先；长边仍为 120，节点标签和连接端点在外壳上保持可操作，并通过极端比例 UI 验证。
- [部分 package resource 无可读 bytes] → 保留固定 media fresh default，不伪造尺寸；后续若 owner 提供精确 metadata，可沿同一 descriptor 字段接入。
- [Webview 和 Node 都读取图片 bytes] → 它们是浏览器 File 与 Host authorized path 两个真实获取边界，解析算法仍只有 Content 一个 canonical probe。

## Migration Plan

1. 添加 domain 尺寸策略及单元测试，并让 Workspace projection 原子切换到该策略。
2. 在 Host material authoring 与 Webview File drop 投影有效 dimensions。
3. 更新图片专用 minimum，验证现有节点不被加载时重写。
4. 运行 focused tests、build、boundary/OpenSpec gate 和可见 UI 验证。

无持久化迁移、feature flag 或双写路径；回退代码会恢复旧的新建节点尺寸，不修改已经保存的用户数据。
