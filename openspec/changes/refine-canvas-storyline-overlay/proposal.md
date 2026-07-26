## Why

Canvas Playback 当前将路线矩阵作为唯一默认路线表面，并以最小 220px、默认 360px 的底部 pane 持续压缩主画布。代码已经保留 `matrix | compact` 展示状态和一条可播放的紧凑路线条，但渲染不消费该状态；Matrix 组件还同时承载路线族、容器、步骤、时长、媒体状态和诊断，导致常规创作路径难以扫描。

需要把当前路线改为画布顶部的渐进式故事线 Overlay：默认服务单路线阅读、定位和播放，多路线比较时才进入 Matrix。该变更必须保留现有 Preview、Engine 媒体播放、Matrix 投影与键盘焦点能力，不能创建第二套播放器或新的持久故事节点。

## What Changes

- 将 Canvas 路线表面从底部布局 pane 改为画布顶部工具区下方的可调整高度 Overlay；Overlay 不改变 Canvas viewport 尺寸。
- 接通已有 `compact | matrix` 展示状态，并将 compact 故事线设为默认。
- 将 `CanvasPlaybackUnit` 投影为故事点；故事点只负责选择、定位、Seek 和播放状态展示，不成为新的 `.nkc` 节点类型。
- 在 Overlay 中提供故事线/路线比较分段切换；单路线默认不展示 Matrix。
- 让 Overlay 与 Preview 共享一个 `CanvasPlaybackController` 状态 owner；从 Overlay 播放时显式展开现有 Preview pane。
- 恢复并简化 Matrix 的主题样式，保留路线族、Group 折叠、路线/单元格选择、键盘导航和诊断。
- 保留路线区域的显式显示/隐藏入口；收起 Overlay 后不销毁 Preview 或复制播放状态。

## Capabilities

### New Capabilities

- `canvas-storyline-overlay`: 定义 Canvas 顶部故事线 Overlay、路线比较、播放与主画布/Preview 同步契约。

### Modified Capabilities

## Impact

- 影响 `packages/neko-canvas/packages/webview` 的 Playback workspace、Store、路线投影展示、主题样式、国际化和测试。
- 不修改 `.nkc` schema、`CanvasPlaybackPlan`、Extension/Webview message、Engine、Proto 或 Cut 契约。
- 继续复用 `@neko/ui` 的 SegmentedControl、ResizeHandle、SeekBar、图标和主题 token。
- 运行态验收 workspace 统一使用 `~/Git/neko-test`；场景数据隔离在其
  `.neko/.functional/<scenario>` 子目录，不得使用其他 workspace。
