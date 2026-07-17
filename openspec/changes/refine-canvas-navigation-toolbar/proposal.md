## Why

Canvas 当前工具栏占用整列高度，视觉重量与实际操作数量不匹配；同时滚轮直接缩放、右键只能打开菜单，不符合大画布以平移浏览为主的工作流。需要把工具栏收敛为画布内的浮动控件，并统一鼠标与触控板的导航语义。

## What Changes

- 将 Canvas 工具栏从全高布局栏改为画布左侧垂直居中的长药丸浮层，继续使用现有主题变量；工具按钮激活态使用小于点击热区的高对比圆形轮廓。
- 删除工具栏中的设置入口；网格与 HUD 保持当前默认启用状态，不再挂载没有入口的设置面板。
- 普通滚轮默认平移画布，支持水平与垂直滚轮增量。
- `Ctrl/Cmd + 滚轮`（包括浏览器上报为修饰键滚轮的触控板捏合）继续围绕指针缩放，缩放按钮保持可用。
- 右键拖拽平移画布；仅当拖拽超过阈值时抑制随后产生的右键菜单，静止右键点击继续打开现有上下文菜单。

## Capabilities

### New Capabilities

- `canvas-navigation-interactions`: 定义 Canvas 浮动工具栏、滚轮平移、修饰键缩放及右键拖拽的用户交互契约。

### Modified Capabilities

## Impact

- 影响 `packages/neko-canvas/packages/webview` 的 Canvas shell 组合、工具栏组件、视口输入 hook、样式及其测试。
- 不修改 `.nkc` 数据、Extension/Webview message、Engine 或 Proto 契约。
- 不增加第三方依赖；继续复用 `@neko/ui` 的垂直工具栏 primitive 与现有主题 token。
