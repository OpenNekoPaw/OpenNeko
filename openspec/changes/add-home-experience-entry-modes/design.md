## Context

Home 当前只有一个未命名的 Agent Entry Draft。Assistant 首次提交可以保持 unbound，Workspace 可以通过
现有 Project/目录选择器获得精确 `workspaceId + workspaceGrantId`，但界面没有在输入前表达这两种不同的
authority 要求。Character/Room 与 World 又分别由 `@neko/chara` 和未来 `@neko/world` 拥有，不能被普通
Agent Conversation 模拟。结果是用户只能在发送后才发现缺失 Workspace target，或把执行模式误认为产品
体验模式。

现有架构已经提供唯一 canonical Launch Draft、typed domain binding、sender-bound Workspace grant 和首次
submit transaction。本变更只增加 Home Entry 的 package-owned presentation 与前置验证，不建立第二套
Draft、Session、Scene 或领域 runtime。

### 五层分析

| 层   | 结论                                                                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Agent Webview 拥有入口展示、可丢弃 Draft presentation 和发送前 UI validation；Agent application 拥有 Draft binding 与 submit；Host/Workspace 拥有 Project identity 和 grant；Chara/World 拥有各自 Run。 |
| 依赖 | Renderer 只消费现有 typed launch projection 与 Workspace chooser，不读取目录、持久项目事实或 Electron API；Desktop 不解释入口业务规则。                                                                 |
| 接口 | 在现有 Window Entry Draft snapshot 增加一个可选的 `experienceMode` presentation field；复用 `bindTarget`、binding receipt、configuration policy 和 `submitDraft`。                                      |
| 扩展 | Character/World 当前由单一 presenter 投影 owner-qualified unavailable；未来只能在对应 package 提供 exact launch provider 后原子替换该 availability。                                                    |
| 测试 | Presenter、snapshot、controller 和 component 测试证明模式、精确 Workspace grant、无 fallback、可编辑输入和首次提交；真实 Agent 路径复用已有 launch-binding Evaluation。                                 |

## Goals / Non-Goals

**Goals:**

- 在 Home 提供 `助手 | 工作区 | 角色 | 世界` 四个清晰的产品体验入口。
- 让 Assistant 在模型配置有效时无需 Workspace 即可提交。
- 让 Workspace 在提交前必须具有精确 Project/目录 identity、授权 grant 和匹配的 Draft binding receipt。
- 缺失 target、授权或配置时保持输入可编辑，只禁用发送并提供可操作诊断。
- 在首次提交前展示现有 `计划 | 审批 | 自动`执行模式，明确它与体验入口是正交状态。
- Character/World provider 未组合时 fail-visible、fail-local，不创建普通 Agent Conversation 作为替代。

**Non-Goals:**

- 不实现 CharacterVersion 发布、Dialogue/Room Run、WorldExperienceVersion 或 WorldRun。
- 不新增 Home/Workbench Scene、跨领域 Entry registry、每种模式一个 Draft 或隐藏 mounted Root。
- 不让 Renderer、Desktop 或 presentation snapshot 成为 Workspace/Character/World authority。
- 不根据 active/current/recent Project、Character 或 World 猜测 target。
- 不重新设计 Agent execution mode、模型配置或 Workspace grant 生命周期。

## Decisions

### 1. 每个 Window 继续只有一个 Entry Draft

`assistant | workspace | character | world` 是 Window Entry Draft 的 presentation intent，不是新的业务
实例 identity。它作为 `AgentEntryDraftSnapshot` 的可选字段保存；字段缺失时使用 canonical `assistant`
fresh state。现有未发送输入因此可以保留，不需要 schema 版本、migrator、dual-read 或旧 shape dispatch。

切换入口只更新这个 Draft 的 presentation，并通过现有 `bindTarget` 精确更新当前 target。它不会创建或
删除 Conversation、CharacterRun、RoomRun、WorldRun，不会保留隐藏业务 Root，也不会取消、重定向或
改变已经创建的后台任务。输入文本在模式间保留；与目标不兼容的引用必须清除或失效。

### 2. 体验模式和执行模式正交

顶部 segmented selector 表达“用户要进入哪种产品体验”；composer 内已有的
`计划 | 审批 | 自动`表达 Agent 首次 Turn 的执行策略。两者必须同时可见、分别持久化，不能合并为一个
`mode` 枚举。本变更删除 Entry 上 `!isEntry` 的展示限制，取代
`compose-desktop-workbench-scenes` 中“紧凑入口隐藏执行模式控件”的旧 UI 决策，但不改变 execution
mode contract 或 runtime 语义。

### 3. Assistant 和 Workspace 使用同一 canonical submit path

Assistant 模式要求当前 Draft 为 unbound/assistant-compatible，且 effective model configuration 可执行；
它不需要 Project/目录，也不得获得隐式 Workspace authority。

Workspace 模式必须同时满足：

1. Home 组合提供现有 Project/目录选择器；
2. 用户选中的 presentation target 含精确 `workspaceId` 与 `workspaceGrantId`；
3. authoritative Draft binding 与该 identity/grant 完全匹配，并持有当前 binding receipt；
4. effective model configuration 可执行。

任一条件不满足时，发送按钮禁用并显示 owning reason；submit handler 仍再次校验 authoritative Draft，避免
UI 与异步 binding 更新之间的竞态。验证失败不创建 Conversation，不切换 Scene，也不尝试 active Project。

### 4. 缺失前置条件不锁定输入或页面

Project/目录未选、授权被拒绝、binding 正在更新或 Character/World 不可用时，textarea 继续允许编辑，
模式切换和页面布局保持可操作。只有发送动作被阻止。诊断显示在 composer 附近，发送按钮的 title 和
accessible name 使用同一原因；不能通过 broad `disabled` 把整个 InputArea、Window 或 Root 锁住。

### 5. Character 和 World 当前只提供 owner-qualified unavailable

Character 入口可被选择以说明它需要 Chara-owned published CharacterVersion 与 Dialogue/Room launch
provider；World 入口可被选择以说明它需要 World-owned WorldExperienceVersion 与 Run provider。两者当前
都不得调用 `submitDraft`、编码特殊文本、构造空 binding 或退化为普通 Assistant/Workspace Conversation。

未来接入必须由对应 owner 公开 exact typed launch projection 后更新同一个入口 presenter 和 submit
transaction，不能额外注册 parallel handler 或 generic fallback。

### 6. Desktop 只复用现有 chooser 和 grant boundary

Desktop 已经通过 `AgentComposerWorkspacePresentation` 提供 Project/目录选择，并返回 opaque、精确的
Workspace target。Webview 只消费该公开 projection 并调用现有 `bindTarget`；本变更不修改目录授权规则，
不把 raw path 写入 snapshot，也不在 `DesktopShell` 重复实现验证。目录授权拒绝只影响当前 Draft，其他
Scene、Conversation 和 Workspace 保持可用。

### Replaced paths

- 用显式 Assistant/Workspace intent 取代“同一个 Entry composer 可选地带 Workspace target”的含混展示。
- 用顶部体验选择取代 Home 中旧的 `start-chat | roleplay` presentation action；不保留两套入口控件。
- 删除 Entry 对 execution mode selector 的无条件隐藏；不保留 feature flag 或替代 renderer。
- Character/World 不增加成功 handler，直到 authoritative owner provider 可用。

## Risks / Trade-offs

- **四个入口中两个暂不可用：** 这比隐藏能力更诚实，但可能显得未完成。通过明确 owner 与下一步要求，
  避免误导为临时网络错误。
- **异步 target binding 可能短暂阻止发送：** 使用局部 pending 状态与 authoritative revalidation，保留输入
  和其余 UI，而不是允许 stale grant 提交。
- **入口 snapshot 新字段缺失：** 采用可选 presentation field 和 canonical Assistant fresh state；若字段值
  非法，只局部重置该字段并显示 diagnostic，不丢弃用户输入或 durable facts。
- **窄窗口顶部 selector 可能拥挤：** 使用可横向适配的 segmented control，并通过可见 UI 验收覆盖桌面与
  窄宽度；不为此保留另一套移动 UI。

## User Data And Runtime Boundaries

本变更不迁移或重写 Conversation、Project、Character、World 等 durable data。Entry snapshot 只保存未发送
输入与 presentation；Workspace authority 始终由当前 Draft binding receipt 和 Host grant 证明。无效 snapshot
只在当前 Window Entry Draft 内 fail-local，不能清空 sibling Conversation、停止后台任务或使 Desktop Shell
启动失败。
