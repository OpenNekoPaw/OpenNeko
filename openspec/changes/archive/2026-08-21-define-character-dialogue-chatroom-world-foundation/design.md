## Context

> Successor note: `separate-companion-and-narrative-character-conversations` 已接管 Conversation mode、Storyline authoring/context、Companion continuity 和 Character Interaction Workbench。本文中的 `CharacterStorylineRun`、运行时 Storyline transition/revision、run-scoped `CharacterMemoryScope`、Narrative external Composition 和固定 Avatar/Runtime Manager 设计仅记录已实现的 foundation 原型，不再约束后续实现或验收；successor 必须原子删除这些成功路径并保留旧用户记录的局部诊断。

`@neko/chara` 已有 CharacterProject/Version、UserCharacterRelationship、CharacterRun、Dialogue/Room、AgentSession adapter 和 Desktop Character surfaces，但角色定义仍缺少清晰的背景故事、原生背景设定、个人故事线和 narrative character memory。历史 Character Foundation 为了尽快形成端到端 fixture，把 WorldProject/Version/Run/Save 的 command、catalog 和 snapshot 一并暴露在 Chara Host contract 中，形成了产品与公共契约越界。

本设计只收敛 Chara。`packages/world`、World OpenSpec、WorldStory、WorldRun/Save 和 Character + World Composition 由 `define-ai-native-interactive-world` 处理。Chara 只提供精确角色、角色故事线、角色记忆和运行引用，并在外部 Composition producer 存在后消费其只读关联投影；缺失时保持 unavailable，不建立本地替代 shape。

路线图仍把 Chara/Interactive World 定义为实验方向，并要求真实用户、重复行为和真实闭环证据后才能晋级。当前实现只有工程与隔离 UI 证据，没有满足该门禁；因此本变更的生产结论是“保留原型、封闭入口”，而不是修改路线图把已有代码追认为已晋级产品。

### 五层分析

| 层   | 结论                                                                                                                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Chara 拥有角色定义、背景故事、原生背景设定、个人故事线、主观记忆、关系记忆、CharacterRun、Room 和角色表现选择；不拥有可运行世界、外部世界故事线或存档。                                                    |
| 依赖 | Chara core 只依赖 shared stable refs/domain values；application 通过 package-local Agent、Asset、Voice 和未来 Composition consumer port 工作，不导入外部领域私有实现。                                     |
| 接口 | Character authoring、storyline、memory、run、room、presentation 各有一个 canonical public contract；跨域只传 owning domain 提供的 exact typed ref、immutable view 和 typed result。                        |
| 扩展 | 新角色 lore 字段通过 CharacterDefinition 演进；新故事线/记忆能力通过 Chara-owned application service 扩展；外部世界或 Activity 通过 Composition owner 组合，不进入 Character Foundation。                  |
| 测试 | Chara contract/domain fixture 验证 owner、版本不可变、记忆/故事线隔离和 CAS；consumer test 验证 AgentSession、Assets/Voice 和 Composition 委托；Desktop 验证 Character Studio/Runtime，不验证 World 实现。 |

## Goals / Non-Goals

**Goals:**

- 明确定义角色背景故事、角色原生背景设定与可运行 World 的差异。
- 让 CharacterVersion 冻结完整角色语义，而不复制图片、模型、音频或外部世界数据。
- 建立独立 CharacterStorylineVersion/Run，表达角色个人成长弧和运行进度。
- 建立独立 CharacterMemoryScope/Candidate/Entry，保存角色主观记忆并与外部存档隔离。
- 保持 UserCharacterRelationship 作为 companion 关系记忆 owner。
- 保持每个 agent-controlled CharacterRun 一个 primary AgentSession。
- 将 Character Studio、Character Runtime、Room、Avatar、Voice 和 Chat/TTS 收敛为 Chara 产品能力。
- 删除 Character public surface 对 World authoring/runtime 的 ownership 表达。
- 为未来内容创作和运行时 Composition 提供精确 Chara refs，而不预定义外部领域 shape。

**Non-Goals:**

- 不修改或定义 WorldProject、WorldVersion、WorldStoryline、WorldRun、WorldEvent、WorldState、WorldView、WorldSave 或 branch。
- 不实现 Character + World 的 CompositionVersion/Run；首个 owner 由 `define-ai-native-interactive-world` 的 WorldExperienceVersion/Run 定义。
- 不把 `CharacterOriginSetting` 编译、转换或发布为 WorldProject。
- 不实现 Activity/Game、Browser Use、Computer Use、Play-use、VLA 或 OS 输入。
- 不建立通用插件系统、动态 schema registry、兼容 reader、migration path 或内部 contract version dispatch。
- 不把 Agent transcript、外部事件、搜索摘要、UI snapshot 或 embedding 当作角色 canon、故事线或已接受记忆。

## Decisions

### 1. 角色背景故事与角色原生背景设定都是 Chara lore

`CharacterBackgroundStory` 描述角色出生、家庭、经历、关系、形成性事件和个人历史。`CharacterOriginSetting` 描述角色原生时代、文化、社会环境、重要地点/组织的角色视角描述，以及角色相信或了解的背景规则。

两者随 CharacterProject 审阅并冻结进 CharacterVersion，但都不可运行：

```text
CharacterProject
  -> CharacterDefinition
       -> CharacterBackgroundStory
       -> CharacterOriginSetting
       -> canon / knowledge / behavior / expression
  -> immutable CharacterVersion
```

`CharacterOriginSetting` 不得声明 WorldProject/Run/Save identity、事件提交规则、共享客观状态、branch 或 replay。即使文本中出现世界、地点、组织或历史，它也只是角色 lore 和知识边界，不是外部 World authority。类型和 UI 使用“角色原生背景设定”，避免命名为 `CharacterWorld` 或“运行世界”。

### 2. CharacterStoryline 是角色个人弧线

`CharacterStorylineVersion` 是用户管理的不可变角色故事线版本，绑定精确 CharacterVersion，冻结角色个人 premise、欲望、冲突、成长弧、阶段、可选转折和约束。它不包含外部世界状态或“已经发生”的共享事实。

`CharacterStorylineRun` 绑定精确 CharacterStorylineVersion 和 CharacterRun，拥有个人故事线当前阶段、已接受角色转折引用和 Chara-owned CAS revision。外部 Composition、RoomEvent、Activity result 或其他领域事件只能提交 `CharacterStorylineObservationCandidate`；Chara 验证目标 identity、来源和 expected revision 后接受或拒绝。接受角色转折不得直接修改外部领域事实。

角色可以没有故事线，也可以在不同内容组合中选择不同 CharacterStorylineVersion。切换故事线版本必须创建新的 CharacterStorylineRun，不能重解释旧进度。

### 3. CharacterMemory 与外部存档独立

Chara 区分三类数据：

| 数据                   | Owner                               | 语义                                         |
| ---------------------- | ----------------------------------- | -------------------------------------------- |
| 角色稳定事实和记忆策略 | CharacterProject / CharacterVersion | 作者审阅并发布的角色定义                     |
| 角色主观运行记忆       | CharacterMemoryScope                | 角色经历、感受、个人回忆和认知变化           |
| 用户—角色关系记忆      | UserCharacterRelationship           | companion 跨会话偏好、边界、约定和关系里程碑 |

`CharacterMemoryScope` 绑定精确 CharacterRun，可选绑定 CharacterStorylineRun 和 owning Composition 提供的 exact ref。`CharacterMemoryCandidate` 必须携带 stable source ref、观察者、时间和 sensitivity/retention traits；只有 Chara owner 接受后才成为 `CharacterMemoryEntry`。纠正和删除只修改对应 memory scope，并使其派生索引失效。

外部事件或存档只能提供候选证据引用，不得成为 CharacterMemory store。保存、恢复、分支或删除外部存档不得复制、重置或删除角色记忆；角色记忆变化也不得写回外部存档。跨 scope、跨 CharacterRun 或跨内容组合导入必须是显式、可审阅操作，默认隔离。

### 4. 内容创作和运行关联属于外部 Composition

Chara 只发布以下可组合引用：

```text
CharacterVersionRef
CharacterStorylineVersionRef
CharacterRunRef
CharacterStorylineRunRef
CharacterMemoryScopeRef
```

内容创作时，外部 Composition owner 可以把 CharacterVersion/CharacterStorylineVersion 与它拥有或引用的其他内容版本关联；运行时则把 CharacterRun/CharacterStorylineRun/CharacterMemoryScope 与其他 runtime identity 关联。Chara 不保存对方完整对象、不解释对方 storyline/save shape，也不根据 active/latest identity 自动绑定。

外部关联失效时，Chara 记录或 surface 只显示 exact diagnostic 和修复/导航 target；CharacterProject、CharacterVersion、CharacterStoryline 和 CharacterMemory 仍可独立访问。WorldExperience 等 Composition contract 及 producer 完成生产组合前，narrative external composition 保持 unavailable。

Main 与 Secondary Main 必须沿共享边界连续拼接，只由 Workbench 提供一条可调整的分隔线；场景组合不得在两个 package-owned Surface 之间增加 gutter、margin 或卡片式外边距。Surface 内部仍可按各自内容层级保留字段、工具栏和列表的正常间距。

### 5. CharacterRun 只绑定一个 primary AgentSession

每个 agent-controlled CharacterRun 在创建时冻结 CharacterVersion、CharacterStorylineRun/MemoryScope ref、participant policy 和 primary AgentSession identity。Agent runtime 拥有 turn、queue、Tool Call、Approval、streaming、取消、transcript 和 compaction；Chara 只物化角色 profile、授权 memory、RoomView 和未来外部 composition view。

现有 `CharacterDialogueSession`、`EmbodyCharacterSession` 仅用于 authoring test kernel，不得成为正式 CharacterRun 的平行 responder/transcript。human-controlled Character 不创建隐藏 AgentSession。

### 6. Dialogue 与 Room 保持 Chara-owned

`dialogue` 表示用户与一个角色互动，`chatroom` 表示多个 human/agent/system participant。`CharacterRoom` 只保存标题、participant template 和调度策略；外部内容/世界选择属于 Composition record，不应作为 `CharacterRoom.worldVersionId` 或 Chara-owned default world binding。

每个 participant 拥有稳定 identity、显式 controller、独立 CharacterRun/AgentSession、Chat/TTS 配置和 memory view。Room timeline 只保存消息、membership、mention、moderation、scheduling，以及对外部已接受事件的 stable reference；不会成为外部事实或存档。

### 7. Character Studio 展示完整角色能力

Character Studio 是 Window 级单例管理场景。catalog 约占 30%，detail 约占 70%，detail 分区为：

- 概览；
- 背景故事；
- 原生背景设定；
- 认知与行为；
- 角色故事线；
- 角色记忆与关系；
- 表现资源；
- 声音；
- 运行历史；
- 发布版本。

外部 Composition 只显示只读关联摘要和精确导航，不出现 WorldProject/Run/Save/storyline 创建、编辑、发布或删除入口。创建角色只是 CharacterProject fresh state，不创建 management session、CharacterRun 或外部 runtime。

### 8. Character Runtime 使用独立 Workbench

Character/Room Conversation 打开 `character-interaction` scene：

- `interaction`：Agent Interaction/Room feed；
- `main`：唯一 Avatar/Scene 表现 runtime；
- `rightManager`：CharacterRun、CharacterStorylineRun、CharacterMemory、关系记忆、逐参与者 Chat/TTS 和外部 Composition 只读摘要；
- `timeline`：按需 Room timeline；
- `status`：局部 runtime diagnostic。

Room cover 和 portrait 只用于身份识别；Live2D/VRM 只在 Main 挂载一次。外部场景背景只能由未来 Composition/presentation owner 投影，Chara 不把 `CharacterOriginSetting` 当作可运行场景状态。

这些可见 Roots 必须像 Workspace Workbench 一样沿相邻边界连续拼接，不得由 Character 场景额外包裹 margin 或 gutter；组件间层级通过共享边框和 resize handle 表达。

### 9. Avatar、Voice 与 Chat/TTS 保持引用和执行分离

CharacterVersion 保存 stable portrait/avatar/voice ref 和作者默认偏好。Assets/Content/Media/Voice owner 保存图片、模型、纹理、动作和音频 bytes；Avatar runtime 只拥有渲染资源、pose/expression/action 播放和释放。

每个 CharacterRun/Room participant 拥有独立有效 Chat/TTS 配置。更改 provider/model/voice/速度/自动朗读只影响尚未开始的 turn；每个 started turn 冻结实际 receipt。Voice/Media 保存生成音频产物，Avatar 可消费 timing/viseme projection，但不拥有 TTS 配置、音频事实或 Agent turn。

### 10. Character Foundation public boundary 原子收敛

Canonical producer 是 Chara package public authoring/storyline/memory/run/room service；consumer 是 Chara Webview、Node repository、Agent adapter、Avatar/Voice adapter、未来 Composition adapter 和 Desktop wiring。

被替换路径包括：

- `CharacterFoundationCommand` 中的 World project/version/run operation；
- `CharacterFoundationSnapshot.world` 完整 catalog；
- `CharacterFoundationCommandService.worldAuthoring/worldRuntime`；
- `CharacterFoundationService.worldCatalog`；
- Character IPC/preload/Webview 中对外部 World CRUD 的成功路径；
- Character Runtime manager 把外部 storyline/save/world 表达为 Chara capability 的占位项。

替换必须一次性更新 producer、consumer、fixture 和测试，并删除旧 operation/field/handler。不得保留兼容 alias、dual read、optional old snapshot、成功 no-op 或通过 active/recent 外部 identity 重建旧路径。

### 11. Revision 只用于真实并发正确性

CharacterStorylineRun revision 由 observation producer 和 Chara commit service 消费，用于拒绝并发陈旧转折；CharacterMemoryScope revision 由 candidate review/correction/delete producer 和 memory owner 消费，用于防止陈旧写入。它们不得参与 schema、format、contract、cache 或实现分发。

### 12. Agent Entry 只在提交时物化 Character Conversation

Agent Entry 中的 Character 选择是可丢弃 Draft presentation，只保存用户明确选择的已发布
`CharacterVersion` identity；选择动作不创建 CharacterRun、Relationship、Dialogue、Room 或
AgentSession，也不绑定 active/recent Character。

用户提交首条消息时，Desktop 只通过 Chara-owned `CharacterConversationLaunchService`
物化精确 owner：单个 Character 创建 Dialogue，多个 Character 创建 Room。返回的 primary
AgentSession 同时是 Character Interaction Surface 的 canonical Conversation identity；不得再经通用
Assistant first-submit 创建第二个 Conversation。Desktop Main 只负责 sender-bound Draft/Scene
验证、concrete Chara/Agent adapter wiring、精确 Workbench handoff 和首条消息调用；单/多参与者
创建规则、身份和失败清理仍由 Chara application service 拥有。

若一个已发布 CharacterVersion 存在多个 CharacterStorylineVersion，Entry 将它们投影为显式可选变体，
不得隐式选择 latest/active 故事线。提交时，同一 launch transaction 创建所选
CharacterStorylineRun 和 fresh CharacterMemoryScope，并在首个 Agent turn 前把精确 identity 写入
CharacterRun；未选择故事线时仍创建独立 MemoryScope，但不伪造 StorylineRun。

未发布版本、重复选择、失效 Draft/Scene 或缺失 Agent runtime 必须在最小 boundary 显式失败。
Chara launch commit 之前的失败不得留下部分 CharacterRun/Room/AgentSession；已成功启动后的单个
provider turn 失败只标记当前交互失败，不删除已创建的 durable Conversation owner。

### 13. 产品晋级门禁位于最小组合边界

在路线图晋级前，`@neko/host` 对 `open-character-management` 返回
`desktop-scene-owner-unavailable`，保持当前 scene 与 durable catalog 不变；Agent Entry 的 Roleplay
动作在 Webview 交互 owner 中返回明确 diagnostic，不发起 Character 搜索，也不调用
`CharacterConversationLaunchService`。这不是 feature flag 或替代实现，而是当前唯一生产语义。

包内 Chara services、scene contract、Webview Root 和 deterministic tests 继续作为隔离实验原型存在，
但不得作为生产可达证据。旧进程持久化的 `character-management` 或
`character-interaction` presentation 在 Window claim 时局部重置为 fresh Agent Entry scene，并产生
`desktop-presentation-reset` diagnostic；该恢复只替换 Window presentation，不删除 CharacterProject、
CharacterVersion、Conversation、Room、transcript 或受保护后台 task/runtime。

未来只有新的晋级 OpenSpec 记录真实证据、生产 owner、用户数据影响与验收矩阵后，才能原子移除
这些拒绝点并重新接通已有 canonical producer/consumer；不得以开关、dual path 或兼容分支提前暴露。

## Risks / Trade-offs

- [“背景世界”被误解为 World] → canonical 名称固定为 `CharacterOriginSetting`，文档和 UI 明示不可运行、不可存档。
- [CharacterStoryline 变成共享世界事实] → 只保存个人弧线与已接受角色转折引用；外部事实仍由外部 owner 管理。
- [外部存档被当作角色记忆] → CharacterMemoryScope 独立持久化，外部事件只能产生候选来源引用。
- [Composition 缺失时 Chara 自建临时绑定] → 保持 unavailable，等待 owning contract，不使用字符串 bag、active identity 或 Chara-local external shape。
- [拆除 Character Foundation World path 影响现有 fixture] → 原子更新 Character producer/consumer/tests；World producer/consumer 由其他会话接管，不在本变更修补。
- [角色 lore 过度结构化] → 首版只结构化稳定、可验证且有真实 UI/Agent consumer 的字段，长文本通过 durable content ref 扩展。
- [原型完成被误认为产品晋级] → Host scene 与 Agent Entry 同时 fail-visible；测试必须 poison Character 搜索/启动端口并证明没有 durable mutation。
- [封闭入口误伤用户数据或后台任务] → 只重置 Window presentation；Chara/Agent authoritative records 与 task/runtime owner 不参与清理。

## Migration Plan

1. 先更新 Chara OpenSpec 与领域文档，冻结术语和 ownership。
2. 扩展 Character contracts/codecs：BackgroundStory、OriginSetting、CharacterStoryline、CharacterMemory。
3. 实现 Chara authoring/storyline/memory services 与 fail-local catalog diagnostics。
4. 从 Character Foundation public contract、service、Desktop IPC/preload 和 Chara Webview 原子删除外部 World CRUD/catalog path。
5. 更新 Character Studio/Runtime surfaces 和 deterministic producer/consumer/path tests。
6. 在外部 Composition owner 提供 public contract 后，仅通过 concrete adapter 接入 exact refs 和 read-only projection。
7. 完成真实 Character Electron UI 与 provider-backed Agent 验收；不把 World 实现或运行证据计入本变更。
8. 在路线图晋级证据成立前封闭生产 Character/Room 入口；旧实验 scene 局部恢复到 Agent Entry，保留所有 durable records 和后台 runtime。

现有 Character 用户记录不得因新增 lore/storyline/memory 能力被静默覆盖。缺失新字段的旧 CharacterProject/Version 在其 owning record 显示明确 diagnostic 和修复入口；有效 sibling 继续可用。现有 World records 不由本变更读取、迁移、删除或重写。

## Open Questions

- BackgroundStory/OriginSetting 首版采用结构化字段加 Content ref，还是先使用可审阅 Markdown document ref。
- Narrative CharacterMemory 默认绑定 CharacterRun，还是绑定可跨多个连续 CharacterRun 的显式 CharacterMemoryScope。
- World Experience 等外部 Composition 对 CharacterStorylineObservationCandidate 所需的最小 source receipt，由对应 Composition OpenSpec 冻结。
