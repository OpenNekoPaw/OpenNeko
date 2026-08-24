## Why

Canvas Webview 的背景网格绘制到 `<canvas>` 位图后，只在 viewport 或容器尺寸变化时重绘。Desktop 虽然会在主题设置变化时同步更新根节点主题标识与 CSS tokens，但已经绘制的背景像素不会自动响应 CSS 变量，因此用户必须平移、缩放、重新挂载或重启应用后才能看到新主题。

## What Changes

- Canvas 位图网格监听 Desktop 已有的 canonical `data-neko-theme` 根节点标识，并在标识变化后从当前 CSS tokens 重绘。
- 保持 Canvas Root、文档、viewport、selection 和宿主 runtime 原位，不以重新挂载或重启作为主题切换机制。
- 增加组件测试，验证主题变化会重绘同一个 `<canvas>` 元素并消费新颜色。

## Capabilities

### New Capabilities

- `live-canvas-theme-redraw`: 定义 Canvas 位图背景对 canonical 主题变化的即时响应。

### Modified Capabilities

- 无。

## Impact

- `@neko/canvas-webview` L2：只在 package-owned presentation 内监听 DOM 主题标识并重绘可丢弃位图。
- `apps/neko-desktop`：无生产代码变化；继续拥有主题选择、resolved theme 与 CSS token 投影。
- 公共 contract / IPC / persistence：无变化。
- 用户数据：无迁移，不修改 Canvas 文档或 presentation snapshot。
