## Context

`useViewportTransform` 当前在右键 `mousedown` 时立即进入 panning，并在 `mousemove` 超过 4px 后设置 `suppressContextMenuRef`。`InfiniteCanvas` 将原生 `contextmenu` 交给该 hook；未被抑制的事件继续冒泡至 `CanvasApp -> useContextMenu` 并立即打开菜单。

该顺序假设 `contextmenu` 发生在移动或释放之后，但 Chromium/Electron 可在 `mousedown` 后立即派发，使阈值状态尚未建立。浏览器事件时序不能作为业务手势判定的事实来源。

### Five-layer analysis

| Layer          | Decision                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | `useViewportTransform` 拥有 pointer gesture 分类；`useContextMenu` 继续拥有菜单内容、节点识别和 action。                                        |
| Dependency     | 改动保持在 browser-owned L2 React hook/component，不引入 Electron、全局 native listener 或 Desktop IPC。                                        |
| Interface      | `onMouseUp` 返回精简的 release disposition；InfiniteCanvas 仅在 `open-context-menu` 时调用现有 menu callback。                                  |
| Extension      | 将来调整阈值或加入笔输入时仍在单一 gesture owner 扩展，不复制菜单构建逻辑。                                                                     |
| Test           | Hook 测试覆盖早发 `contextmenu`、阈值内抖动、阈值外拖拽、后发原生事件和键盘 context menu；组件测试验证 release disposition 接入现有菜单 owner。 |

## Goals / Non-Goals

**Goals:**

- 右键按住并拖动时平移画布，期间和释放后均不弹菜单。
- 右键单击在释放时打开现有 Canvas 或节点菜单。
- 小于 4px 的鼠标抖动既不移动 viewport，也不取消单击菜单。
- 浏览器在按下或释放阶段派发 `contextmenu` 时行为一致。

**Non-Goals:**

- 不改变菜单项目、视觉样式、定位和 action。
- 不改变中键、Space+左键、手型工具或滚轮平移/缩放。
- 不建立通用手势框架、延时 timer 或全局 window context-menu service。
- 不改变节点拖拽、框选或连接手势。

## Decisions

### 1. 原生鼠标 contextmenu 只作为需拦截的浏览器副作用

Viewport 对 `button === 2` 的原生 `contextmenu` 总是执行 `preventDefault + stopPropagation`，无论事件出现在按下还是释放阶段。键盘产生的 context menu 不带右键 button，继续冒泡到 CanvasApp 的现有 owner。

### 2. 右键释放决定单击或拖拽

右键 `mousedown` 记录起点但不立即改变 viewport。移动距离达到 4px 时激活 right-drag；从该时刻起按完整起点 delta 更新 viewport。`mouseup` 返回：

- 未激活 drag：`open-context-menu`；
- 已激活 drag：`pan-ended`；
- 非当前手势：`none`。

InfiniteCanvas 消费 disposition；只有 `open-context-menu` 才把同一个 release target 和坐标交给现有 `handleContextMenu`，因此节点菜单识别仍基于真实 DOM target。

### 3. 手势取消清理局部状态

Mouse leave、modal disable 或非右键 pan 结束时清理 right-pointer refs。取消只影响当前 viewport gesture，不关闭工作区或重置 viewport authority。

## Boundary inventory

| Owner / role                              | Canonical path            | Producer -> consumer                                      | Runtime boundary | Replaced path / user-data impact           |
| ----------------------------------------- | ------------------------- | --------------------------------------------------------- | ---------------- | ------------------------------------------ |
| `@neko/canvas-webview` viewport gesture   | `useViewportTransform.ts` | pointer events -> release disposition / viewport callback | Browser L2       | 替换 contextmenu 时序推断；无 durable data |
| `@neko/canvas-webview` Canvas composition | `InfiniteCanvas.tsx`      | release disposition -> existing menu callback             | Browser L2       | 不复制菜单 builder 或 selection logic      |
| `@neko/canvas-webview` menu owner         | `useContextMenu.ts`       | exact DOM target + coordinates -> menu state              | Browser L2       | 不变；继续拥有 Canvas/节点菜单内容         |

## Risks / Trade-offs

- 菜单从浏览器 `contextmenu` 时刻改为右键释放时打开，符合用户要求但会比原行为稍晚。
- 在按下后离开 viewport 的右键手势被取消，不在其他位置打开菜单；这是局部 gesture cancel 的可预测语义。
- 4px 阈值沿用现有常量，避免引入配置；真实高 DPI 体验需由 UI 验收确认。

## Migration Plan

1. 先用 hook 测试复现按下阶段的早发 `contextmenu`。
2. 原子替换 suppress-after-move 路径为 release disposition，并接入 InfiniteCanvas 的现有菜单 callback。
3. 运行完整 Canvas Webview 测试/build、严格 OpenSpec、边界检查和质量审查。
4. 在真实 Electron Canvas 中分别验证右键单击、轻微抖动、拖拽和节点目标菜单。

无 durable migration 或兼容路径；回退代码即恢复旧手势时序。

## Open Questions

无 apply-blocking open question。
