## Context

`PlaybackWorkspace` 当前拥有 Canvas pane、右侧 Preview stage 和底部 route pane。路线投影由 `CanvasPlaybackPlan -> resolveEffectiveCanvasPlaybackRoutes -> projectRouteStoryboardMatrix` 产生；点击 Matrix cell 已能选择源 Canvas node、移动 Canvas viewport 并更新 Preview。`PlaybackRouteStrip` 已实现路线 tabs、时长比例故事段、播放头和 Seek，但只在 Matrix projection 缺失时作为 fallback。Store 中 `routeViewMode` 默认值为 `matrix`，setter 只有测试调用，生产渲染未消费。

播放由 `CanvasPlaybackController` 负责顺序推进、timer/media completion、播放请求和 Seek，`PreviewSurface` 负责实际媒体展示。当前 Controller 渲染在 Preview pane 内；若直接在 Overlay 再挂载一个 Controller，会产生重复 timer、请求和播放状态 owner。

此次变更不改变 Canvas 六节点事实源。所谓“故事点”只对应 `CanvasPlaybackUnit.sourceNodeId` 的展示投影；Group child order 和 `sequence` connection 继续是顺序事实。

## Five-Layer Analysis

| 层 | 决策 |
| --- | --- |
| 职责 | Canvas 节点/连接是事实；故事线和 Matrix 是同一 PlaybackPlan 的可恢复投影；Preview 是媒体展示；Controller 是唯一播放 owner。 |
| 依赖 | Webview 内部组件只依赖共享 UI 与 `@neko/shared` playback contract，不新增 Extension 或 Engine 依赖。 |
| 接口 | `routeViewMode` 决定故事线/Matrix；播放 UI 共享一个 controller model；所有故事点保留 source node identity。 |
| 扩展 | 未来 Character/World route adapter 可以提供 PlaybackPlan，但不增加 Canvas 持久节点或 Overlay 私有项目模型。 |
| 测试 | 单元测试证明默认故事线、模式切换、Overlay 布局和单一 Controller；Extension Host 证明真实 Webview DOM、焦点、Preview 展开和媒体路径。 |

## Goals / Non-Goals

**Goals:**

- 默认以一条横向故事线展示当前路线。
- Matrix 作为同一 Overlay 中的显式“路线比较”模式。
- Overlay 固定在 Canvas workspace 顶部并向下展开，不参与 Canvas zoom/pan，也不压缩主画布布局。
- 从 Overlay 播放时复用现有 Preview 和媒体播放链路。
- 保留 Matrix 路线族、Group 折叠、单元格选择、键盘和诊断能力。
- 保证 source node 定位时考虑 Overlay 遮挡后的可视安全区域。

**Non-Goals:**

- 不新增 Story、Scene、Shot、Beat 或 Occurrence 持久节点。
- 不在故事点缩略图中创建独立媒体播放器。
- 不在 Overlay 中实现连接创建、分叉编辑、精确时长编辑、轨道、混音或 Cut 能力。
- 不修改 Canvas/Cut handoff、Engine stream 或项目格式。

## Decisions

### 1. 顶部 Overlay 属于 PlaybackWorkspace，而不是 Canvas 坐标空间

Overlay 作为 Canvas pane 的绝对定位子元素，位于画布顶部安全边距内并向下展开。它不改变 `.canvas-playback-workspace-main` 的 flex 尺寸，因此开关和调整高度不会改变 Canvas viewport 尺寸。Overlay 使用 Webview presentation state 保存高度和模式，不写入 `.nkc`。

Overlay 的可视和 pointer-event 边界必须由 Canvas pane 裁切，不得覆盖相邻 Preview stage。Preview 继续拥有独立的可调整宽度、媒体 surface 和播放状态；两者不通过动态宽度偏移互相耦合。z-index 位于 Canvas 内容与浮动工具之上，但不覆盖 Preview 或宿主级工具栏。ResizeHandle 放在 Overlay 下边缘，拖动方向与旧底部 pane 相反。

### 2. Compact 状态正式成为“故事线”

复用并重命名 `PlaybackRouteStrip` 的产品语义为 Storyline。默认 `routeViewMode` 从 `matrix` 改为 `compact`。Overlay header 使用共享 `SegmentedControl` 在“故事线”和“路线比较”间切换；没有多个可比较路线时 Matrix 选项禁用或隐藏。

故事点来自选中路线的 `CanvasPlaybackUnit`，显示标题、时长、当前状态和播放进度。点击和 Seek 继续调用现有 `selectPlaybackUnit` / `selectPlaybackTime`，由 sourceNodeId 同步主画布选择与 viewport。

### 3. Matrix 只承担比较，不拥有编辑事实

Matrix 继续由 `projectRouteStoryboardMatrix` 派生，保留 route family、container fold、row/cell focus 和 diagnostics。界面恢复主题样式并降低常驻统计的视觉权重。Matrix click 只选择路线/单元或定位 Group；它不保存私有顺序。

后续若接入拖拽排序，只能调用已有 Canvas command，并必须满足同一 Group 完整 child set 的约束。本次不新增 Matrix 编辑入口。

### 4. 播放逻辑提取为单一 controller model

将 `CanvasPlaybackController` 的状态与命令提取为可复用 hook/model；`PlaybackWorkspace` 只创建一个 model。Overlay 可见时在 Overlay header/rendered body 展示控制器；Overlay 隐藏而 Preview 可见时在 Preview pane 展示同一 model 的控制器。两个展示位置不能同时创建 timer 或 playback request owner。

用户从 Overlay开始播放时，`PlaybackWorkspace` 显式把 Preview pane 设为可见，再由现有 `PreviewSurface` 消费同一 playback request。暂停、上一/下一故事点、Seek、media completion 和 stale 语义保持现有实现。

### 5. Overlay 遮挡进入 viewport 计算

故事点或 Matrix cell 定位源 Canvas node 时，Canvas viewport center 使用 Overlay 下边缘以下的可见矩形，而不是整个 pane 中心。这样目标节点不会被顶部 Overlay 遮挡。Overlay 的 pointer events 只拦截自身区域，画布其余区域保持可操作。

### 6. Fail-visible 与状态恢复

未知 `routeViewMode` 不做 fallback；Store 类型只允许 `compact | matrix`。Matrix projection 缺失时，compact 故事线仍可显示；选中路线缺失或 stale 时使用现有 diagnostic，并暂停播放。Overlay 不缓存第二份 PlaybackPlan。

## Risks / Trade-offs

- [Overlay 遮挡主画布内容] → 默认故事线保持紧凑，Matrix 只显式展开；定位 source node 使用扣除 Overlay 的可视区域。
- [Overlay 与 Preview 冲突] → Overlay 挂载并裁切在 Canvas pane 内；Preview 不参与 Overlay 定位计算。
- [Controller 提取引入播放回归] → 保留原组件 wrapper，并增加单一 model、timer、Preview 自动展开和 media completion 回归测试。
- [窄窗口模式切换与播放控件拥挤] → 小于响应式分界时 Canvas 与 Preview 改为纵向布局；header 使用稳定 icon controls，故事线横向滚动并隐藏次要统计。
- [Matrix 大数据量导致 Overlay 过高] → Overlay 高度受 viewport 比例约束，Matrix body 内部滚动。

## Migration Plan

1. 增加默认故事线、模式切换、顶部定位与播放 owner 回归测试。
2. 提取 Controller model，保持现有 wrapper API。
3. 接通 `routeViewMode`，将 route pane 改为顶部 Overlay。
4. 恢复 Storyline/Matrix 样式和国际化。
5. 构建 Canvas Webview，在隔离 Extension Development Host 中验证。

不涉及用户数据迁移。回滚只恢复旧 route pane 布局和 Controller 挂载位置。

## Open Questions

无。顶部 Overlay、默认故事线、Matrix 比较模式和 Preview 播放边界已由本轮产品决策确定。
