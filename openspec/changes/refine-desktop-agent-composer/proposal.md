## Why

Desktop 的 package-owned Agent Root 已具备主模型、媒体理解、媒体生成、Agent 参数和三档执行模式，但这些配置在窄 Dock 中以多个常驻控件并列展示，造成“Agent / 对话”语义重复、输入区被压缩、无附件时仍暴露感知模型等问题。现在需要在不改变 Pi、purpose-model policy、Tool approval 或 conversation authority 的前提下，将默认体验收敛为 creator-first 的紧凑 composer。

## What Changes

- 将 Desktop Dock 的模式、模型和 Agent 参数从多段常驻轨道收敛为紧凑摘要入口，保留完整可发现性和键盘/无障碍语义。
- 提供统一模型配置弹层，按对话、图片、视频、音频组织主模型、理解模型和生成模型；每个 purpose 继续使用精确单选，不引入模型池、“全选”或隐式 fallback。
- 仅在当前上下文相关时强调媒体理解配置；无媒体附件的默认 Agent 输入不常驻展示“感知”控件。
- 将执行模式菜单改为解释型三档菜单，明确规划、审批和自动的副作用语义；不增加“完全访问”模式。
- 为 Desktop 空状态提供由已启用 Skill catalog 投影而来的少量显式创作入口；点击只预填或显式调用，不自动激活 Skill。
- 保持 Home、Project Dock 与未来 Focus presentation 使用同一个 `AgentWebviewRoot`、conversation identity 和 Host runtime，不创建第二套 Agent 状态。

## Capabilities

### New Capabilities

- `desktop-agent-composer-experience`: 定义 Desktop Agent 紧凑 composer、统一模型弹层、执行模式说明、Skill 空状态入口与 presentation/identity 边界。

### Modified Capabilities

无。

## Impact

- 主要影响 `packages/neko-agent/packages/webview` 的 composer、空状态、样式、本地化和 React 测试。
- 复用现有 `ChatModelOption`、media understanding/generation selection、Skill catalog、execution mode 和 Host message contract。
- 不修改 `@neko/agent` Pi runtime、provider/model resolution、Tool permission policy、Desktop IPC、credential store 或领域执行端口。
- Desktop 继续通过 `presentation="desktop-dock"` 挂载 package-owned Root；共享 Webview 默认 presentation 不应被 Desktop 专属布局静默改变。
