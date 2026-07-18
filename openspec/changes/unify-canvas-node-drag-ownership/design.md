## Context

Canvas 节点移动由 `BaseNode` 组合 `useNodeDrag` 统一处理。`useNodeDrag` 已通过元素类型、显式 `data-node-drag-block` 和滚动条命中判断区分节点手势与内容交互，但 composable `NodeShell` 以及旧式 Script/Document 正文又把整个正文标为 drag-block，导致正文无法进入既有节点移动路径。与此同时，节点根没有取消 HTML5 `dragstart`，图片和可拖文本仍可能触发浏览器原生素材拖拽。

职责分析：`BaseNode` 拥有节点级手势与原生节点边界；内容 renderer 只拥有按钮、输入、编辑、滚动等显式交互。依赖分析：修复仅发生在 Webview L2 内，不改变 Store、Extension、Engine 或 Proto。接口分析：继续使用现有 `useNodeDrag` 决策契约，不新增平行 hook。扩展分析：未来 renderer 仅在真实交互区域声明 drag-block。测试分析：同时断言节点 canonical path 被命中、原生 drag 被拒绝、显式控件仍被阻断。

## Goals / Non-Goals

**Goals:**

- 普通节点 Header 与非交互正文都通过 `BaseNode -> useNodeDrag` 移动节点。
- 节点内图片、文本和其他素材不产生浏览器原生拖拽。
- 容器内实际子节点保持各自的节点级拖拽身份。
- 按钮、输入、编辑区域、滚动条和显式复杂滚动视图继续拥有自身交互。

**Non-Goals:**

- 不新增节点内容拖放、素材导出或跨节点复制协议。
- 不改变外部文件拖入 Canvas 或节点库拖入 Canvas 的 HTML5 DnD 路径。
- 不修改节点位置模型、容器 schema、选择模型或持久化格式。

## Decisions

1. `BaseNode` 作为节点原生拖拽抑制的唯一 owner，在节点根处理 `dragstart` 并 `preventDefault()`。相比逐个图片设置 `draggable={false}`，该方案覆盖图片、链接、选中文本和后续 renderer，且不会影响节点外的节点库/文件拖入协议。
2. 删除普通正文上的宽泛 `data-node-drag-block`，让事件进入现有 `useNodeDrag`。不新增 Header-only handle、第二套 pointer handler 或 renderer-specific drag adapter。
3. 继续保留 `useNodeDrag` 的交互元素选择器、显式 drag-block 与滚动条检测。Scene 表格/shot rail 等真实滚动和内部导航 surface 仍可局部声明阻断；按钮、输入、textarea、链接和 contenteditable 自动阻断。
4. 容器只负责空间归属，不接管子节点手势。实际子节点依旧由其自身 `BaseNode` 和显式 node id 移动；容器中的预览卡片不是可独立拖拽素材。

## Risks / Trade-offs

- [正文文本不再可通过拖拽选择] → 这是“只允许节点级拖拽”的目标语义；需要编辑或选择的区域必须使用显式控件、contenteditable 或 overlay。
- [复杂 renderer 忘记声明自身手势所有权] → 现有交互元素自动阻断，新增复杂滚动/手势 surface 必须添加局部 drag-block 和聚焦测试。
- [根级 `dragstart` 影响节点内未来合法 DnD] → 当前契约明确禁止节点内容级 DnD；若未来引入，必须先修改 capability，而不是通过冒泡例外形成第二路径。
