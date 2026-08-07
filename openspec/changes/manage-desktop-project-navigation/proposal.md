## Why

Desktop PrimarySidebar 已能按项目展示会话，但项目与会话操作依赖常驻的小图标按钮，缺少一致的右键菜单；会话运行、等待输入和等待审阅状态也只显示无文本圆点，用户无法快速判断后台任务状态。项目管理能力虽然已有 canonical command，但没有从项目导航条目提供清晰、集中的入口。

## What Changes

- 为 PrimarySidebar 的项目组与会话条目增加复用 `@neko/ui` primitive 的右键菜单，并保留键盘可达的条目语义。
- 项目菜单集中提供打开项目、新建项目会话、进入项目管理、删除该项目工作区会话和移除项目；不可用项目只允许安全的管理与清理操作。
- 会话菜单提供打开和删除；不可用会话继续禁止打开，但允许显式删除。
- 将 Agent Home 已投影的 `running`、`needs-input`、`needs-review` 状态显示为条目右侧的可读状态，不新增持久字段、数据库迁移或 Renderer 推断。
- 保持 Project、Conversation、Scene 和 Agent runtime 的现有 owner 与 typed port，不新增 IPC 成功路径、兼容分支或 fallback。

## Capabilities

### New Capabilities

<!-- None. This change extends the existing Desktop sidebar capability. -->

### Modified Capabilities

- `desktop-sidebar-project-management`: 项目组和会话条目增加一致的上下文操作，并把当前会话执行注意状态显示在条目右侧。

## Impact

- `apps/neko-desktop/src/renderer/DesktopShell.tsx`：Desktop 产品 Shell 组合现有 project/conversation actions、Scene intent、Agent Home projection 与共享 ContextMenu；仅拥有窗口级 presentation 和交互 wiring。
- `apps/neko-desktop/src/renderer/styles.css` 与 i18n：增加紧凑状态标签和菜单文案，不建立 package-local design system。
- `apps/neko-desktop/src/renderer/DesktopApplication.test.tsx`、样式测试与真实 Electron 验收：覆盖右键操作、禁用态、执行状态与相邻导航行为。
- `@neko/host`、`@neko/agent-contracts`、preload/Main IPC、SQLite 和用户项目数据不变；本次只消费其现有公开契约。
