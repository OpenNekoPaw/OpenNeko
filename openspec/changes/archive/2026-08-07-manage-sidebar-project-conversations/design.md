## Context

侧边栏由 `@neko/host` 的 `projectDesktopConversationNavigation()` 将 Project catalog 与 Agent Home projection 合成为项目/会话组。当前 `projects.removeRecent()` 只调用 `DesktopShellService.removeRecentProjects()`：Project、Tab 和 View 被移除后，仍存在的 workspace conversations 会被下一次投影归入 `kind: 'workspace'` 的不可用组，因此 UI 看起来像项目删除失败。

Renderer 目前只对超过五条的会话提供“展开显示”，没有整个 group 的折叠状态；Project header 只提供打开和移除记录，创建新会话依赖其他入口。Workspace group diagnostic 则单独占一行并显示原始字段名，与 Project/Conversation 的右侧“不可用”状态不一致。

本变更跨 `@neko/host` contract/application service、Electron Main/preload typed IPC 和 Desktop Renderer。Pi conversation runtime/transcript 的精确删除继续由 `@neko/agent-runtime` 既有 application host 拥有。

## Goals / Non-Goals

**Goals:**

- 一次显式确认后删除选中 Project 登记及其 authoritative conversation group，侧边栏不留下该 Project 对应的不可用 Workspace 组。
- 让 Project/Workspace/Assistant/Character/Room group 均可折叠，同时保留长列表的有限展开预算。
- 在 Project group 提供打开项目、新建会话、删除项目及会话的直接操作。
- 将所有 sidebar item-local unavailable 状态统一到条目右侧，完整 diagnostic 仍可访问。
- 保持 Project 文件和目录不被删除，局部失败保持可见且不伪装成功。

**Non-Goals:**

- 不删除磁盘 Project 目录、项目文件、媒体或生成产物。
- 不改变 Agent prompt、provider、run、queue、transcript schema 或后台任务生命周期。
- 不持久化 group 折叠状态，不建立跨应用 tree framework。
- 不增加数据版本、迁移、旧 IPC alias、fallback 或 dual-write。

## Decisions

### `@neko/host` 拥有 Project/Conversation 删除编排

新增 host-neutral `DesktopProjectConversationManagementService`。其 producer/public entry 位于 `@neko/host`，consumer 是 Desktop Main；服务依赖 `DesktopShellService` 与一个最小 `DesktopConversationDeletionPort`。Electron Main 只注入 `AgentAppHost.deleteConversation()` 的 concrete port，不决定删除集合或顺序。

`DesktopShellService.removeProjectsFromCatalog()` 在自身 mutation queue 内验证整批 identity，依据同一时刻的 authoritative conversation navigation 捕获每个 Project 的精确 conversation navigation identities，随后原子撤销 Workspace registry 并一次提交 Project/Tab/View state。Management service 再调用 conversation deletion port，最后读取新 projection。

先提交 Project state，再删除 conversations。若 conversation authority 删除失败，Project 不会重新出现，剩余 conversations 会按现有失效数据规则显示为 item-local unavailable Workspace group，操作返回失败并允许用户继续逐条清理。该顺序优先保护会话数据，不增加跨 SQLite/文件 authority 的伪事务、补偿或 fallback。

替代方案是在 `DesktopAppHost` 中直接循环删除。该逻辑决定跨领域业务结果且不依赖 Electron object，因此违反薄组合根边界。另一方案是先删 conversations 再删 Project；后一步失败会造成不可恢复的会话丢失而 Project 仍显示，因此不采用。

### 删除 contract 只保留一个明确成功路径

package-owned wire contract 从 `projects.removeRecent(projectIds)` 替换为 `projects.delete(projectIds)`，channel、request creator/parser、Main handler、preload bridge 与 Renderer 调用方一次性切换。request 继续只接受唯一非空 `projectIds`；旧 method/channel 不保留 alias 或 handler。

项目目录单行、批量工具栏和侧边栏 Project group 均调用同一 contract。确认文案明确会删除关联会话但不删除项目文件。无 Project identity、重复 identity、陈旧 sender/session 或非 authoritative group 必须 fail-visible。

### 新会话复用 canonical Workspace draft transition

Project group 的“打开项目”和“新增会话”均使用既有 `open-project-workspace` Scene transition。打开已有 session 时该 transition 创建新的 workspace draft；当前已经是同 Project 的未提交 draft 时复用该 draft，避免制造多个没有持久 identity 的空会话。首次 submit 仍由既有 Agent lifecycle materialize conversation，Renderer 不预建 transcript 或后台 runtime。

### 折叠和长列表预算保持 Renderer-local

`PrimaryRecentNavigation` 分别保存 collapsed group identities 与“显示全部” identities。group 默认展开但最多渲染最近五条；折叠时不渲染 children，“显示更多”只改变已展开 group 的有限列表。状态不写入 Shell projection，也不影响后台 Agent runtime、attention 或 durable history。

Project header 使用 chevron、名称链接和熟悉的图标操作；不新增文本胶囊或 package-local menu system。复用 `@neko/ui` 的 IconButton、Tooltip 和 icons。

### Sidebar diagnostics 使用单一右侧状态组件

Project、Workspace group 和 Conversation row 复用一个 Renderer-local `NavigationUnavailableStatus`，视觉只显示 Warning icon 与“不可用”，完整 message 通过 tooltip、`title` 与 `aria-label` 暴露。状态占固定右侧 grid track，不再在 group 下方渲染原始 `workspaceId` 字段行，也不挤压主标题。

该组件仅组合 Desktop sidebar 的业务 diagnostic 与 `@neko/ui` primitive，不复制主题 token、错误 taxonomy 或全局通知。若第三个独立 Webview 出现同一 item-local diagnostic contract，再评估提取到 `@neko/ui`。

## Risks / Trade-offs

- [Project state 与 conversation authority 无跨 store 事务] → 先移除 Project state；conversation 删除失败时保留剩余失效会话并返回错误，不补偿、不隐藏。
- [运行中的 conversation 被项目级删除] → 复用 Agent application host 的精确删除入口，由其停止 runtime、拒绝 pending turn 并清理 transcript；不从 Renderer 直接处理运行状态。
- [同 workspace 对应多个 Project] → 只删除被选 Project group 中由 authoritative projector 归属的 conversations，不按当前 active Project 或模糊 workspace 猜测。
- [折叠隐藏 attention item] → group header 保留 conversation count；全局 attention summary 继续来自 Agent Home projection，不因 React children 卸载而改变。
- [窄 sidebar 操作拥挤] → 使用固定 24px icon tracks、ellipsis 主标签和统一右侧状态，并在最小 sidebar 宽度和亮暗主题验收。

## Migration Plan

1. 建立 `@neko/host` management service、严格 delete request/channel 与生产者测试。
2. 一次性切换 Main/preload/Renderer，删除 `removeRecent` wire path 和旧测试命名。
3. 实现 group collapse、Project actions 与统一 diagnostic row，补交互和布局测试。
4. 扩展隔离 Electron fixture，验证 Project 删除后 catalog、sidebar group 与 conversations 同时消失，以及失败会话仍局部可处理。
5. 运行 Host/Desktop 测试、typecheck/build、legacy/internal-version 门禁、质量审查和 UI 验收。

回滚代码不会恢复用户已经显式删除的会话；Project 目录和文件始终不受影响。不存在 schema version 或迁移步骤。

## Open Questions

无。
