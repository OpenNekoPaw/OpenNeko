## Why

`@neko/chara` 已具备 Character Dialogue、Embody、角色证据、Profile Assembly 和部分 Character/Room 运行基础，但角色定义仍只有 summary、canon、知识边界和行为策略，无法明确表达角色背景故事、角色原生背景设定、角色个人故事线和独立角色记忆。现有 Character Foundation Host 还暴露 WorldProject、WorldRun 和 WorldSave 操作与完整 catalog，错误地把外部 World authoring/runtime 包装成 Character 能力。

当前变更只交付 Chara bounded context。角色背景故事和角色原生背景设定是 CharacterVersion 的角色事实，不是可创作、可运行或可存档的 World；CharacterStoryline、CharacterMemory、CharacterRun 与外部 WorldStory、WorldRun、WorldSave 保持独立。内容创作时的 Character/CharacterStoryline + World/WorldStory 组合由 `define-ai-native-interactive-world` 的 WorldExperienceProject/Version 通过精确引用完成，运行时参与由 WorldExperienceRun 绑定独立 CharacterStorylineRun 与 WorldStoryRun；本变更不定义或实现 World 领域。

## What Changes

- 建立 `CharacterProject -> immutable CharacterVersion`，在角色 canon 之外明确拥有 `CharacterBackgroundStory`、`CharacterOriginSetting`、知识边界、策略、证据、表现与声音引用、创作测试、审阅和发布。
- 定义 `CharacterBackgroundStory` 为角色出生、经历、关系和形成性事件；定义 `CharacterOriginSetting` 为角色原生时代、文化、社会环境和角色视角下的背景认知。两者都是不可运行的角色 lore，不得产生 WorldProject、WorldRun、WorldState、WorldSave 或 branch。
- 建立独立 `CharacterStorylineVersion -> CharacterStorylineRun`，拥有角色个人成长弧、愿望、冲突、阶段和进度；它不等于外部世界故事线，也不能直接提交外部世界事实。
- 建立 Chara-owned `CharacterMemoryScope`、`CharacterMemoryCandidate` 和 `CharacterMemoryEntry`。角色主观经历、感受、关系变化和个人回忆独立于外部存档；外部事件只能作为带来源的候选，必须由 Chara owner 接受、纠正或删除。
- 将 Character 产品入口定义为独立 Character Studio：catalog + detail 展示概览、背景故事、原生背景设定、认知与行为、角色故事线、角色记忆、表现资源、声音、运行和发布版本。
- 对话从 Agent Entry 通过一个或多个显式 `@CharacterVersion` 启动：一个角色创建 Dialogue，多角色创建 Room；未选择角色保持普通 Agent Entry。
- 为 Character/Room Conversation 建立独立 Character Runtime Workbench：左侧 Agent Interaction/Room、中部 Avatar/Scene 主表现、右侧 Character Runtime 配置和按需 Room timeline；外部 Composition 只以只读关联摘要和精确跳转出现。
- 每个 agent-controlled CharacterRun 精确映射一个 primary Pi AgentSession；Chara 不拥有第二套 transcript、turn、Tool Call、Approval 或模型循环。
- 每个 CharacterRun/Room participant 拥有独立 Chat/TTS 有效配置；运行配置只影响尚未开始的 turn，每个 turn 冻结实际执行 receipt。
- 建立 Chara-owned CharacterRoom、RoomRun、participant/controller、调度和有序 Room timeline；human-controlled character 不创建隐藏 AgentSession。
- 从 Character Foundation public contract、snapshot、command service 和 UI 中删除 WorldProject/Version/Run/Save/storyline CRUD 与完整 World catalog。现有外部绑定只保留为待 Composition owner 接管的精确 opaque ref，不得由 Chara 解释、创建、修改或回退。
- 当前变更不修改 `packages/world`、World OpenSpec、World Studio/Runtime、外部世界故事线、WorldSave/branch、Activity/Game、Browser Use、Computer Use、Play-use 或 VLA。

## Capabilities

### New Capabilities

- `character-authoring-publication`: CharacterProject、不可变 CharacterVersion、角色背景故事、角色原生背景设定、证据、创作测试、审阅、发布和失效诊断。
- `character-lore-storyline-memory`: CharacterStorylineVersion/Run、CharacterMemoryScope/Candidate/Entry、关系记忆隔离、外部证据候选和独立生命周期。
- `character-dialogue-chatroom`: companion/narrative 单角色对话、多参与者聊天室、CharacterRun、participant/controller、AgentSession mapping、Room timeline、调度、可见性和生命周期。
- `character-experience-workbench`: Character Studio、Agent Entry `@角色` 启动、Character/Room Workbench、Avatar、Voice、Chat/TTS 和角色运行管理投影。

### Modified Capabilities

无。

## Impact

- Chara responsibility：`@neko/chara` 拥有 CharacterProject/Version、BackgroundStory、OriginSetting、CharacterStorylineVersion/Run、CharacterMemory、UserCharacterRelationship、CharacterRun、CharacterRoom/RoomRun、participant policy 和 RoomEvent。
- External composition：Character 只导出精确 CharacterVersion、CharacterStorylineVersion/Run、CharacterMemoryScope 和 CharacterRun ref。Character + WorldStory 的创作/运行关联由 World Experience composition/binding owner 持有；Chara 不声明外部 World aggregate shape，也不与 WorldStory 共用进度记录。
- Agent responsibility：`@neko/agent-runtime` 继续拥有唯一 Pi AgentSession、conversation/turn、Tool Call、Approval、模型 binding、streaming、取消、transcript 和 compaction。
- Asset/Voice responsibility：图片、模型和音频 bytes 继续由 Assets/Content/Media/Voice owner 管理；Chara 只保存稳定引用、角色语义和默认偏好。
- Desktop responsibility：`@neko/host` 拥有 Character Studio 与 Character Runtime scene/slot contract；`apps/neko-desktop` 只组合 Chara、Agent、Avatar、Voice public ports和外部 Composition link adapter，不保留 Character-owned World CRUD。
- Data：新增用户管理的 CharacterStorylineVersion 和 canonical Character memory/storyline records；不增加内部 contract/schema/format version，不复制外部存档或故事线数据。
