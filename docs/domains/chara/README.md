# Chara 领域

Chara 是角色创作、发布、个人故事线、主观记忆、关系记忆、Dialogue/Room 运行和角色表现语义的 owner。host-neutral domain/application 位于 `packages/chara`，本地持久化 adapter 位于 `packages/chara-node`，browser-only 管理视图位于 `packages/chara-webview`。Agent 继续拥有唯一 Pi AgentSession、turn、Tool、Approval、transcript 和 compaction。

## 核心模型

```text
CharacterProject
  -> CharacterBackgroundStory
  -> CharacterOriginSetting
  -> canon / knowledge / behavior / expression
  -> immutable CharacterVersion

CharacterVersion
  -> CharacterStorylineVersion -> CharacterStorylineRun
  -> CharacterRun -> CharacterMemoryScope
  -> UserCharacterRelationship -> companion relationship memory
```

四个容易混淆的概念必须分开：

| 概念             | Owner    | 含义                                           |
| ---------------- | -------- | ---------------------------------------------- |
| 角色背景故事     | Chara    | 出生、经历、关系、形成性事件和个人历史         |
| 角色原生背景设定 | Chara    | 原生时代、文化、社会环境及角色视角下的背景认知 |
| 外部世界创作     | 外部领域 | 可独立创作和发布的共享世界定义，不属于 Chara   |
| 外部运行世界     | 外部领域 | 运行状态、事件、存档和分支，不属于 Chara       |

`CharacterOriginSetting` 只是角色 lore，不能创建或替代 WorldProject、WorldRun、WorldState、WorldSave 或 branch。文档和代码不得使用 `CharacterWorld` 表达它。

## 故事线与记忆

`CharacterStorylineVersion/Run` 只拥有角色个人欲望、冲突、成长弧、阶段和已接受转折，不拥有外部世界故事线或共享事实。外部事件只能作为 observation candidate，经 Chara owner 按精确 CharacterStorylineRun 和 expected revision 接受后推进个人故事线。

角色记忆与关系记忆也保持独立：

- `CharacterMemoryScope`：角色主观经历、感受、个人回忆和认知变化；
- `UserCharacterRelationship`：用户偏好、边界、约定、共同经历和关系里程碑；
- `AgentSession`：transcript、turn、Tool Call 和 compaction；
- 外部存档：由外部 owner 保存，不是角色记忆。

Transcript、外部事件和 Activity result 只能产生带来源的 memory candidate，不能自动成为已接受记忆。外部存档的保存、恢复、分支或删除不得复制、重置或删除 CharacterMemory。

## 创作与运行组合

Chara 只向外部 Composition owner 提供精确引用：

```text
CharacterVersionRef
CharacterStorylineVersionRef
CharacterRunRef
CharacterStorylineRunRef
CharacterMemoryScopeRef
```

内容创作时，WorldExperienceProject/Version 等外部 Composition 可以关联 CharacterVersion/CharacterStorylineVersion 与精确 World/WorldStory 版本；运行时 WorldExperienceRun 等 binding 可以关联 CharacterRun/CharacterStorylineRun/CharacterMemoryScope 与精确外部 runtime identity。关联不改变双方 owner，也不复制双方数据。Composition producer 未完成时保持 unavailable，Chara 不创建本地替代 DTO 或推断 active/latest 外部 identity。

## Dialogue、Room 与表现

一个显式 `@CharacterVersion` 选择启动 Dialogue，多个选择启动 Room。每个 agent-controlled participant 拥有独立 CharacterRun、primary AgentSession、Chat/TTS 配置和 memory view；human-controlled Character 不创建隐藏 AgentSession。Room 只拥有参与者、调度和有序 RoomEvent，不拥有外部共享状态或存档。

Character Studio 管理概览、背景故事、原生背景设定、认知与行为、个人故事线、角色/关系记忆、表现资源、声音、运行历史和发布版本。Character Runtime Workbench 组合 Agent Interaction/Room、唯一 Avatar Main、Character Runtime 配置和按需 Room timeline。图片、模型和音频 bytes 继续由 Assets/Content/Media/Voice owner 管理，Chara 只保存稳定引用与角色语义。

## 当前状态

当前已实现 CharacterProject/Version、UserCharacterRelationship、CharacterRun、Dialogue/Room durable records、Character catalog/detail、Agent Entry Character selection、Room 调度/投影和基础 Character Workbench。尚未实现 CharacterBackgroundStory、CharacterOriginSetting、CharacterStoryline、narrative CharacterMemory、完整 Avatar/Voice/Chat-TTS 产品路径。

现有 Character Foundation Host 仍包含外部 World CRUD 和完整 catalog，这是待删除的架构漂移，不构成 Chara 能力。相关收敛任务见当前 Character OpenSpec；World Story/Gameplay/Experience 与 Character + World composition/binding 由 `define-ai-native-interactive-world` 处理。

## 阅读路径

- [`architecture.md`](architecture.md)：Chara owner、依赖、生命周期、故事线和记忆边界；
- [`../../architecture/package-boundaries.md`](../../architecture/package-boundaries.md)：跨包约束；
- [`../../architecture/adr-agent-runtime-single-authority-and-simplification-boundary.md`](../../architecture/adr-agent-runtime-single-authority-and-simplification-boundary.md)：Agent 单一 authority；
- [`../../../openspec/changes/define-character-dialogue-chatroom-world-foundation/`](../../../openspec/changes/define-character-dialogue-chatroom-world-foundation/)：当前 Chara 创作、故事线、记忆、Dialogue/Room 与 Workbench 变更。
