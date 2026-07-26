## Context

`PlaybackWorkspace` 原本同时拥有 compact Storyline 与 `RouteStoryboardMatrix`。Matrix 删除后，Storyline 仍作为 Canvas 顶部 Overlay，而 Preview 位于右侧 stage；两者消费同一 PlaybackPlan 和 Controller，却形成两个播放视觉容器、两个 Toolbar visibility action，并要求 Canvas reveal 扣除 Overlay 遮挡区域。

通用 Canvas adapter 当前把 Markdown、Media 与 Group child order 投影成一条 canonical route；宿主提供的 PlaybackPlan 仍可包含多条 `CanvasPlaybackRouteCandidate`。本变更必须删除 Matrix 这条平行展示路径，同时保留多路线、节点身份、诊断、Preview 和播放生命周期。

### Five-Layer Analysis

| 层   | 决策                                                                                                                                                |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Canvas 节点与 sequence connection 是事实；PlaybackPlan 是路线契约；同一个 Overlay 承载 Storyline、单一 Controller 与 Preview。                      |
| 依赖 | Storyline 只消费 `@neko/shared` playback contract 与共享 UI，不新增 Extension、Engine 或持久化依赖。                                                |
| 接口 | 路线选择使用 `routeId`，节点选择使用 `unitId`，Canvas 一次性定位只使用 `sourceNodeId`；不写 Canvas selection，不保留 Matrix-only DTO 或 store API。 |
| 扩展 | adapter 可提供多条共享 unit 的路线；Storyline 由稳定 source identity 投影 lane/branch layout，不创建第二套路线事实或推断节点等价。                  |
| 测试 | 单元/组件测试证明 Overlay/全屏、分支投影、节点定位、路线切换、诊断、键盘和单一 Controller；Extension Host 验证真实 Webview 定位与 Preview。         |

## Goals / Non-Goals

**Goals:**

- 删除 Matrix 组件、投影、状态和模式切换，收敛到唯一 Storyline。
- 将 Storyline、播放控制与 Preview 全部移入同一个按需 Overlay，并支持 Webview 内全屏。
- 由一个 `StorylinePlaybackOverlay` 组件拥有 Storyline、控制条、折叠/展开 Preview 与 footer 的完整视觉结构；`PlaybackWorkspace` 不再组合两个并列视觉组件。
- 每次显示统一 Overlay 时将其停靠在 Canvas 顶部并默认折叠媒体 Preview，不渲染遮罩或阻断条外 Canvas；本次 Overlay 生命周期内首次播放或进入铺满模式后，保持同一顶部容器原位向下展开 Preview，不改变锚点、宽度、Storyline 高度或模态语义。
- Preview 一旦展开，在暂停、结束、stale 或退出铺满模式后仍保持展开；只有关闭并重新显示整个 Overlay 才重置为折叠状态。
- 以横向 Git graph 式节点和分支线展示路线拓扑；存在多路线时可辨识共享、分叉与汇合关系。
- 用专用 Storyline 分支图标替换 Toolbar 上容易被误解为立即播放的通用播放图标。
- 播放 transport 按钮居中，不展示当前时间/总时长文字；保留不带时间 tooltip 的 Seek 进度反馈。
- 删除重复的 Storyline 标题行和常驻路线 Tab；单路线不显示路线选择控件，多路线只显示一个紧凑 selector。
- 保持上一节点、播放/暂停、下一节点为唯一主 transport，不增加路线前后切换按钮；受控 Preview 不再提供第二个未启动播放入口。
- Storyline 视口只占约 2～3 条 lane 的高度，超出部分继续使用同一滚动视口；折叠 Preview 时提供一次性的“显示预览”动作。
- 点击剧情节点、切换路线或使用上一/下一节点时一次性定位其真实 Canvas source node，并同步 Preview session；不得选中 Canvas 节点或保持播放高亮。
- 保留播放、stale、媒体缺失与诊断的可观察性。
- 结构布局不再伪装成精确时间线。

**Non-Goals:**

- 不新增 Story、Scene、Shot、Beat 或路线持久节点。
- 不在 Storyline 中编辑 Canvas connection、拖拽排序或创建分支。
- 不修改 PlaybackPlan、Engine stream、Cut handoff 或 `.nkc` schema。
- 不保留隐藏 Matrix、compatibility flag、fallback renderer 或双投影。
- 不保留常驻 Storyline 侧栏、Preview 右栏、Preview resize state、浏览器 Fullscreen API 依赖或第二个 Controller presentation。
- 不从标题、位置或内容相似度推断共享剧情节点。

## Decisions

### 1. Storyline 是唯一 canonical route surface

删除 `PlaybackRouteViewMode` 和整个 `PlaybackMatrixState`。`PlaybackSessionState` 只保留路线、当前单元、播放头、焦点、Overlay visibility/presentation 和播放状态。Storyline 是唯一路线投影，但只存在于统一 Overlay 内。

未采用“先隐藏 Matrix、以后再启用”的方案，因为项目处于 prelaunch，隐藏路径仍会保留第二套状态、投影和测试事实来源，也会继续承担维护成本。

### 2. Storyline、控制器与 Preview 使用同一个按需 Overlay

Overlay 覆盖 Canvas 工作区但不改变 Canvas 布局尺寸，内部稳定顺序为：

```text
Playback Overlay
  -> Storyline branch graph
  -> centered previous / play-pause / next controls
  -> unlabeled seek progress
  -> media Preview surface (revealed for the current Overlay lifetime)
  -> title / diagnostics / full-bleed / close footer
```

每次显示 Storyline Overlay 时，它以无 backdrop 的紧凑条停靠在 Canvas 顶部，媒体 Preview 默认折叠，条外区域不接管 pointer events，也不声明模态语义，因此 Canvas 工具、节点和 viewport 仍可操作。本次 Overlay 生命周期内首次开始播放或进入 full-bleed presentation 后，同一个 Overlay 保持顶部锚点、宽度、Storyline 高度、控制区位置和非模态语义，仅在控制区下方增加 Preview 内容并向下扩展；不得重新居中、缩放外壳或增加暗色 backdrop。Preview 展开状态由 `StorylinePlaybackOverlay` 本地拥有并锁存，暂停、结束、stale 或退出 full-bleed 后不自动折叠；关闭整个 Overlay 后组件卸载，下一次显示才恢复默认折叠状态。用户可显式切换为铺满 Canvas Webview 内容区的 full-bleed presentation，再切回顶部 Overlay；full-bleed 中 Preview 始终可见且不提供隐藏动作。这里的“全屏”不调用浏览器 Fullscreen API，不逃逸 VS Code Webview，也不覆盖 VS Code 原生 chrome。Escape 关闭 Overlay，关闭时若正在播放则暂停。

Canvas Toolbar 的 visibility action 使用专用 Storyline 分支图标直接打开/关闭整个 Overlay，不再使用暗示“点击后立即播放”的通用播放图标，也不再提供 Storyline header 到 Preview 的第二次打开动作。图标作为无业务状态的共享 editor icon 进入 `@neko/shared/icons`，Canvas 只拥有按钮语义和 Overlay 状态。

`PlaybackWorkspace` 只负责编排 plan、session、Preview request 和 Canvas source reveal，并把单一 view model 交给 `StorylinePlaybackOverlay`。`StorylinePlaybackOverlay` 是 Storyline、控制条、条件 Preview 和 footer 的唯一视觉 owner，并以组件生命周期内的最小本地状态记录 Preview 是否已经被播放或 full-bleed 揭示；不得把该纯展示状态写入 playback session/store，也不得再由 `playbackState` 直接推导折叠。不得在 Workspace 中并列挂载 `StorylineGraph` 与 `PlaybackStage` 两个 surface。内部 graph 与 Preview markup 可以继续复用共享 Preview primitive，但不能拥有独立 visibility、边框容器或 session。

### 3. Storyline 使用顺序坐标，不使用时间坐标

每个可播放 unit 以稳定的横向顺序位置和紧凑节点按钮展示。连接线表达 sequence、分叉和汇合关系；节点宽度不得由 `durationMs` 决定。节点可见内容只保留序号/短标题，媒体类型、缺失状态与诊断通过形状、颜色、tooltip 和 accessible label 表达。播放时间仅作为 controller/Preview 的内部进度状态，不在控制区显示当前时间或总时长文字；Seek 仍可用无时间 tooltip 的进度条表达相对进度。Storyline 不渲染时间尺，也不把缺失时长的默认值显示为精确事实。

未采用当前 duration-proportional strip，因为它把结构导航误导成 Cut 时间线，并使长媒体破坏路线可读性。

### 4. 多路线通过同一 Storyline 选择，不恢复比较视图

当 PlaybackPlan 提供多条有效路线时，Storyline 将路线投影为共享横向进度轴上的 lane/branch graph；选中路线的节点和连接保持主视觉，其他路线降为次要视觉但仍可点击选择。不得恢复 Matrix row 或只显示当前路线而隐藏拓扑。

路线共享/汇合只能由相同 `CanvasPlaybackUnit.sourceNodeId`（并以 unit id 作为路径内 identity）或 adapter 提供的稳定 identity 证明；不得根据标题或内容相似度猜测。通用 adapter 只有一条 canonical route 时显示单一直线节点序列。

### 5. 节点定位使用一次性 source identity 导航

播放 session 同步与 Canvas viewport 导航必须是两条职责明确的路径。自动播放推进、播放/暂停和 Seek 只更新 session；Storyline 节点激活、路线切换与上一/下一节点操作才在更新 session 后执行一次 viewport reveal：

```text
Storyline node
  -> routeId + unitId
  -> CanvasPlaybackUnit.sourceNodeId
  -> reveal node once inside unobscured Canvas viewport
  -> update Preview/playback session
```

该路径不得调用 Canvas `selectNode`、不得写 `activePlayingNodeId`，因此不会触发 selection context toolbar、节点操作按钮或持续蓝色高亮。Storyline 不缓存 Canvas position，也不创建私有 node mapping。缺失 unit 或 source node 必须通过现有 diagnostic/stale 语义 fail-visible。

### 6. Matrix 与 Overlay 的真实信息迁移到 owning surface

- 路线选择进入 Storyline graph 的 lane/route controls。
- 节点媒体状态和单元诊断进入对应 Storyline 节点的形状/颜色、title 或 accessible label，不占用第二行正文。
- 路线级诊断保留在 Storyline diagnostic area。
- Group/container 结构由主 Canvas 和 Storyline 顺序共同表达，不保留 Matrix container fold。
- 键盘使用横向 list/navigation 语义，不保留 row/column/grid focus。
- 时长仅保留为播放运行时与授权节点详情数据，不在 Storyline 控制区或 Matrix duration range 中展示。

### 7. Canvas 音频节点与 Storyline Preview 共享播放核心、区分 owning layout

Canvas 音频节点和 Storyline Preview 都复用 `PreviewSurface`、`useMediaStream` 与 `InlineAudioPlayer` 的播放生命周期，但它们的 owning surface 职责不同：节点本身是可辨识的素材卡片，Storyline Preview 是统一 Overlay 中的媒体舞台。布局差异必须由显式 `audioLayout` 契约表达，不能再使用含义模糊的 `showWaveform` 布尔值。

Canvas 音频节点使用单张 node card：标题行位于节点顶部；中部为可 Seek 的波形轮廓和播放头；底部按三列放置当前/总时长、居中播放/暂停和右侧音量控制。这里的波形轮廓只承担导航与音频类型识别，不声明为媒体幅值分析结果。标题、波形区和控制区都直接属于既有 `BaseNode` 表面，不再套入第二张带边框、背景、圆角或阴影的播放卡片。

Storyline Preview 的媒体流启动后保持紧凑横向 transport：播放/暂停、当前/总时长、可伸缩 Seek 和静音依次排列。未受 Storyline controller 控制的独立 Preview 在未开始时保留启动按钮；受控 Storyline Preview 的未启动空态不提供第二个启动入口。Overlay footer 继续拥有标题。`audio-waveform` 仍是既有 preview source role，不修改共享 source contract。两个 layout 只分叉渲染结构，不分叉流、时钟、暂停、Seek、结束或资源释放逻辑。

### 8. Storyline 只保留一层路线选择与一个播放入口

Overlay 的 Storyline 区域不再渲染“故事线 + 当前路线”标题行。当前路线已经由选中分支、节点状态和必要时的路线选择器表达，重复标题既不增加导航能力，也占用本应显示 2～3 条 lane 的垂直空间。

路线只有一条时不渲染任何路线选择控件；路线超过一条时，在 Storyline 内仅渲染一个带 accessible label 的紧凑原生 selector。selector 只负责把 `routeId` 交给现有路线选择路径；所有路线分支继续同时显示，用户也可直接激活图中的节点来切换路线。不得保留 Tab row、第二个路线列表或隐藏 compatibility renderer。

主 transport 只保留上一节点、播放/暂停、下一节点，并继续显示当前节点计数。路线选择不复制为“上一路线/下一路线”按钮，因为路线切换是结构选择而非时间 transport；把两类导航混在同一按钮组会让按钮语义和禁用状态变得不稳定。

当 `PreviewSurface` 收到 `playbackControl` 时，表示播放生命周期由 Storyline controller 拥有。此时未启动的视频 poster 或音频空态只作为不可独立启动的媒体舞台，不再渲染自己的播放按钮；唯一启动入口是 Overlay 主 transport。媒体流启动后仍可保留 owning media surface 的 Seek、音量等媒体专属操作，但不得创建第二个播放 session 或独立请求 owner。未提供 `playbackControl` 的普通 Canvas 节点和独立 Preview 继续保留原有直接播放入口。

### 9. Storyline 高度有界，Preview 使用显式揭示动作

Storyline 的垂直尺寸按 lane 几何而不是视口比例无限增长。默认和 full-bleed presentation 都使用约 2～3 条 lane 的高度范围；第三条之后的路线继续由既有 `overflow: auto` 视口浏览。Preview 展开不得改变 Storyline 高度。小尺寸 Webview 也不得通过响应式规则把 Storyline 恢复为 230px 以上的高区域。

Preview 默认折叠时，footer actions 在 full-bleed 与 close 之前提供一个带 accessible label 的“显示预览”按钮。它只调用 `StorylinePlaybackOverlay` 已有的本地 `previewRevealed` latch，不写入 playback store、不开启播放、不创建新的 surface。点击后 Preview 在同一 Overlay 内展开，按钮随即消失；暂停、播放结束或退出 full-bleed 后 Preview 继续保持展开。full-bleed presentation 中 Preview 必须可见，因此不显示“隐藏预览”或任何独立折叠动作。关闭并重开整个 Overlay 仍是恢复默认折叠状态的唯一方式。

## Risks / Trade-offs

- [失去跨路线逐列审计] → 当前没有明确用户任务依赖该能力；未来若出现专业审阅需求，以独立 inspector 重新设计，不复活隐藏 Matrix。
- [多路线 lane 可能在密集图中变高] → 采用固定 lane 间距和横向滚动；只合并稳定 identity，不为压缩高度猜测拓扑。
- [删除大范围 CSS/i18n/tests 可能留下 residual] → 使用 legacy-debt、unused、focused typecheck/build 和 `rg` 断言清除 Matrix 标识。
- [Overlay 遮挡 Canvas] → 每次打开时 Overlay 仅占用顶部紧凑带；Preview 经播放或 full-bleed 展开后，同一外壳会持续向下覆盖 Preview 所需区域，直到用户关闭整个 Overlay，但外层始终透明且不截获条外 pointer events。需要独占查看时由用户显式进入 full-bleed。
- [Canvas 上下文工具穿透 Preview] → Overlay layer 的 stacking order 必须高于 Canvas selection/context toolbar 与 drop indicator，确保被 Overlay 实体区域覆盖的画布工具不会绘制在 Preview 上方。
- [Storyline 失去 Matrix 的诊断细节] → 节点和路线级 diagnostic 必须在 Storyline 可见且可通过键盘读取。
- [Canvas 节点波形可能被误解为真实幅值] → 明确将其限定为可 Seek 的音频轮廓，不向用户暴露幅值、采样或分析语义；真实播放时间和播放头仍来自 Engine stream。

## Migration Plan

1. 先增加 Storyline 唯一路径、节点定位、路线切换和非时间比例布局测试。
2. 将 Storyline strip 重构为结构化节点图，并迁移诊断与媒体状态。
3. 删除 Matrix render/projection/store/i18n/CSS/tests，并清理所有调用方。
4. 将 Storyline、单一控制条与 Preview 合并到唯一按需 Overlay/full-bleed presentation。
5. 删除 Preview stage width/resize 状态，把多路线投影为稳定 identity 驱动的 branch graph。
6. 运行 Canvas Webview 聚焦测试、typecheck/build、legacy/unused 检查。
7. 在隔离 Extension Development Host 中验证顶部非模态 Overlay、首次播放/铺满触发展开、暂停和退出铺满后保持展开、关闭重开后恢复折叠、Storyline、节点点击、Canvas reveal 与层级隔离；若 Host 不可安全隔离则记录阻塞，不操作用户现有实例。

没有用户数据迁移。回滚只能恢复整个变更前的代码版本；不得保留运行时 feature flag 或 Matrix fallback。

## Open Questions

无。Matrix 删除、统一 Overlay/全屏、顶部停靠、Overlay 生命周期内一次性展开 Preview、专用 Storyline 图标、Storyline 唯一路径、Git 式分支线、节点 source 定位和非时间比例布局已由本轮产品决策确定。
