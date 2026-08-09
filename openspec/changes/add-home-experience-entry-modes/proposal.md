## Why

Desktop Home 当前把未绑定 Assistant Draft、可选 Workspace target、未来 Character/Room 与 World
入口压在同一个无模式的 Agent launchpad 中，用户无法在输入前确认正在启动哪一种体验，也无法理解
为什么某些输入缺少项目、角色或世界身份而不能提交。入口需要一个明确、可验证的场景选择，同时继续
遵守各领域独立 owner 和生命周期边界。

## What Changes

- 在 Home launchpad 增加窗口级、顶部居中的体验入口选择：`助手 | 工作区 | 角色 | 世界`；它选择当前
  Launch Draft 的展示和目标要求，不是 Agent 的 `计划 | 审批 | 自动`执行模式。
- 助手入口继续使用 unbound Agent Launch Draft，可在有效模型配置就绪后直接提交，并可使用用户显式
  授权的单个引用；它不得获得隐式 Workspace authority。
- 工作区入口要求一个精确、有效且已授权的 Project/Workspace target。用户必须通过现有 Project/目录
  选择路径获得 owner identity 与 grant receipt；缺失、失效、授权拒绝或配置未就绪时，composer 保留
  输入但禁用提交并显示最小、可操作的诊断。
- 角色入口在 `@neko/chara` 的 Character/Dialogue/Room launch provider 尚未完成组合时显示
  owner-qualified unavailable；不得把普通 Agent Conversation、角色名文本或最近角色当作成功路径。
  后续接入后，一个精确 published CharacterVersion 启动 Dialogue，多个精确角色启动 Chatroom。
- 世界入口在 `@neko/world` 的 World Library、WorldExperienceVersion 与 Run provider 尚未完成组合时显示
  owner-qualified unavailable；不得将 World 降级为普通聊天室或提示词模板。
- 切换入口不创建 Conversation、CharacterRun、RoomRun 或 WorldRun，不取消后台任务，也不重绑定已创建
  的业务实例；每个 Window 仍只有一个 Entry Draft，入口意图只作为该 Draft 的最小可丢弃 presentation，
  真正 owner 由首次 typed submit 决定。
- 入口选择与 workspace target 验证使用现有 Agent Launch Draft、domain binding 和配置策略路径；删除
  `isEntry` 对 canonical 执行模式控件的无条件隐藏，使用户能在首次提交前看到并设置
  `计划 | 审批 | 自动`。

## Capabilities

### New Capabilities

- `home-experience-entry-modes`: 定义 Home 体验入口选择、各入口所需 owner/binding、输入前验证、不可用
  诊断、Draft 隔离和首次 typed submit 边界。

### Modified Capabilities

<!-- Related Agent launch, Workbench, Character and World requirements are active changes rather than canonical main specs. -->

## Impact

- `@neko/agent-contracts` 与 `@neko/agent-webview`：复用 canonical Launch Draft、Workspace binding、配置
  policy 与 composer；Agent Webview 拥有入口选择的 package-owned presentation，不拥有 Project、Chara
  或 World 事实。
- `@neko/agent-runtime`：继续拥有 Draft submit 验证和唯一 AgentSession/Conversation materialization；本
  变更不增加领域专用 Agent runtime，也不从 active/current/recent identity 推断目标。
- `@neko/host` 与 `apps/neko-desktop`：Host 继续拥有 Window scene、Project/Workspace identity 和目录授权；
  Desktop 只组合公开 projection、typed intent 与 unavailable diagnostic，不实现领域规则。
- `@neko/chara` 与未来 `@neko/world`：各自继续拥有 Character/Room 与 WorldExperience/Run 生命周期；当前
  未组合 provider 时只提供 fail-visible unavailable，不伪造空记录或 fallback Conversation。
- 相关活跃变更：`unify-agent-launch-and-domain-bindings`、`compose-desktop-workbench-scenes`、
  `define-character-dialogue-chatroom-world-foundation` 和 `define-ai-native-interactive-world`。本变更实现前
  以这些 owner 约束为输入，不建立平行 Draft、Scene 或 runtime 路径。
