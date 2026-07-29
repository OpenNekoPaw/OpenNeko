## Why

当前 Desktop 已具备正确的工作台槽位和包级 Root，但视觉仍沿用 VS Code Webview 的纯白
编辑器背景、细分隔线、微型控件和扁平面板密度，缺少桌面应用应有的窗口材质、层级与交互
反馈。需要在不复制各领域 UI、不改变 owner authority 的前提下，建立 Desktop 专属的
视觉主题和组合样式。

## What Changes

- 建立基于共享 `--neko-*` token 的 Desktop-native system theme adapter，跟随操作系统在
  亮色与暗色之间切换，并保留高对比度、focus 和 reduced-motion 语义。
- 将窗口背景、一级图标栏、Main Creative Surface、Agent/Resource Dock、浮动工具条和
  弹出菜单收敛为一致的桌面材质、圆角、阴影、间距和控件尺寸。
- 降低无限画布网格噪声，在 Main 与 Dock 之间建立明确层级，同时保持画布内容和 package
  工具栏由 Canvas/Preview owner 渲染。
- 对嵌入的 Agent Root 提供 Desktop host theme projection，使输入区、空状态、conversation
  header 和快捷操作与桌面壳一致，但不复制 Agent 组件或新增 Desktop-owned Agent UI。
- 增加主题 token、Shell 静态结构、交互状态和真实 Electron 视觉回归验证。
- 让 Electron 原生窗口底色与 renderer 的系统主题同步，避免暗色启动时出现浅色闪屏。

## Capabilities

### New Capabilities

- `desktop-native-visual-theme`: 定义 Desktop 系统亮/暗视觉主题、工作台层级、嵌入 Root 主题投影
  和桌面交互/可访问性验收要求。

### Modified Capabilities

无。

## Impact

- `apps/neko-desktop/src/renderer/desktop-theme.ts` 与 `styles.css`
- `@neko/ui` 既有 controlled workbench primitive 的 Desktop variant 使用方式
- package-owned Canvas/Agent/Assets Roots 的 Host theme projection，不改变其命令、
  store、adapter 或领域所有权
- Desktop renderer tests、生产 Electron package 与真实 `darwin-arm64` 视觉验收
