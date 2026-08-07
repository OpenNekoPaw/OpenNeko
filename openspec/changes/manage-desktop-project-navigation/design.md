## Context

PrimarySidebar 已消费 `@neko/host/desktop-shell-contract` 生成的 owner-qualified Project/Conversation 分组，并通过 `ShellActions` 调用 Scene transition、Project removal、Project conversation cleanup 与 Conversation deletion。当前项目组把多个操作永久展开为小图标，会话只提供删除按钮；两类条目都没有右键菜单。Agent Home 已为每个 Conversation 投影 `attention: none | running | needs-input | needs-review`，Renderer 目前只把非 `none` 状态画成无文本圆点。

这项变更横跨 Desktop Shell composition、共享 UI primitive、i18n 和 Renderer 验收，但不改变领域事实、Host command、IPC、持久化或 Agent runtime 生命周期。

## Goals / Non-Goals

**Goals:**

- 项目组和会话条目使用同一个共享 ContextMenu 交互模式，并复用现有 command handler。
- 项目菜单集中呈现打开、新建会话、项目管理、会话清理与项目移除。
- 会话菜单呈现精确恢复与删除，并保持不可用记录可清理但不可打开。
- 把实时 `running`、`needs-input`、`needs-review` 显示为条目右侧可读、可访问的状态标签。
- 保持项目、会话、后台 Agent runtime 与当前 React Root 的所有权隔离。

**Non-Goals:**

- 不新增 Project/Conversation 数据字段、SQLite schema、迁移、版本或兼容路径。
- 不在 Renderer 推断 provider、turn、tool 或后台任务状态，也不显示历史完成状态。
- 不新增 Project detail Scene、第二套命令 router 或新的 Desktop IPC。
- 不改变项目移除、会话删除、不可用数据隔离和首次提交创建会话的既有业务语义。

## Decisions

### 1. Desktop Renderer 组合现有 package-owned contracts

Owner 分工保持不变：`@neko/agent-contracts` 生产 Conversation attention，`@neko/host` 生产 grouped navigation 并拥有项目管理 application service，Desktop Main/preload 投影现有 typed ports，`apps/neko-desktop` Renderer 只拥有窗口级 presentation 与用户动作 wiring。生产 consumer 是 `DesktopShell.tsx`，canonical public entries 是 `@neko/host/desktop-shell-contract`、`@neko/host/desktop-scene-contract` 与 `@neko/ui`。

这部分逻辑保留在 `apps/*`，因为它决定 Electron 产品 Shell 中动作如何呈现和导航，不决定项目或会话领域结果。把菜单放入 Host 或 Agent package 会反向引入 React/Desktop presentation。

### 2. 复用 `@neko/ui` ContextMenu

项目 header 和会话 row 分别作为 `ContextMenu` trigger；menu item 直接调用当前 props 中的 exact action。这样右键、键盘 context-menu 语义、Portal、主题和 focus handling 由共享 primitive 负责，不增加 package-local 菜单实现。

项目管理入口调用现有 `open-project-management` Scene intent；打开和新建会话继续调用 exact Project 的 `open-project-workspace` intent。后者只打开 owner-bound draft，persisted Conversation 仍由首次提交 lifecycle 创建。

替代方案是在 Desktop 中维护鼠标坐标并渲染 `PositionedContextMenu`，但这会复制 open/close、focus 和键盘生命周期，因此不采用。

### 3. 状态只展示当前 attention

Renderer 对 `attention !== none` 显示带颜色标记和本地化文本的 trailing label。`running` 表示后台 turn 正在执行，`needs-input` 和 `needs-review` 表示该会话需要用户处理。`none` 不显示标签，避免把历史 `lastActivity` 误报为当前运行状态或让密集列表充满“空闲/已完成”。

状态来自每个 Conversation identity 的 authoritative projection；active Scene 只决定选中展示，不参与状态计算。不可用 diagnostic 优先占用 trailing state 位置，避免一个失效条目同时声称可执行状态。

### 4. 不新增命令路径

菜单和既有可见按钮调用同一 `ShellActions`，确认、错误展示与 authoritative projection 更新保持唯一。Unavailable Project/Conversation 的 open item disabled；删除或移除仍显式可用。Context menu 关闭不修改 Project selection、group collapse 或 Agent runtime。

## Risks / Trade-offs

- [较窄侧栏中的状态文本可能挤压标题] → trailing label 设置有界宽度和不可收缩的单行布局，项目/会话标题继续 ellipsis；在小窗口和暗色主题做真实 Electron 检查。
- [右键菜单可能与嵌套 button 事件冲突] → 使用 Radix `asChild` 的现有共享 primitive，并测试普通点击、右键选择和 disabled primary action互不影响。
- [“项目管理”不能自动聚焦某一行] → 当前 Project Management Scene 是完整 catalog，菜单明确命名为通用项目管理入口；不为单一入口扩大 Scene contract。
- [运行完成后状态标签消失可能被误解] → 本变更只声明当前执行/attention 状态；完整历史终态继续由 conversation transcript 拥有。

## Migration Plan

无需用户数据迁移。部署只替换 Renderer presentation；回滚可恢复旧 Renderer，同时 Host、IPC、SQLite、项目和会话数据保持不变。

## Open Questions

无。若未来需要展示排队、暂停或取消等更多运行态，应先由 Agent owner 扩展 closed contract，再由 Desktop 消费，禁止 Renderer 从消息文本或当前页面推断。
