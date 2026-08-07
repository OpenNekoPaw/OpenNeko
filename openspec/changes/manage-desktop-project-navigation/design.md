## Context

PrimarySidebar 已消费 `@neko/host/desktop-shell-contract` 生成的 owner-qualified Project/Conversation 分组，并通过 `ShellActions` 调用 Scene transition、Project removal、Project conversation cleanup 与 Conversation deletion。当前项目组把多个操作永久展开为小图标，会话只提供删除按钮；两类条目都没有右键菜单。Agent Home 已为每个 Conversation 投影 `attention: none | running | needs-input | needs-review`，Renderer 目前只把非 `none` 状态画成无文本圆点。

这项变更横跨 Desktop Shell composition、共享 UI primitive、i18n 和 Renderer 验收，但不改变领域事实、Host command、IPC、持久化或 Agent runtime 生命周期。

## Goals / Non-Goals

**Goals:**

- 项目组和会话条目使用同一个共享 ContextMenu 交互模式，并复用现有 command handler。
- 项目菜单集中呈现打开、新建会话、项目管理、会话清理与项目移除。
- 会话菜单呈现精确恢复与删除，并保持不可用记录可清理但不可打开。
- 把实时 `running`、`needs-input`、`needs-review` 显示为条目右侧紧凑、可访问的状态图标。
- 不可用状态只保留警告图标；行内项目与会话操作仅在 hover/focus 时显示，降低常驻视觉噪音。
- 保持项目、会话、后台 Agent runtime 与当前 React Root 的所有权隔离。
- Project 可见性由当前 Conversation owner 与既有 Desktop stored Project context 共同投影，不再随最后一条 Conversation 清理而丢失，也不镜像完整 Project catalog。

**Non-Goals:**

- 不新增 Project/Conversation 数据字段、SQLite schema、迁移、版本或兼容路径。
- 不在 Renderer 推断 provider、turn、tool 或后台任务状态，也不显示历史完成状态。
- 不新增 Project detail Scene、第二套命令 router 或新的 Desktop IPC。
- 不改变项目移除、会话删除、不可用数据隔离和首次提交创建会话的既有业务语义。
- 不新增跨领域“已打开项目”总表、第二份最近项目 authority、隐藏 React Root 或 Project/Conversation 联合生命周期。

## Decisions

### 1. Desktop Renderer 组合现有 package-owned contracts

Owner 分工保持不变：`@neko/agent-contracts` 生产 Conversation attention，`@neko/host` 生产 grouped navigation 并拥有项目管理 application service，Desktop Main/preload 投影现有 typed ports，`apps/neko-desktop` Renderer 只拥有窗口级 presentation 与用户动作 wiring。生产 consumer 是 `DesktopShell.tsx`，canonical public entries 是 `@neko/host/desktop-shell-contract`、`@neko/host/desktop-scene-contract` 与 `@neko/ui`。

这部分逻辑保留在 `apps/*`，因为它决定 Electron 产品 Shell 中动作如何呈现和导航，不决定项目或会话领域结果。把菜单放入 Host 或 Agent package 会反向引入 React/Desktop presentation。

### 2. 复用 `@neko/ui` ContextMenu

项目 header 和会话 row 分别作为 `ContextMenu` trigger；menu item 直接调用当前 props 中的 exact action。这样右键、键盘 context-menu 语义、Portal、主题和 focus handling 由共享 primitive 负责，不增加 package-local 菜单实现。

项目管理入口调用现有 `open-project-management` Scene intent；打开和新建会话继续调用 exact Project 的 `open-project-workspace` intent。后者只打开 owner-bound draft，persisted Conversation 仍由首次提交 lifecycle 创建。

替代方案是在 Desktop 中维护鼠标坐标并渲染 `PositionedContextMenu`，但这会复制 open/close、focus 和键盘生命周期，因此不采用。

### 3. 状态只展示当前 attention

Renderer 对 `attention !== none` 显示带语义颜色的 trailing icon。`running` 表示后台 turn 正在执行，`needs-input` 和 `needs-review` 表示该会话需要用户处理。可见行内不重复状态文本，完整本地化语义由 Tooltip、`aria-label` 和 `role=status` 保留。`none` 不显示图标，避免把历史 `lastActivity` 误报为当前运行状态。

状态来自每个 Conversation identity 的 authoritative projection；active Scene 只决定选中展示，不参与状态计算。不可用 diagnostic 优先占用 trailing state 位置，避免一个失效条目同时声称可执行状态。

不可用 Project、Workspace group 和 Conversation 统一只显示 `WarningIcon`，diagnostic 继续保存在 Tooltip、title 与可访问名称中。Project header 的新增会话、会话清理和移除，以及 Conversation row 的删除操作放入绝对定位的 trailing action layer；默认透明且不接收指针，row hover 或 focus-within 时显示，避免布局位移并保留键盘可达性。右键菜单仍是完整且稳定的管理入口。

### 4. 不新增命令路径

菜单和既有可见按钮调用同一 `ShellActions`，确认、错误展示与 authoritative projection 更新保持唯一。Unavailable Project/Conversation 的 open item disabled；删除或移除仍显式可用。Context menu 关闭不修改 Project selection、group collapse 或 Agent runtime。

### 5. Unavailable Workspace 使用 canonical Conversation 删除

失去 Project catalog 身份的 `workspace` group 不是 Project，不提供打开、新建会话、项目移除等虚假操作。组 header 只提供“删除该工作区会话”，并提交该组当前 projection 中全部 owner-qualified Conversation identity。

现有 `conversations.delete` typed port 从单个 identity 收敛为非空 identity 数组；单条删除也提交单元素数组。Main 在执行任何删除前验证全部 identity 都属于当前 sender-bound Agent Home projection，再由现有 Agent lifecycle 顺序删除并只重新投影一次。旧单对象 payload 直接拒绝，不保留兼容解析、第二个 IPC channel 或 fallback。

状态和操作共享 trailing 位置时，row hover/focus 先隐藏 `.primary-navigation-state`，再显示 action layer；退出交互后状态恢复。这样保持行宽稳定，同时避免删除图标与告警/执行图标视觉重叠。

### 6. Recent Project context 独立于 Conversation 清理

完整 Project catalog 与侧栏 recent Project presentation 保持不同职责。`retainedProjects` 继续提供项目管理页的完整注册表；既有 `DesktopShellStoredState.projects` 是已经进入 Desktop Project context 的持久 owner，不新增表、字段或迁移。Host 从该状态投影 exact `recentProjectIds`，`projectDesktopConversationNavigation()` 只为以下 Project 生成 group：当前拥有 Conversation，或存在于 `recentProjectIds`。

`recentProjectIds` 属于 grouped navigation 的 canonical presentation contract，仅用于 producer/consumer 精确复算和校验。Renderer 不从 active tab、mounted Workspace Root、Conversation 数量或 catalog 顺序推断 recent Project，也不自行补组。完整 catalog 中从未进入 recent context 且没有 Conversation 的 Project 继续只出现在 Project Management Scene。

空 recent Project group 仍提供打开项目、新建会话、项目管理和移除项目操作；Workspace 会话清理保持 disabled，因为没有可提交的 Conversation identity。空组不渲染无意义的展开/折叠按钮，也不伪造“默认会话”或 empty Conversation record。Project group 出现在侧栏只表示轻量导航投影，不代表 Workspace Root、媒体 runtime 或 Agent runtime 驻留。

Project 从 catalog 显式移除后，其 recent identity 与 Project group 一并消失。若对应 Workspace Conversation 仍存在，则继续由既有 unavailable Workspace group fail-visible 投影，不能回退为 Project group或自动删除。

## Risks / Trade-offs

- [图标语义可能不够清晰] → 每个状态图标保留本地化 Tooltip、title 和可访问名称；在小窗口和暗色主题做真实 Electron 检查。
- [hover-only 操作可能影响键盘用户] → action layer 保留正常 Tab 顺序，并在 `focus-within` 时显示；右键菜单提供同一 canonical action。
- [右键菜单可能与嵌套 button 事件冲突] → 使用 Radix `asChild` 的现有共享 primitive，并测试普通点击、右键选择和 disabled primary action互不影响。
- [“项目管理”不能自动聚焦某一行] → 当前 Project Management Scene 是完整 catalog，菜单明确命名为通用项目管理入口；不为单一入口扩大 Scene contract。
- [运行完成后状态标签消失可能被误解] → 本变更只声明当前执行/attention 状态；完整历史终态继续由 conversation transcript 拥有。
- [批量清理中途发生存储错误] → Main 先验证全部 identity，删除阶段错误保持 fail-visible 并刷新 authoritative projection；不把部分完成伪装成整体成功。
- [既有 stored Project context 包含打开后尚未提交会话的 Project] → 这是当前“最近打开 Project”产品语义；它与有过 Conversation 的 Project 使用同一 exact context owner，允许创建第一条会话，但不会把完整 catalog 镜像进侧栏。
- [Project catalog 较大时管理记录增多] → Project Management Scene 继续使用完整 catalog 和既有滚动/批量管理；侧栏只消费 recent context 与 Conversation groups，不建立通用 LRU 或 runtime residency policy。

## Migration Plan

无需用户数据迁移。`conversations.delete` 是未发布的内部 typed payload，本次直接切换全部 producer/consumer 到 identity 数组并删除旧单对象解析；SQLite、项目和会话数据格式保持不变。

## Open Questions

无。若未来需要展示排队、暂停或取消等更多运行态，应先由 Agent owner 扩展 closed contract，再由 Desktop 消费，禁止 Renderer 从消息文本或当前页面推断。
