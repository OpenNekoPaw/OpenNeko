## Why

Canvas 路线浮层同时提供 Storyline 与 Matrix，但 Matrix 的路线族、行列对齐、过滤、折叠和独立焦点状态并不符合当前以剧情顺序、分叉、节点定位和预览为主的创作任务。当前通用 Canvas adapter 默认只产生一条 canonical route，Matrix 仍在 compact 模式下持续投影，增加了 UI 与运行时复杂度，也形成第二条路线交互路径。

## What Changes

- **BREAKING** 删除 Canvas 路线 Matrix、路线比较模式及其运行时状态、投影、样式、国际化和测试路径。
- 将 Storyline 设为唯一的 Canvas 路线表面，以横向、顺序优先的节点图展示选中路线。
- Storyline 节点保留 `CanvasPlaybackUnit.sourceNodeId`；用户激活或显式切换节点时只执行一次 Canvas viewport 定位并更新同一 Preview/播放 session，不写入 Canvas selection 或持久播放高亮。
- 多路线仍由 `CanvasPlaybackRouteCandidate` 表达，并通过 Storyline 的路线选择与共享节点投影消费；不得恢复 Matrix 或创建第二份持久路线模型。
- Storyline 不使用时长比例布局；时间只作为播放与 Seek 的内部状态或授权节点详情数据，不在 Storyline 控制区展示。
- 将 Matrix 原本承载的真实诊断、媒体状态和键盘可达性迁移到 Storyline 节点或路线级反馈。
- Storyline、单一播放控制条与 Preview 统一归属 Canvas 内同一个 Overlay，不再保留常驻路线面板或独立 Preview surface。
- `PlaybackWorkspace` 只负责编排 session；Storyline、控制条和可折叠 Preview 由一个 `StorylinePlaybackOverlay` 组件整体渲染，不再保留并列的 Storyline 与 Preview 视觉组件。
- 每次切换显示 Storyline Overlay 时，Preview 媒体内容默认折叠，只保留顶部 Storyline、控制条和必要的 Overlay 外壳；本次 Overlay 生命周期内首次播放或进入铺满模式后自动展开完整 Preview。
- Preview 展开后不再跟随播放、暂停、结束或退出铺满模式自动折叠；只有关闭并重新显示 Storyline Overlay 才恢复默认折叠状态。
- 同一个 Overlay 始终以无 backdrop、非模态的顶部停靠条呈现，条外 Canvas 保持可交互；Preview 展开时保持相同顶部锚点、宽度和外壳，只在控制区下方向下增加内容，不切换为第二种居中模态界面。
- Storyline 使用类似横向 Git graph 的节点与分支线表达多路线拓扑；节点保持紧凑，仅显示序号和短标题，媒体状态与诊断进入视觉状态、tooltip 与 accessible label。
- Canvas Toolbar 使用专用 Storyline 分支图标打开或关闭 Overlay，不再复用通用播放三角图标。
- 播放按钮组始终水平居中；控制区不显示当前时间或总时长文本，Seek 仅保留无时间标签的进度反馈。
- Storyline 不再重复显示“故事线 + 当前路线”标题行，也不保留常驻路线 Tab；单路线不显示选择器，多路线只显示一个紧凑路线选择器，路线分支和节点仍在同一图内可直接选择。
- 上一节点、播放/暂停、下一节点是唯一主 transport；路线切换不再复制为 transport 按钮。受该 transport 控制的 Preview 未启动态不渲染第二个播放按钮。
- Storyline 固定为可容纳约 2～3 条 lane 的紧凑高度，更多路线通过既有滚动视口浏览；不得因铺满或 Preview 展开恢复为高占用区域。
- Preview 折叠时在 Overlay footer 提供明确的“显示预览”动作；该动作与播放一样只锁存当前 Overlay 生命周期的展开状态，展开后不提供普通模式或铺满模式下的独立隐藏动作。
- Canvas 音频节点采用面向画布创作的单卡片布局：文件标题、可 Seek 的波形轮廓、时间、居中播放/暂停与音量控制直接归属节点表面；Storyline Preview 继续使用紧凑横向 transport。两者共享同一播放生命周期，不嵌套第二层播放卡片。

## Capabilities

### New Capabilities

- `canvas-storyline-graph`: 定义 Canvas 唯一 Storyline 路线表面、横向剧情节点图、路线选择、源节点定位、诊断和播放同步契约。

### Modified Capabilities

## Impact

- 影响 `packages/neko-canvas/packages/webview` 的 Playback workspace、Toolbar、Zustand session、路线投影组件、样式、国际化和测试。
- 影响 `packages/neko-types` 的共享图标入口，新增无 Canvas 业务状态的通用 Storyline 图标。
- 删除 `RouteStoryboardMatrixView`、`routeStoryboardMatrix` 及 Matrix-only store API，不保留隐藏开关或 compatibility fallback。
- 不修改 `.nkc` schema、`CanvasPlaybackPlan`、`CanvasPlaybackRouteCandidate`、`CanvasPlaybackUnit`、Extension/Webview message、Engine、Proto 或 Cut handoff。
- 继续复用现有单一 `CanvasPlaybackController`、Preview surface 和 source node reveal；统一 Overlay 不改变 Canvas viewport 尺寸，也不创建独立播放 session。
