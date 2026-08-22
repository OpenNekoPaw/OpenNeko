## Context

`BaseNode` 的根元素拥有唯一 `useNodeDrag` mousedown handler。普通内容事件会冒泡到该根元素；交互控件、显式 block 区和滚动条命中由 `getNodeDragStartDecision` 拒绝。外部标题位于根元素上方但 CSS 使用 `pointer-events: none`，因此它不会进入这条 canonical drag path。上下边缘外侧则仅在 selected 状态存在 resize handle。

### Five-layer analysis

| Layer          | Decision                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------- |
| Responsibility | Webview BaseNode 拥有可见节点的指针命中；domain 位置模型和 Canvas persistence 不变。              |
| Dependency     | 复用现有 `useNodeDrag` 和根 handler，不新增手势 service 或 document command。                     |
| Interface      | 使用现有 `data-node-drag-allow` DOM contract 标记标题与 rail；不增加 public TypeScript contract。 |
| Extension      | 所有 canonical node renderer 通过 BaseNode 自动获得相同边缘；特殊控件继续用现有 block contract。  |
| Test           | 组件测试直接从标题、top rail 和 bottom rail 发起 mousedown，并保留 hook 的控件/滚动条拒绝测试。   |

## Goals / Non-Goals

**Goals:**

- 用户可从节点标题和上下边缘稳定启动拖拽。
- 内容滚动条、按钮与输入控件继续拥有自己的交互。
- 所有 canonical nodes 复用一个 drag hook 和位置提交路径。

**Non-Goals:**

- 不让整个可滚动正文变成强制拖拽把手。
- 不改变 resize、rotate、connection handle 或批量移动语义。
- 不增加 viewport pan 的条件分支或透明内容覆盖层。

## Decisions

### 1. 标题显式加入 drag allow surface

外部标题设置 `data-node-drag-allow="true"` 并接收 pointer events。事件仍冒泡到 BaseNode 根 handler；标题不自行计算坐标、不提交位置。

### 2. rail 位于卡片边缘外侧

BaseNode 渲染 top/bottom 两条 8px 高的透明 rail，分别位于 `-8..0` 与 `height..height+8`。它们不覆盖正文或滚动条。selected resize handles 位于同一区域但 z-index 更高，因此 resize 优先；locked node 仍由 hook 的 disabled 状态拒绝移动。

### 3. 保留现有交互拒绝规则

不修改滚动条 18px 命中、interactive selector 或 explicit block 语义。这样本次扩展不会回退此前“节点滚动被画布拖拽覆盖”的修复。

## Boundary inventory

| Owner / role                            | Canonical path                    | Producer -> consumer                     | Runtime boundary | Replaced path / user-data impact       |
| --------------------------------------- | --------------------------------- | ---------------------------------------- | ---------------- | -------------------------------------- |
| `@neko/canvas-webview` BaseNode         | `BaseNode.tsx -> useNodeDrag`     | pointer down -> drag presentation        | browser L2       | 替换标题透传到 viewport；无 shape 变化 |
| `@neko/canvas-webview` Host status path | existing Canvas status submission | completed move -> authoritative document | Webview Host     | 不变；不新增移动 command               |

## Risks / Trade-offs

- rail 位于节点外侧，邻近节点距离小于 8px 时可能与相邻命中区接近；Agent 投影仍保留大于 8px 的间隔，手动重叠时 DOM z-index 决定顶层节点。
- selected 边缘继续优先 resize，用户需要从标题或内容 chrome 移动已选节点；这是现有 transform ownership。

## Migration Plan

1. 增加 BaseNode 组件命中测试。
2. 添加标题 allow surface 和上下 rail，保持 hook decision 逻辑不变。
3. 运行 Webview tests/build、严格 OpenSpec、质量审查和真实 Canvas 指针验收。

无 durable migration；回退 DOM/CSS 即恢复旧命中范围。

## Open Questions

无 apply-blocking open question。
