## Why

Canvas 已支持右键拖拽平移，并尝试在移动超过 4px 后抑制菜单。但 Chromium/Electron 在部分平台会于右键 `mousedown` 阶段立即派发原生 `contextmenu`，早于移动阈值判定，因此菜单先打开并截断后续拖拽。

## What Changes

- 鼠标产生的原生右键 `contextmenu` 始终由 Canvas viewport 拦截，不再直接打开应用菜单。
- 右键按下后先进入待判定手势；位移达到 4px 才激活画布平移，并在释放时不打开菜单。
- 位移未达到阈值的右键释放由 viewport 手势 owner 主动请求现有 Canvas/节点菜单。
- 保留键盘触发的 context menu、节点菜单目标识别、左键/中键/Space 平移和内容滚动行为。

## Capabilities

### New Capabilities

- `canvas-right-pointer-gesture`: 定义右键单击菜单与右键拖拽平移之间的手势判定和事件所有权。

### Modified Capabilities

- 无。

## Impact

- `@neko/canvas-webview` L2：viewport 手势 hook、InfiniteCanvas 事件编排和 CanvasApp 现有菜单 callback wiring。
- `@neko/canvas-domain`、Desktop Main/preload 与持久化 contract 不变。
- 用户数据：只改变 pointer gesture 的展示交互；viewport 更新仍通过既有 callback，菜单 action 与 Canvas document shape 不变。
