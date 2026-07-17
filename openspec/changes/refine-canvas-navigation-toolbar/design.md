## Context

Canvas Webview 目前把 `CanvasToolbar` 传给通用工作台 shell 的 `leftRail`，因此工具栏天然占满工作区高度。视口输入由 `useViewportTransform` 集中处理，但滚轮始终缩放，右键只通过上层 `useContextMenu` 打开菜单。此次变更横跨 shell 组合、UI 样式与输入状态，因此需要先定义唯一交互路径。

约束：继续复用 `@neko/ui` 工具栏 primitive 和 Canvas 主题变量；不改变工作区文件、Webview message 或 Engine；静止右键仍需保留节点/画布上下文菜单。

## Goals / Non-Goals

**Goals:**

- 工具栏成为画布表面内、左侧居中的自适应高度药丸浮层，激活按钮使用圆形轮廓。
- 普通滚轮用于二维平移，修饰键滚轮用于围绕指针缩放。
- 右键拖拽与现有中键、空格左键、手型工具共享同一视口平移状态。
- 通过拖拽阈值区分右键拖拽与右键点击，避免破坏上下文菜单。
- 使用聚焦测试和 Extension Development Host 证明样式与真实事件路径。

**Non-Goals:**

- 不重新设计节点上下文菜单、缩放控件或节点拖拽。
- 不增加可配置的鼠标映射，也不持久化视口手势偏好。
- 不改变 Canvas 数据模型或 Extension/Engine 边界。

## Decisions

### 1. 工具栏归属 Canvas surface，而不是工作台 rail

`CanvasToolbar` 将在 `canvas-main-surface-inner` 内通过绝对定位宿主渲染。宿主占据左侧上下安全边距并垂直居中子项，工具栏本身 `height: auto`、`max-height: 100%`，因此既不参与画布布局，也不随画布拉伸。继续使用现有 `VerticalToolbar` 是为了保留按钮、tooltip 和无障碍行为；Canvas 作用域样式负责专属定位、药丸外观和圆形激活轮廓，并关闭共享 primitive 的左侧激活指示条，避免同时出现两种选中强调。按钮继续保留 36px 点击热区，激活态通过 30px 内嵌圆呈现，以主题派生背景、描边和前景色建立对比，不修改共享 primitive。选择与平移作为互斥导航模式，由 Canvas 专属 `role="group"` 容器提供共享的纵向分段药丸底板；两个按钮之间不插入分隔线，只有当前模式保留内嵌圆高亮，从而和独立 action 区分。Canvas 自动化标记同步收敛为 `data-canvas-toolbar-*`，不再保留工作台 rail 语义。

备选方案是扩展通用 shell 的 rail 变体，但该浮层不承担通用工作台布局职责，会把 Canvas 交互需求泄漏到共享层，因此不采用。

### 2. 删除唯一设置入口及无入口挂载路径

删除工具栏设置按钮、`CanvasApp` 中仅由该按钮控制的设置面板状态/挂载，以及不再有调用方的面板组件。网格与 HUD 维持现有默认启用值；未来若重新引入设置能力，应从新的明确入口和契约接入，而不是保留隐藏路径。

### 3. `useViewportTransform` 作为视口手势唯一 owner

普通 wheel delta 转换为像素后从当前 pan 中扣除，以符合浏览器滚动方向；`Ctrl` 或 `Meta` wheel 复用现有指针锚定缩放算法。`deltaMode` 的行和页单位在 hook 边界规范化，组件不重复解释输入。

右键、现有中键、空格左键和手型左键都进入同一个 `isPanning` 状态。右键按下位置与“已超过拖拽阈值”使用 ref 保存，避免把一次手势的瞬时判定扩散为应用状态。

### 4. 上下文菜单只在真实右键拖拽后被消费

InfiniteCanvas 根节点接收 hook 返回的 `onContextMenu`。右键移动超过阈值后，该 handler 消费紧随其后的 contextmenu；没有移动或未超过阈值时事件继续冒泡到 CanvasApp 的现有上下文菜单 owner。这样不引入第二套路由，也不修改节点菜单契约。

### 5. 测试覆盖结果和执行路径

组件测试断言工具栏位于 Canvas surface、没有 settings action 且使用新的浮动 class。hook 测试直接派发 wheel、mouse 和 contextmenu 事件，分别证明平移、修饰键缩放、右键拖拽抑制菜单与静止右键保留菜单。运行态验收读取真实 Webview DOM/transform，证明事件命中生产 renderer，而非仅验证纯函数。

## Risks / Trade-offs

- [长工具栏在低高度窗口溢出] → 浮层宿主保留上下安全边距，工具栏使用 `max-height` 与自身滚动。
- [右键轻微抖动误判为拖拽] → 采用像素阈值，只有超过阈值才消费 contextmenu。
- [滚轮方向与用户预期相反] → 使用浏览器标准滚动语义；向下滚动使可视内容向上移动。
- [移除设置入口后无法临时关闭网格/HUD] → 本次按产品要求删除入口并保持默认开启；未来若恢复设置，应通过明确的 Canvas 设置能力重新接入，而不是隐藏入口。

## Migration Plan

1. 先增加交互与布局回归测试。
2. 将工具栏从 shell rail 迁入 Canvas surface，删除设置入口挂载路径。
3. 更新视口输入 hook 与 InfiniteCanvas 事件绑定。
4. 构建 Webview 并在 Extension Development Host 验证。

回滚只需恢复 Canvas shell 组合、工具栏设置 action 和原 wheel handler；无用户数据迁移。

## Open Questions

无。本次手势映射与视觉方向已由需求确定。
