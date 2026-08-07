## Why

Desktop Agent 入口当前把提示信息和 Composer 压在窗口底部，并把工作目录、创作模式、执行模式以及命令快捷入口分散成多层控件，导致首屏焦点不清晰。入口应收敛为一个居中的创作起点，并让用户从同一个“打开项目”入口明确选择一个已添加项目或一个系统目录。

## What Changes

- 将 Desktop Agent 空入口的提示信息与 Composer 组合为垂直居中的单一首屏区域，同时保持窄窗口可滚动且不遮挡内容。
- 把 Composer 顶部“选择工作目录”移到底部工具栏并重命名为“打开项目”。
- “打开项目”提供单选菜单：可打开一个已添加且可用的项目，或通过现有系统目录授权选择一个目录；选择后沿 canonical Desktop Scene 路径进入该 Workspace。
- Desktop 入口不显示 `/` 与 `$` 快捷按钮，不在占位文案中宣传这些快捷入口；键盘命令能力与已开始的会话行为不在本次范围内删除。
- Desktop 入口固定以 Agent session mode 提交，仅显示模型配置，不显示创作模式或执行模式选择；已存在会话继续使用其 authoritative session snapshot。
- 普通 Agent Webview、Workspace 会话、Character/Room 会话、项目目录授权、项目 catalog 与 Agent runtime contract 保持不变。

## Capabilities

### New Capabilities

- `desktop-agent-entry-experience`: 定义 Desktop Agent 空入口的居中布局、单项目打开菜单与 Agent-only Composer 控件。

### Modified Capabilities

<!-- None. Existing stable specs do not own this Desktop entry presentation. -->

## Impact

- `packages/agent/webview`（browser-safe Agent Webview UI owner）：增强现有 EmptyState、InputArea、Composer presentation context 与 i18n，拥有入口视觉、菜单展示和入口 session-mode 投影，不拥有项目事实或目录授权。
- `apps/neko-desktop` Renderer（Desktop Window Shell composition owner）：把现有 Project catalog 和 exact Scene actions投影给 Agent Webview；已添加项目使用 `open-project-workspace`，系统目录使用现有 `workspaceGrants.choose` 与 `open-workspace`，不新增 IPC、handler 或持久化字段。
- `@neko/host` Project catalog、Workspace grant authority、Agent contracts/runtime、Main/preload 和用户项目数据不变。
- 需要更新 Agent Webview 组件测试、Desktop Renderer 组合测试、i18n 完整性检查、样式回归测试与隔离真实 Electron UI 验收。
