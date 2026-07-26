## Why

Canvas 路线浮层同时提供 Storyline 与 Matrix，但 Matrix 的路线族、行列对齐、过滤、折叠和独立焦点状态并不符合当前以剧情顺序、分叉、节点定位和预览为主的创作任务。当前通用 Canvas adapter 默认只产生一条 canonical route，Matrix 仍在 compact 模式下持续投影，增加了 UI 与运行时复杂度，也形成第二条路线交互路径。

## What Changes

- **BREAKING** 删除 Canvas 路线 Matrix、路线比较模式及其运行时状态、投影、样式、国际化和测试路径。
- 将 Storyline 设为唯一的 Canvas 路线表面，以横向、顺序优先的节点图展示选中路线。
- Storyline 节点保留 `CanvasPlaybackUnit.sourceNodeId`；激活节点时选择并定位真实 Canvas 节点，同时更新同一 Preview/播放 session。
- 多路线仍由 `CanvasPlaybackRouteCandidate` 表达，并通过 Storyline 的路线选择与共享节点投影消费；不得恢复 Matrix 或创建第二份持久路线模型。
- Storyline 不使用时长比例布局；时间只作为播放与 Seek 的内部状态或授权节点详情数据，不在 Storyline 控制区展示。
- 将 Matrix 原本承载的真实诊断、媒体状态和键盘可达性迁移到 Storyline 节点或路线级反馈。
- Storyline、单一播放控制条与 Preview 统一归属 Canvas 内同一个 Overlay，不再保留常驻路线面板或独立 Preview surface。
- `PlaybackWorkspace` 只负责编排 session；Storyline、控制条和可折叠 Preview 由一个 `StorylinePlaybackOverlay` 组件整体渲染，不再保留并列的 Storyline 与 Preview 视觉组件。
- Overlay 未播放时折叠 Preview 媒体内容，只保留顶部 Storyline、控制条和必要的 Overlay 外壳；播放开始后自动展开完整 Preview。
- 未播放、暂停或 stale 时，同一个 Overlay 以无 backdrop、非模态的顶部停靠条呈现，条外 Canvas 保持可交互；播放时切换为带 backdrop 的居中模态预览。
- Storyline 使用类似横向 Git graph 的节点与分支线表达多路线拓扑；节点保持紧凑，仅显示序号和短标题，媒体状态与诊断进入视觉状态、tooltip 与 accessible label。
- Canvas Toolbar 使用专用 Storyline 分支图标打开或关闭 Overlay，不再复用通用播放三角图标。
- 播放按钮组始终水平居中；控制区不显示当前时间或总时长文本，Seek 仅保留无时间标签的进度反馈。

## Capabilities

### New Capabilities

- `canvas-storyline-graph`: 定义 Canvas 唯一 Storyline 路线表面、横向剧情节点图、路线选择、源节点定位、诊断和播放同步契约。

### Modified Capabilities

## Impact

- 影响 `packages/neko-canvas/packages/webview` 的 Playback workspace、Toolbar、Zustand session、路线投影组件、样式、国际化和测试。
- 影响 `packages/neko-types` 的共享图标入口，新增无 Canvas 业务状态的通用 Storyline 图标。
- 删除 `RouteStoryboardMatrixView`、`routeStoryboardMatrix` 及 Matrix-only store API，不保留隐藏开关或 compatibility fallback。
- 不修改 `.nkc` schema、`CanvasPlaybackPlan`、`CanvasPlaybackRouteCandidate`、`CanvasPlaybackUnit`、Extension/Webview message、Engine、Proto 或 Cut handoff。
- 继续复用现有单一 `CanvasPlaybackController`、Preview surface 和 source node selection；统一 Overlay 不改变 Canvas viewport 尺寸，也不创建独立播放 session。
