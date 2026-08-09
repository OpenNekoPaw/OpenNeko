## Why

`@neko/chara` 当前只有 Character Dialogue、Embody、角色证据和 Profile Assembly 内核，尚未形成可创建、发布和运行的 Character 产品，也没有完成单角色对话或多角色聊天室的 Desktop canonical path。现有设计还把聊天室与 Play、外部游戏、VLA 和 Computer Use 绑定在同一变更中，导致角色、房间和世界事实依赖尚未建立时就提前设计宿主控制能力。

当前产品需要先交付三项独立但可组合的基础能力：角色、单角色对话和多角色聊天室。聊天室还需要一个真实但最小的 World Foundation，拥有世界书、背景、演化、世界事件 timeline、状态和参与者视图；完整 AI-native World、实时世界模型、Play-use 及 Browser/Computer Use 由独立后续变更扩展。

## What Changes

- 建立 `CharacterProject -> immutable CharacterVersion`，支持角色 canon、知识边界、策略、证据、表现引用、创作测试、审阅和发布。
- 将 Character 产品入口改为与 Project Management 一致的管理场景：Main 展示可搜索、可筛选的 Character catalog，Secondary Main 展示所选角色的 detail、版本、表现和运行记录；不再把 Character、Dialogue、Chatroom、World 作为四个平级 Tab。
- 对话不提供独立管理页或必经 Chatroom 入口。用户从 Agent Entry 通过一个或多个显式 `@CharacterVersion` 选择启动互动：一个角色创建 Dialogue，多角色创建 Room；未选择角色仍按普通 Agent Entry 处理。
- 为 Character/Room Conversation 建立独立 Workbench composition：Agent Interaction slot、2D/3D Avatar/Scene Main slot、Character/World Resources manager slot，以及按需出现的 Room/World timeline；历史 Conversation/Run 不以隐藏 Root 保持驻留。
- 建立可替换 Character Avatar 表现边界，首批承认 portrait、Live2D、VRM、MMD 和 PNGTuber 等表现类型及其稳定资源引用；具体 renderer/runtime 按真实格式逐项接入，缺失 renderer 必须明确 unavailable。
- 增加角色运行管理投影，分别展示 companion 关系记忆、Dialogue/Room 运行、narrative story/save/branch 和表现状态；Agent transcript、WorldSave 和 presentation snapshot 继续由各自 owner 管理。
- 将互动拓扑建模为单角色 `dialogue` 与多参与者 `chatroom`，将运行/记忆模式独立建模为 `companion | narrative`，不再使用 `single/multi x dialogue/play` 作为 Chara 核心产品模型。
- 每个 agent-controlled CharacterRun 精确映射一个 primary Pi AgentSession；Chara 不拥有第二套 transcript、turn、Tool Call、Approval 或模型循环。
- 建立 Chara-owned CharacterRoom、RoomRun、participant/controller、调度和有序 Room timeline；human-controlled character 不创建隐藏 AgentSession。
- 引入最小、可运行的 World Foundation：`WorldProject -> WorldVersion -> WorldRun -> WorldEvent -> WorldState -> WorldView`，并为当前叙事模式提供精确 WorldSave、branch 和时间点身份。
- 区分 Room timeline 与 World timeline。角色发言、加入、退出和调度属于 Room；世界状态变化只有经 World application service 校验并提交后才成为 WorldEvent。
- 日常模式可以不绑定 World，长期记忆由 UserCharacterRelationship 拥有；叙事模式必须绑定精确 WorldVersion、WorldRun、WorldSave 和 branch，事实与记忆由 World authority 拥有。
- runtime kind 和 World binding 在 DialogueRun/RoomRun 创建时冻结；模式切换或叙事 authority 变化必须创建新 Run，不得隐式复制记忆或降级到日常模式。
- 当前变更不实现或定义 Browser Use、Computer Use、Play-use、外部游戏、VLA、seat lease、实时输入控制或跨游戏学习；这些能力由其他独立变更负责。
- 完整 WorldExperience、AI World Model、Director/Narrator、实时多模态表现、复杂 checkpoint/replay 和 Activity control 继续作为未来扩展，并复用本次建立的唯一 World authority。

## Capabilities

### New Capabilities

- `character-authoring-publication`: CharacterProject、不可变 CharacterVersion、证据、创作测试、审阅、发布和失效诊断。
- `character-dialogue-chatroom`: companion/narrative 单角色对话、多参与者聊天室、CharacterRun、participant/controller、AgentSession mapping、Room timeline、调度、可见性和生命周期。
- `character-experience-workbench`: Character catalog/detail 管理、Agent Entry `@角色` 启动、Character/Room Workbench composition、Avatar 表现选择和角色运行管理投影。
- `chatroom-world-foundation`: WorldProject、WorldVersion、世界书、背景、WorldRun、WorldEvent、WorldState、participant-scoped WorldView，以及叙事 WorldSave/branch binding。

### Modified Capabilities

无。

## Impact

- Owning responsibility：`@neko/chara` 拥有 CharacterProject/Version/Run、UserCharacterRelationship、CharacterRoom/RoomRun、participant policy、Room event 和记忆候选；不拥有 Agent transcript 或世界事实。
- World responsibility：当前建立最小 host-neutral World contracts/domain/application/testing 闭包，拥有 World definition、run、event、state、save/branch 和 WorldView；完整 World 产品 surface 与实时 AI 能力仍保持 unavailable。
- Agent responsibility：`@neko/agent-runtime` 继续拥有唯一 Pi AgentSession、conversation/turn、Tool Call、Approval、模型 binding、streaming、取消、transcript 和 compaction。
- Desktop responsibility：`@neko/host` 拥有 Character Management 与 Character Conversation 的 Window scene/slot contract；`apps/neko-desktop` 只组合 Chara、World、Agent、Avatar public ports，绑定 sender/Window/Workspace identity，提供持久化和 IPC adapter，并挂载当前可见 Root。
- Data：新增用户管理的 CharacterVersion 和 WorldVersion 业务 identity，以及 canonical Character/Room/World records；不增加内部 contract/schema/format version，也不保留旧新 contract 并行路径。
- Related changes：`define-ai-native-interactive-world` 在本 Foundation 上扩展完整 AI-native World；Browser Use、Computer Use 和 Play-use 由各自独立变更拥有，本变更不引用其运行时 contract。
