## Why

Desktop PrimarySidebar 已能按项目展示会话，但项目与会话操作依赖常驻的小图标按钮，缺少一致的右键菜单；会话运行、等待输入和等待审阅状态也只显示无文本圆点，用户无法快速判断后台任务状态。项目管理能力虽然已有 canonical command，但没有从项目导航条目提供清晰、集中的入口。Host 还会过滤没有会话的 recent Project context，导致清空最后一条 Conversation 后对应 Workspace 从侧栏消失；若直接镜像完整 Project catalog，又会让从未进入 recent context 的管理记录长期占用会话导航。

## What Changes

- 为 PrimarySidebar 的项目组与会话条目增加复用 `@neko/ui` primitive 的右键菜单，并保留键盘可达的条目语义。
- 项目菜单集中提供打开项目、新建项目会话、进入项目管理、删除该项目工作区会话和移除项目；不可用项目只允许安全的管理与清理操作。
- 会话菜单提供打开和删除；不可用会话继续禁止打开，但允许显式删除。
- 将 Agent Home 已投影的 `running`、`needs-input`、`needs-review` 状态显示为条目右侧的紧凑图标，并通过 Tooltip 与可访问名称保留完整语义。
- 不可用状态仅显示警告图标；项目与会话的行内操作默认收起，在条目悬停或键盘聚焦时显示，右键菜单保持完整操作入口。
- 失去 Project catalog 身份的 Workspace 会话组提供组级会话清理操作，但继续禁止打开或伪装成可用项目。
- 行内操作显示时隐藏同一 trailing 位置的状态图标，操作退出后恢复，禁止删除图标与告警/执行图标叠加。
- 保留 Host 已持久化的 recent Project context，即使其最后一条 Conversation 已被清理；完整 Project catalog 中从未进入该上下文且没有 Conversation 的项目不进入侧栏。
- 空 recent Project group 仍可打开并创建第一条会话，但不伪造 Conversation，也不显示无效的折叠交互。
- 保持 Project、Conversation、Scene 和 Agent runtime 的现有 owner 与 typed port，不新增 IPC 成功路径、兼容分支或 fallback。

## Capabilities

### New Capabilities

<!-- None. This change extends the existing Desktop sidebar capability. -->

### Modified Capabilities

- `desktop-sidebar-project-management`: 项目组和会话条目增加一致的上下文操作，把当前会话执行注意状态显示在条目右侧，并让 Project 导航可见性独立于其 Conversation 数量。
- `desktop-conversation-context-navigation`: grouped navigation 增加 Host 投影的 exact recent Project context，使清理最后一条 Conversation 后仍保留项目入口，同时排除 catalog-only 空项目。

## Impact

- `apps/neko-desktop/src/renderer/DesktopShell.tsx`：Desktop 产品 Shell 组合现有 project/conversation actions、Scene intent、Agent Home projection 与共享 ContextMenu；仅拥有窗口级 presentation 和交互 wiring。
- `apps/neko-desktop/src/renderer/styles.css` 与 i18n：组合紧凑状态图标、hover/focus 操作区和菜单文案，不建立 package-local design system。
- `apps/neko-desktop/src/renderer/DesktopApplication.test.tsx`、样式测试与真实 Electron 验收：覆盖右键操作、禁用态、执行状态与相邻导航行为。
- `@neko/host` grouped navigation projection：从既有 Desktop stored Projects 投影 exact recent Project identities，保留清空会话后的最近项目组，同时排除从未进入 recent context 的空 catalog 项目；不新增持久字段或第二份 Project authority。
- `@neko/agent-contracts`、preload/Main IPC、SQLite 和用户项目数据不变。
