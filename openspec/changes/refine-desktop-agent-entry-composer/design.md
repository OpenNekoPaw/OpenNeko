## Context

Desktop Agent 的 tabless entry 由 `packages/agent/webview` 的 `ConversationController` 组合现有 `EmptyState` 与 `InputArea`，Desktop Renderer 通过 `AgentComposerWorkspacePresentation` 只提供一个系统目录选择回调。项目 catalog、目录授权和 Scene transition 已分别由 `@neko/host` 与 Desktop Shell 的 typed ports 拥有；当前缺口是 package-owned Composer 没有得到可展示的已添加项目列表，且入口态没有独立的紧凑控制投影。

本次横跨 Agent Webview presentation 与 Desktop Renderer composition，但不改变 Agent runtime、Host application service、Main/preload IPC、Project 数据或 Workspace grant authority。

## Goals / Non-Goals

**Goals:**

- 让 Desktop 空入口的提示与 Composer 形成居中的单一视觉组合，窄窗口仍可滚动。
- 在 Composer 底部提供一个可访问的“打开项目”单选菜单，精确打开一个已添加项目或调用现有系统目录选择。
- 只在 Desktop tabless entry 隐藏快捷按钮、创作模式、执行模式和使用量控件，并强制提交 `agent` session mode；模型配置继续可用。
- 保持已存在会话、Workspace Composer、命令键入能力、目录授权和项目导航的 canonical owner 与路径。

**Non-Goals:**

- 不新增多项目选择、最近目录、Project picker durable state、项目导入或目录历史。
- 不删除 `/`、`$` 或 `@` 的键盘解析和 Agent 能力，也不改变普通会话工具栏。
- 不新增 IPC、Project DTO、持久化字段、内部版本、兼容分支或 fallback。
- 不复制 MiniMax 品牌、背景图案或营销内容。

## Decisions

### 1. 增强现有 Agent Webview 入口，不建立第二个 Composer

Owning responsibility 是 `packages/agent/webview` 的 browser-safe Agent UI：`ConversationController` 识别 Desktop tabless entry，`EmptyState` 负责入口提示，`InputArea` 通过明确的 `desktop-entry` presentation 负责紧凑工具栏。现有 `AgentWebviewRoot -> AppShell -> ConversationController -> InputArea` 是唯一 public production path；不新增 Desktop Composer、controller 或 send handler。

Desktop entry 继续使用 package-owned draft/input state。入口 presentation 只改变可见控件和本次提交的 effective session mode，不写回已存在 Conversation snapshot，也不持有后台 Agent runtime。

替代方案是让 Desktop Renderer 在 Agent Root 外再绘制欢迎区和输入框，但这会形成第二条消息与配置路径，因此不采用。

### 2. Desktop Shell 只投影项目选项与 exact Window action

`apps/neko-desktop` 保留的逻辑依赖当前 Electron Window 的 Scene identity、Project catalog projection 和系统目录授权，属于产品 Shell composition 而不是 host-neutral 项目业务规则。Desktop Renderer 生产 `AgentComposerWorkspacePresentation`：每个项目选项携带 `projectId`、显示名和不可用 diagnostic；Agent Webview 是 presentation consumer。

选择已添加项目调用现有 `ShellActions.onSelectProject(projectId)`，唯一成功路径是 `open-project-workspace` Scene intent。选择系统目录调用现有 `onChooseWorkspace`，唯一成功路径是 `workspaceGrants.choose -> open-workspace`。不可用项目显示但禁用，并保留 diagnostic；取消系统目录选择不改变当前 Scene。旧的顶部工作目录条被删除，不保留平行入口。

该 presentation type 是 package-owned browser UI contract，不包含路径、grant、项目内容或 authority；Desktop 只通过 `@neko/agent-webview/root` public entry 消费。

### 3. “打开项目”菜单是瞬时单选导航，不是选择状态 owner

菜单增强现有 Composer toolbar，并复用当前 Composer menu runtime、dropdown placement、图标、主题 token 与 click-outside 行为。菜单不保存 selected project：选择一项立即发起 exact Scene transition，成功后当前 Root 卸载并由目标 Workspace Root 重建，因此天然只支持一个项目。

已进入 Workspace 时，底部显示当前项目标签但不提供第二个并行 Workspace authority。未来若需要在 Workspace 内切换项目，应继续通过 Desktop Scene action 扩展，不在 Webview 建立 active-project store。

### 4. Desktop entry 的 Agent-only 约束在最小 presentation boundary 生效

`ConversationController` 为 `desktop-dock` tabless entry 计算 effective `sessionMode: agent`，模型投影、InputArea provider 与 send input 使用同一值。`InputArea` 的 `desktop-entry` presentation 只显示附件、模型配置、打开项目和发送；Session mode selector、execution mode selector、`/`、`$`、usage 与 media counters 不渲染。占位文本使用不宣传快捷键的入口专用文案。

普通 Conversation tab 不传该 presentation，因此其 authoritative session mode、execution mode、命令按钮、usage 与 queue 行为不变。键盘输入 `/`、`$`、`@` 的解析不删除，避免把视觉收敛扩大为 Agent capability 变更。

### 5. 布局只组合现有 EmptyState 与 InputArea

Desktop tabless entry 外层增加明确的居中 stack class；EmptyState 的 Desktop variant 使用无卡片边框的标题/说明，并不显示 Skill shortcut chips。Composer 保持现有 820px 最大宽度，与提示共享对齐轴。CSS 使用有界 `max-width`、纵向 gap、可滚动容器和小窗口 media query，不使用 viewport 字体缩放或隐藏溢出。

## Risks / Trade-offs

- [项目较多时菜单过高] → 项目区设置最大高度并独立滚动，系统目录 action 保持可见。
- [入口强制 Agent 与旧 tabless draft mode 不一致] → effective mode 只在 Desktop tabless entry 计算；send path 和模型投影使用同一值，既有会话 snapshot 不修改。
- [不可用项目可能增加菜单噪音] → 保持可见且禁用并展示 diagnostic，符合 fail-visible 用户数据约束。
- [窄窗口中提示与 Composer 总高度超过视口] → 外层允许纵向滚动并将居中降级为顶部安全 padding，不裁剪工具栏或菜单。
- [Desktop 与 Webview presentation type 扩展形成耦合] → contract 只含最小显示数据和回调，Project/Workspace 事实仍由 Host/Desktop authority 拥有；无路径或持久状态进入 Webview。

## Migration Plan

无需用户数据迁移。部署原子替换 Agent Webview presentation type、Desktop producer、组件和测试；回滚恢复旧顶部工作目录条，不影响 Project catalog、Workspace grants、Conversation 或用户内容。

## Open Questions

无。若未来需要多选上下文，应作为独立领域需求定义精确 owner，不能扩展本次 Window 导航菜单为多 Workspace authority。
