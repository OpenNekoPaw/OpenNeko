## Context

`DesktopProjectCatalogSurface` 当前同时承担窗口级目录展示与页面内多选 presentation：单击项目只更新本地 `selectedProjectIds`，双击才发送 `open-project-workspace` scene intent；只要有选择，组件就在搜索栏和集合之间插入批量工具条。项目数量通常较少且页面首要用途是进入 Workspace，这套批处理优先级造成了不必要的交互步骤和布局跳动。

项目登记、Conversation 和本地文件具有不同 owner 与生命周期。`@neko/host` 的 `DesktopProjectManagementService` 分别提供 `removeProjects` 与 `deleteProjectConversations`；Agent runtime 拥有 Conversation 删除；项目目录和文件不在这两个命令的删除范围。本次只改 Desktop Renderer presentation，不能通过合并按钮重新耦合这些 owner。

五层分析如下：

- 职责：Desktop Renderer 决定当前 Window 内项目目录的布局、焦点与 scene intent；Host 决定项目登记和精确 Workspace Conversation 操作。
- 依赖：组件只依赖 package-owned `@neko/host/desktop-shell-contract` 投影和 `@neko/ui`，不接触 Electron、Node、文件路径或持久化。
- 接口：现有 `onOpen(projectId)`、`onRemove([project])` 和 `onDeleteConversations([project])` 足以表达全部动作，无需新增或改变 typed IPC。
- 扩展：网格/列表只是当前组件的可丢弃 presentation state；移除 selection state 后不会形成新的 registry、snapshot 或替代路径。
- 测试：组件测试覆盖单击、键盘、视图切换、失效项目和精确动作；Desktop Application 测试覆盖 scene delegation 与确认；真实 Electron 验收覆盖正常、紧凑、失效和操作状态。

## Goals / Non-Goals

**Goals:**

- 让项目卡片成为直接、可键盘操作的 Workspace 导航入口。
- 默认使用稳定响应式网格，仍允许用户在当前挂载周期切换到列表。
- 删除选择工具条及其引起的内容位移，并保持项目级管理动作始终属于对应卡片。
- 保持项目登记、Conversation 和本地文件的独立生命周期及 fail-visible 语义。

**Non-Goals:**

- 不改变 `@neko/host` application service、Desktop Main/preload channel 或 Agent Conversation 删除逻辑。
- 不提供项目目录或项目文件删除，不增加“同时删除”组合命令。
- 不持久化 view mode，不保留旧多选路径、快捷键或 feature flag。
- 不改变搜索、排序、滚动、空状态和失效记录可见性。

## Decisions

### 1. 单击与键盘激活直接发送精确 Project scene intent

可用项目的主按钮直接调用既有 `onOpen(project.projectId)`；按钮原生支持 Enter/Space。失效项目主按钮保持 disabled，诊断和项目级移除操作仍可见。删除 `aria-pressed`、modifier/range/select-all、selection reconciliation、Delete shortcut 和双击 handler，使同一输入只存在一条成功路径。

替代方案是保留单击选择并隐藏批量栏，但这会保留不可见 selection authority，也让单击和双击继续表达不同语义。另一方案是单击选中后显示固定 detail panel，但当前没有独立 Project detail 生命周期或信息密度，不应制造 Secondary Main。

### 2. 默认网格是 Renderer-local canonical fresh state

`view` 的 fresh state 改为 `grid`，两个 icon button 继续显式切换 `grid`/`list` 并提供独立可访问标签。网格使用稳定的响应式列宽和卡片尺寸，compact panel 收敛为单列；列表仍使用紧凑横向布局。组件卸载后恢复默认网格属于可丢弃 presentation state，不读取旧选择或 layout 数据，也不需要迁移。

此前已完成但尚未归档的滚动变更中“列表默认”描述被本变更的更新需求取代；滚动 owner、失效诊断和空状态约束继续有效。

### 3. 管理动作保留两种数据语义，但不再形成批量浮条

每个项目条目继续提供两个 icon action，并通过 tooltip/accessible label 明确区分：

- 移除项目：撤销 Project/Workspace 登记和 Window 引用，保留全部 Conversation 与文件。
- 删除项目会话：只删除该 Project 精确 Workspace-owned Conversations，保留 Project 登记与文件；无会话时 disabled。

二者继续委托现有单元素 project-id collection contract。这一选择符合用户数据保护，也避免“删除项目”在实际并不删除磁盘项目时产生错误承诺。把两个命令合并会重新跨越 Host/Agent 两个 authority，导致不可逆历史删除成为普通目录整理的副作用，因此不采用。

### 4. 生产逻辑继续位于 Desktop Application presentation boundary

canonical producer 是 `@neko/host` 的 `DesktopShellProjection` 与 project management public port；consumer 是 `apps/neko-desktop/src/renderer/DesktopProjectManagementSurface.tsx`，scene intent wiring 位于 `DesktopShell.tsx`。运行边界完全位于 sandboxed Renderer；Main/preload 仅消费未变的 typed mutation。这里的代码依赖当前 Window 的可见 scene、DOM input 和响应式布局，且不决定 host-neutral 业务结果，因此保留在 `apps/*` 符合 Application composition boundary。

被替代路径仅为 Renderer-local selection/batch presentation；完成时删除相关 helper、i18n 和 CSS，不保留 alias、fallback 或隐藏 DOM。用户数据和持久 contract 均不迁移。

## Risks / Trade-offs

- [失去批量整理能力] → 当前主要路径优先直接进入项目；仍保留精确单项目管理。未来若有真实大目录证据，应设计独立、显式进入的管理模式，而不是让普通单击隐式进入批处理。
- [卡片动作可能被误认为打开卡片的一部分] → 主按钮与 action buttons 保持 sibling DOM，固定 action 尺寸并分别提供 focus ring、tooltip 和 accessible label。
- [单击行为变化导致既有测试或用户习惯失效] → 原子删除双击/选择路径，增加 scene delegation 与“不渲染 batch toolbar”路径级断言。
- [网格中的长诊断挤压卡片] → 保持两行截断、完整 title 和稳定卡片最小尺寸，并在 compact/失效状态截图中检查。

## Migration Plan

1. 删除 Renderer selection state、helpers、batch markup 和双击路径，连接主按钮单击到现有 `onOpen`。
2. 将 fresh view 改为 grid，补充网格/列表的稳定布局和可访问 view labels。
3. 更新组件与 Desktop Application 测试，删除旧批量选择 fixture 和对应文案/CSS。
4. 运行 focused tests、Desktop typecheck/build、OpenSpec/legacy/unused checks，并通过隔离真实 Electron 验收正常与紧凑视图。

回滚仅恢复 Renderer 展示代码；不读取、写入、迁移或删除任何用户项目、Conversation 或文件。

## Open Questions

无。
