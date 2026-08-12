# Chara 领域

Chara 是角色创作、发布、个人故事线创作、日常长期记忆、Dialogue/Room 和角色表现语义的 owner。host-neutral domain/application 位于 `packages/chara`，本地持久化 adapter 位于 `packages/chara-node`，browser-only 管理与互动视图位于 `packages/chara-webview`。

Agent 继续唯一拥有 Conversation、AgentSession、turn、queue、Tool、Approval、provider/model 执行、transcript 和 compaction；Desktop 只负责 Electron sender/Window/Scene、typed IPC、本地资源授权和 public Surface 组合。

## 核心模型

```text
CharacterProject
  -> CharacterBackgroundStory + CharacterOriginSetting
  -> canon / knowledge / behavior / expression
  -> immutable CharacterVersion

CharacterProject
  -> CharacterStoryline
       -> mutable CharacterStorylineDraft
       -> immutable CharacterStorylineVersion
            -> immutable StorylineNode snapshots

userId + CharacterProjectId
  -> CompanionContinuity
       -> accepted CharacterMemory
       -> UserCharacterRelationship

CharacterConversationSelection
  -> companion | narrative
  -> Dialogue(one Character) | Room(multiple Characters)
  -> independent primary AgentSession per agent-controlled Character
```

`CharacterStorylineVersion` 是用户管理的领域版本，不是内部 schema/contract 版本。Storyline、StorylineVersion 和 StorylineNode 都有精确身份；旧 Conversation 始终引用原 publication，不解析 latest。

## 背景故事与外部世界

| 概念             | Owner    | 含义                                           |
| ---------------- | -------- | ---------------------------------------------- |
| 角色背景故事     | Chara    | 出生、经历、关系、形成性事件和个人历史         |
| 角色原生背景设定 | Chara    | 原生时代、文化、社会环境及角色视角下的背景认知 |
| 外部世界创作     | 外部领域 | 可独立创作和发布的共享世界定义                 |
| 外部运行世界     | 外部领域 | 运行状态、事件、存档和分支                     |

`CharacterOriginSetting` 只是角色 lore，不能创建或替代 WorldProject、WorldRun、WorldState、WorldSave 或 branch。Chara 不通过 Narrative mode 吸收 World/Experience/Save authority。

## 日常与叙事模式

Character Conversation 创建时必须选择一种模式，已有 Conversation 不得原地切换：

| 模式        | 角色上下文                                         | 长期记忆                                | 原生模型/外部资料                                        |
| ----------- | -------------------------------------------------- | --------------------------------------- | -------------------------------------------------------- |
| `companion` | 精确 CharacterVersion + 已接受的角色/关系连续性    | 跨 Conversation 读取并产生带来源的候选  | 可使用独立 AssistantSession；资料仅作为当前 turn context |
| `narrative` | 精确 CharacterVersion + 可选 StorylineVersion/Node | 只使用节点作者发布的 narrative memories | 禁止原生模型通道和任意外部资料                           |

一个角色选择创建 Dialogue，多个角色选择创建 Room。Narrative Room 为每个 participant 保存独立的可选 StorylineVersion/Node；不得共享私人故事信息、模型配置或 memory view。

原生模型不是角色 AgentSession 内的 prompt 切换，而是 Companion Workbench 中身份明确、transcript 独立的 AssistantSession。其输出不得作为 Character response、RoomEvent 或已接受记忆提交。

## 故事线只属于创作

CharacterStoryline 表达一条稳定的个人故事弧；draft 可编辑，publication 和节点快照不可变。StorylineNode 可定义情境、时间地点、角色/关系状态、允许/禁止事实、叙事记忆、知识边界、行为/表达约束及作者可见信息。

运行时只读取用户确认的精确 StorylineVersion/Node：

- 不创建 `CharacterStorylineRun`；
- 不从对话、模型输出或 RoomEvent 推进节点；
- 不维护 transition、progress revision、Save 或 branch；
- Timeline 只投影创作结构和当前背景，不表示完成度；
- 查看其他节点只允许检查或显式新建 Conversation。

Agent transcript 是完整消息的唯一 owner。Narrative turn 只保存紧凑的 Conversation/Turn/CharacterVersion/StorylineVersion/Node receipt，用于恢复和审计，不复制消息或节点内容。

## 日常长期记忆

CompanionContinuity 由精确 `userId + CharacterProjectId` 定位，生命周期独立于 CharacterRun、Conversation、AgentSession 和 CharacterVersion。它分别管理：

- CharacterMemory：角色主观经历、感受、个人回忆和认知变化；
- UserCharacterRelationship：用户偏好、边界、约定和关系里程碑。

Transcript、RoomEvent、原生 Assistant 输出和外部资料只能成为带来源的候选，不能直接成为已接受记忆。每条已接受记忆保留来源 CharacterVersion 和 Conversation/Turn 或 RoomEvent ref。新 CharacterVersion 通过唯一 projector 读取兼容记忆；不兼容记录保留可见 diagnostic，不重写或伪造内容。

Narrative 不绑定、读取或写入 CompanionContinuity。删除或重开 Narrative Conversation 不得改变日常长期记忆。

## 外部资料与表现资源

Companion turn 可以携带用户显式选择的 owner-qualified Workspace/Content/Asset ref。资料 bytes、路径与访问权限仍由来源 owner 保存；Agent 只在当前 turn 通过授权 context provider 物化有界内容。引用不持久化为 Character facts，也不因 UI 保持挂载而成为后续 context。

图片、Live2D、VRM、MMD、PNGTuber、音频、Web、动态场景和 Gameplay 资源/runtime 继续由 Assets/Content/Media/Voice/Presentation/Game owner 管理。Chara 只保存角色表示语义和稳定 ref；Desktop 只授权 opaque descriptor/lease，不暴露 raw path。

## 本地角色目录与导入导出

角色草稿、可用版本、lineage、Storyline 和创作测试只在授权 Workspace 的 `neko/characters/<characterProjectId>/...` 目录记录中管理和运行。standalone 与 project-local Character 使用相同相对布局，区别只来自外部 placement authority。

`.neko-character` ZIP 仅是导入导出快照：导出从 canonical 目录读取用户选定记录和显式授权素材；导入先校验和预览，再写入 canonical 目录并释放归档资源。ZIP 不被挂载为 Workspace，不保存为角色 identity，不参与后续编辑、对话、Room、监听或同步；导入后源 ZIP 可以移动或删除而不影响已安装角色。

## Character Interaction Workbench

Character/Room Conversation 使用一个有界 composition：

```text
interaction -> Agent Interaction / Room
main        -> one exact owner-qualified Character Presentation surface
right       -> Companion Context / Narrative Context / Room Participant Manager
bottom      -> optional Storyline Timeline and/or RoomEvent Timeline
status      -> local diagnostics
```

Main 不固定为 Avatar，也不尝试 first-compatible renderer。未知、失效或未授权 Surface 只让对应 slot fail-visible，不能切换 provider 或阻止有效 sibling surface。Storyline Timeline 与 RoomEvent Timeline 是不同 owner 的只读投影。

离开场景时 UI Roots 和无保护表现资源卸载；正在运行、排队或等待审批的 Agent task 由精确 AgentSession owner 继续，不得依赖隐藏 React tree。重开必须使用原 Conversation identity，禁止 active/recent fallback。

## 当前状态

现有 foundation 已实现部分 Character/Room、StorylineRun、run-scoped memory 和固定 Avatar Workbench 原型。`separate-companion-and-narrative-character-conversations` 正在原子替换这些路径；旧记录必须保留可见 diagnostic，但不得进入新成功路径。

Character 产品 promotion gate 继续关闭。包内服务、fixture 和隔离 UI 存在不代表生产 Character/Room 入口已晋级。

## 阅读路径

- [`architecture.md`](architecture.md)：Chara owner、依赖、运行边界、上下文和错误隔离；
- [`../../architecture/package-boundaries.md`](../../architecture/package-boundaries.md)：跨包约束；
- [`../../architecture/adr-agent-runtime-single-authority-and-simplification-boundary.md`](../../architecture/adr-agent-runtime-single-authority-and-simplification-boundary.md)：Agent 单一 authority；
- [`../../../openspec/changes/separate-companion-and-narrative-character-conversations/`](../../../openspec/changes/separate-companion-and-narrative-character-conversations/)：当前模式、故事线、记忆和 Workbench 变更。
