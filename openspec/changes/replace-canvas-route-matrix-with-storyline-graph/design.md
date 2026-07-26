## Context

`PlaybackWorkspace` 原本同时拥有 compact Storyline 与 `RouteStoryboardMatrix`。Matrix 删除后，Storyline 仍作为 Canvas 顶部 Overlay，而 Preview 位于右侧 stage；两者消费同一 PlaybackPlan 和 Controller，却形成两个播放视觉容器、两个 Toolbar visibility action，并要求 Canvas reveal 扣除 Overlay 遮挡区域。

通用 Canvas adapter 当前把 Markdown、Media 与 Group child order 投影成一条 canonical route；宿主提供的 PlaybackPlan 仍可包含多条 `CanvasPlaybackRouteCandidate`。本变更必须删除 Matrix 这条平行展示路径，同时保留多路线、节点身份、诊断、Preview 和播放生命周期。

### Five-Layer Analysis

| 层   | 决策                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Canvas 节点与 sequence connection 是事实；PlaybackPlan 是路线契约；同一个 Overlay 承载 Storyline、单一 Controller 与 Preview。              |
| 依赖 | Storyline 只消费 `@neko/shared` playback contract 与共享 UI，不新增 Extension、Engine 或持久化依赖。                                        |
| 接口 | 路线选择使用 `routeId`，节点选择使用 `unitId`，Canvas 定位只使用 `sourceNodeId`；不保留 Matrix-only DTO 或 store API。                      |
| 扩展 | adapter 可提供多条共享 unit 的路线；Storyline 由稳定 source identity 投影 lane/branch layout，不创建第二套路线事实或推断节点等价。          |
| 测试 | 单元/组件测试证明 Overlay/全屏、分支投影、节点定位、路线切换、诊断、键盘和单一 Controller；Extension Host 验证真实 Webview 定位与 Preview。 |

## Goals / Non-Goals

**Goals:**

- 删除 Matrix 组件、投影、状态和模式切换，收敛到唯一 Storyline。
- 将 Storyline、播放控制与 Preview 全部移入同一个按需 Overlay，并支持 Webview 内全屏。
- 由一个 `StorylinePlaybackOverlay` 组件拥有 Storyline、控制条、折叠/展开 Preview 与 footer 的完整视觉结构；`PlaybackWorkspace` 不再组合两个并列视觉组件。
- 未播放时将统一 Overlay 停靠在 Canvas 顶部并折叠媒体 Preview，不渲染遮罩或阻断条外 Canvas；播放时自动展开为居中模态预览。
- 以横向 Git graph 式节点和分支线展示路线拓扑；存在多路线时可辨识共享、分叉与汇合关系。
- 用专用 Storyline 分支图标替换 Toolbar 上容易被误解为立即播放的通用播放图标。
- 播放 transport 按钮居中，不展示当前时间/总时长文字；保留不带时间 tooltip 的 Seek 进度反馈。
- 点击剧情节点时选择并定位其真实 Canvas source node，并同步 Preview session。
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
  -> media Preview surface (playing only)
  -> title / diagnostics / full-bleed / close footer
```

`playbackState !== 'playing'` 时，Overlay 以无 backdrop 的紧凑条停靠在 Canvas 顶部，媒体 Preview 折叠，条外区域不接管 pointer events，也不声明模态语义，因此 Canvas 工具、节点和 viewport 仍可操作。开始播放后，同一个 Overlay 切换为带 backdrop 的居中模态形态并展开媒体内容；暂停、结束或 stale 后再次折叠并返回顶部停靠。用户可切换为铺满 Canvas Webview 内容区的 full-bleed presentation，再切回 Overlay。这里的“全屏”不调用浏览器 Fullscreen API，不逃逸 VS Code Webview，也不覆盖 VS Code 原生 chrome。Escape 关闭 Overlay，关闭时若正在播放则暂停。

Canvas Toolbar 的 visibility action 使用专用 Storyline 分支图标直接打开/关闭整个 Overlay，不再使用暗示“点击后立即播放”的通用播放图标，也不再提供 Storyline header 到 Preview 的第二次打开动作。图标作为无业务状态的共享 editor icon 进入 `@neko/shared/icons`，Canvas 只拥有按钮语义和 Overlay 状态。

`PlaybackWorkspace` 只负责编排 plan、session、Preview request 和 Canvas source reveal，并把单一 view model 交给 `StorylinePlaybackOverlay`。`StorylinePlaybackOverlay` 是 Storyline、控制条、条件 Preview 和 footer 的唯一视觉 owner；不得在 Workspace 中并列挂载 `StorylineGraph` 与 `PlaybackStage` 两个 surface。内部 graph 与 Preview markup 可以继续复用共享 Preview primitive，但不能拥有独立 visibility、边框容器或 session。

### 3. Storyline 使用顺序坐标，不使用时间坐标

每个可播放 unit 以稳定的横向顺序位置和紧凑节点按钮展示。连接线表达 sequence、分叉和汇合关系；节点宽度不得由 `durationMs` 决定。节点可见内容只保留序号/短标题，媒体类型、缺失状态与诊断通过形状、颜色、tooltip 和 accessible label 表达。播放时间仅作为 controller/Preview 的内部进度状态，不在控制区显示当前时间或总时长文字；Seek 仍可用无时间 tooltip 的进度条表达相对进度。Storyline 不渲染时间尺，也不把缺失时长的默认值显示为精确事实。

未采用当前 duration-proportional strip，因为它把结构导航误导成 Cut 时间线，并使长媒体破坏路线可读性。

### 4. 多路线通过同一 Storyline 选择，不恢复比较视图

当 PlaybackPlan 提供多条有效路线时，Storyline 将路线投影为共享横向进度轴上的 lane/branch graph；选中路线的节点和连接保持主视觉，其他路线降为次要视觉但仍可点击选择。不得恢复 Matrix row 或只显示当前路线而隐藏拓扑。

路线共享/汇合只能由相同 `CanvasPlaybackUnit.sourceNodeId`（并以 unit id 作为路径内 identity）或 adapter 提供的稳定 identity 证明；不得根据标题或内容相似度猜测。通用 adapter 只有一条 canonical route 时显示单一直线节点序列。

### 5. 节点定位复用现有 source identity 链路

Storyline 节点激活继续调用唯一 `selectPlaybackUnit` 路径：

```text
Storyline node
  -> routeId + unitId
  -> CanvasPlaybackUnit.sourceNodeId
  -> select Canvas node
  -> reveal node inside unobscured Canvas viewport
  -> update Preview/playback session
```

Storyline 不缓存 Canvas position，也不创建私有 node mapping。缺失 unit 或 source node 必须通过现有 diagnostic/stale 语义 fail-visible。

### 6. Matrix 与 Overlay 的真实信息迁移到 owning surface

- 路线选择进入 Storyline graph 的 lane/route controls。
- 节点媒体状态和单元诊断进入对应 Storyline 节点的形状/颜色、title 或 accessible label，不占用第二行正文。
- 路线级诊断保留在 Storyline diagnostic area。
- Group/container 结构由主 Canvas 和 Storyline 顺序共同表达，不保留 Matrix container fold。
- 键盘使用横向 list/navigation 语义，不保留 row/column/grid focus。
- 时长仅保留为播放运行时与授权节点详情数据，不在 Storyline 控制区或 Matrix duration range 中展示。

## Risks / Trade-offs

- [失去跨路线逐列审计] → 当前没有明确用户任务依赖该能力；未来若出现专业审阅需求，以独立 inspector 重新设计，不复活隐藏 Matrix。
- [多路线 lane 可能在密集图中变高] → 采用固定 lane 间距和横向滚动；只合并稳定 identity，不为压缩高度猜测拓扑。
- [删除大范围 CSS/i18n/tests 可能留下 residual] → 使用 legacy-debt、unused、focused typecheck/build 和 `rg` 断言清除 Matrix 标识。
- [Overlay 遮挡 Canvas] → 未播放时 Overlay 仅占用顶部紧凑带，外层透明且不截获 pointer events；只有用户开始播放后才进入带遮罩的显式模态预览，关闭后 Canvas 原布局立即恢复。
- [Storyline 失去 Matrix 的诊断细节] → 节点和路线级 diagnostic 必须在 Storyline 可见且可通过键盘读取。

## Migration Plan

1. 先增加 Storyline 唯一路径、节点定位、路线切换和非时间比例布局测试。
2. 将 Storyline strip 重构为结构化节点图，并迁移诊断与媒体状态。
3. 删除 Matrix render/projection/store/i18n/CSS/tests，并清理所有调用方。
4. 将 Storyline、单一控制条与 Preview 合并到唯一按需 Overlay/full-bleed presentation。
5. 删除 Preview stage width/resize 状态，把多路线投影为稳定 identity 驱动的 branch graph。
6. 运行 Canvas Webview 聚焦测试、typecheck/build、legacy/unused 检查。
7. 在隔离 Extension Development Host 中验证顶部非模态 Overlay、播放态模态展开、Storyline、节点点击、Canvas reveal 和全屏；若 Host 不可安全隔离则记录阻塞，不操作用户现有实例。

没有用户数据迁移。回滚只能恢复整个变更前的代码版本；不得保留运行时 feature flag 或 Matrix fallback。

## Open Questions

无。Matrix 删除、统一 Overlay/全屏、非播放态顶部停靠、播放态模态展开、专用 Storyline 图标、Storyline 唯一路径、Git 式分支线、节点 source 定位和非时间比例布局已由本轮产品决策确定。
