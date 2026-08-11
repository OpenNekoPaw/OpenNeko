# Chara 领域架构

## 当前状态

`@neko/chara` 是 CharacterProject/Version、Dialogue/Room、CharacterRun、UserCharacterRelationship 和角色语义的 host-neutral owner。Desktop 已接入 Character catalog/detail、Agent Entry Character selection、Character/Room scene、Room 调度和投影。

当前仍有两类缺口：

1. CharacterDefinition 尚未正式建模背景故事、原生背景设定、个人故事线和 narrative CharacterMemory；
2. 历史 Character Foundation Host 仍包含外部 World CRUD、catalog 和 runtime command，这是待删除的组合边界漂移，不是 Chara authority。

本领域文档只定义 Chara。外部 World Definition/Runtime、World Story、World Gameplay、存档和 Character + World Experience composition/binding 由 World 领域与活跃 OpenSpec 负责；Chara 只暴露精确 Character/CharacterStoryline 引用。

## Owner 与事实模型

```text
CharacterProject
  -> CharacterDefinition
       -> CharacterBackgroundStory
       -> CharacterOriginSetting
       -> canon / knowledge / behavior / expression
       -> representation / voice refs
  -> publish immutable CharacterVersion

CharacterVersion
  -> CharacterStorylineVersion -> CharacterStorylineRun
  -> CharacterRun -> CharacterMemoryScope
  -> UserCharacterRelationship -> CompanionRun
  -> CharacterRoom / RoomRun
```

| 数据                                              | 唯一 owner                                        |
| ------------------------------------------------- | ------------------------------------------------- |
| 角色背景故事、原生背景设定、canon、知识边界、策略 | CharacterProject / CharacterVersion               |
| 角色个人故事线定义与进度                          | CharacterStorylineVersion / CharacterStorylineRun |
| 角色主观运行记忆                                  | CharacterMemoryScope                              |
| 用户—角色关系记忆                                 | UserCharacterRelationship                         |
| Character/Room 运行身份与 RoomEvent               | CharacterRun / CharacterRoom / RoomRun            |
| turn、Tool Call、Approval、transcript、compaction | AgentSession                                      |
| 图片、模型、动作、纹理和音频 bytes                | Assets / Content / Media / Voice owner            |
| 外部内容、世界、故事线、状态、事件、存档和分支    | 对应外部 owner，不属于 Chara                      |
| embedding、摘要、搜索和排序                       | 可重建 infrastructure projection                  |

UI tab、active selection、presentation snapshot、Agent transcript、外部事件和搜索结果都不是上述事实的 owner。

## 角色背景故事与原生背景设定

`CharacterBackgroundStory` 保存角色出生、家庭、经历、关系、形成性事件和个人历史。`CharacterOriginSetting` 保存角色原生时代、文化、社会环境、重要地点/组织的角色视角描述，以及角色相信或知道的背景规则。

二者随 CharacterProject 审阅并冻结进 CharacterVersion，但不是可运行世界：

- 不创建 WorldProject/Version；
- 不拥有共享客观事实或规则提交；
- 不创建 WorldRun/State/Event；
- 不拥有 Save、branch、checkpoint 或 replay；
- 不自动成为运行场景背景。

因此 canonical 名称固定为 `CharacterOriginSetting`，不得使用 `CharacterWorld`、`BackgroundWorldRun` 等容易表达运行 authority 的名称。角色可以带着同一个 OriginSetting 进入多个不同外部内容组合，其原生 lore 不因此被目标内容改写。

## CharacterStoryline

角色故事线表达个人弧线，不表达共享世界历史：

```text
CharacterVersion
  -> CharacterStorylineVersion
       premise / desire / conflict / arc / stages / constraints
  -> CharacterStorylineRun
       current stage / accepted transition refs / revision
```

`CharacterStorylineVersion` 是用户可管理、不可变且可精确引用的领域版本。一个 CharacterVersion 可以没有故事线，也可以发布多个可选个人弧线。`CharacterStorylineRun` 绑定一个精确版本和 CharacterRun；切换版本必须创建新 run，不能重解释旧进度。

Chara 只接受 `CharacterStorylineObservationCandidate`：候选携带 exact source ref、CharacterRun、StorylineRun、观察时间和 expected storyline revision。Chara application service 校验后接受或拒绝，并只推进角色个人弧线。外部事件、Room 消息或 Agent 声称“已经成长”都不能直接提交 storyline transition，也不能因此修改外部事实。

## CharacterMemory 与关系记忆

Chara 拥有两类长期记忆，不能合并：

### CharacterMemoryScope

保存角色主观经历、感受、个人回忆、认知变化和自我理解。它绑定精确 CharacterRun，可选绑定 CharacterStorylineRun 和 owning Composition 提供的 exact ref。

```text
external/room/activity/transcript evidence
  -> CharacterMemoryCandidate
  -> accepted / corrected / rejected / deleted
  -> CharacterMemoryEntry
```

候选必须保存稳定来源、观察者、时间、sensitivity 和 retention traits。模型输出或 transcript 可搜索不等于记忆已接受。跨 CharacterRun、跨 StorylineRun、跨外部 composition 的导入必须是显式、可审阅操作。

### UserCharacterRelationship

保存用户偏好、边界、约定、共同经历和关系里程碑。一个事件同时影响角色主观体验和用户关系时，可以产生两个独立候选，但必须由 CharacterMemoryScope 与 UserCharacterRelationship 分别接受、纠正或删除。

### 与外部存档隔离

外部存档只可作为来源引用。保存、恢复、分支、删除或损坏外部存档不得复制、重置或删除 CharacterMemory；CharacterMemory 的接受、纠正或删除也不得写回外部存档。来源失效时保留 Chara record，并在该 entry/candidate 显示 diagnostic，不隐藏 sibling memory。

## 外部 Composition 边界

内容创作与运行关联不是 CharacterProject 或 CharacterRun 的内部职责。Chara 只导出：

```text
CharacterVersionRef
CharacterStorylineVersionRef
CharacterRunRef
CharacterStorylineRunRef
CharacterMemoryScopeRef
```

外部 Composition owner 可以在创作期关联角色/个人故事线与其他内容版本，在运行期关联 CharacterRun/StorylineRun/MemoryScope 与其他 runtime identity。Composition 只保存精确引用和映射，不复制 Chara facts。

Chara application 只允许通过 owning contract 提供的 consumer port 获取不可变关联 view 或提交 typed result。Chara 不得：

- 定义外部 storyline/runtime/save DTO；
- 导入外部领域私有实现；
- 保存对方完整 aggregate；
- 从 active/recent/latest selection 推断关联；
- 在 provider 缺失时创建本地 placeholder、string bag 或成功 no-op adapter。

Composition provider 缺失或绑定失效时，只拒绝当前 composed launch/operation；Character Studio、companion Dialogue、Room 和既有 Chara records 继续可用。

## 分层与依赖

```text
@neko/chara/contracts
  -> shared stable refs / domain values

@neko/chara/core
  -> chara/contracts

@neko/chara/application
  -> chara/core
  -> package-local Agent / Asset / Voice / Composition consumer ports

@neko/chara-node
  -> public Chara repository ports

@neko/chara-webview
  -> public Chara host contracts

apps/neko-desktop
  -> public Chara entry
  -> concrete Agent / Asset / Voice / Composition adapters
```

Chara core/application 不导入 Electron、React、Agent runtime implementation 或外部领域私有 runtime。Agent、Assets、Voice 和 Composition 不反向依赖 Chara implementation；跨域只使用 public refs/ports。

## 角色创作与发布

CharacterProject 拥有 draft、evidence/candidate review、测试和发布。CharacterVersion 冻结：

- BackgroundStory；
- OriginSetting；
- canon 与知识边界；
- behavior/expression policy；
- representation/voice refs；
- memory policy；
- accepted evidence refs。

Character authoring-test snapshot 必须携带独立 identity 和 source project state，只用于 Dialogue/Embody 创作验证，不进入正式 CharacterRun、CharacterStorylineRun 或 CharacterMemoryScope。更新 draft 不得改变既有 CharacterVersion 和运行实例。

图片、模型、音频和长文档 bytes 保持在 owning Content/Asset/Media/Voice service；CharacterVersion 只保存稳定引用和角色语义。raw path、Webview URI、runtime handle、provider secret、Agent transcript 和外部存档不得进入 Character records。

## CharacterRun、Dialogue 与 Room

每个 agent-controlled CharacterRun 绑定：

- exact CharacterVersion；
- participant/controller identity；
- exact CharacterStorylineRun（可选）；
- exact CharacterMemoryScope；
- companion relationship 或 owning Composition typed ref；
- one primary AgentSession。

Agent runtime 继续拥有 turn、queue、Tool、Approval、streaming、取消、transcript 和 compaction。Chara 物化冻结 profile、授权 Character/relationship memory、RoomView 和可选 Composition view，不创建第二套 responder 或 transcript。

`dialogue` 是单角色互动，`chatroom` 是多 participant 互动。CharacterRoom 只拥有 title、participant templates 和 scheduling policy；不保存 default world/version/save。每个 agent participant 拥有独立 CharacterRun、AgentSession、Chat/TTS config 和 memory view。human-controlled participant 不创建隐藏 AgentSession。

RoomRun 拥有唯一、有序 RoomEvent timeline：message、membership、mention、moderation、scheduling 和对外部 accepted event 的 stable reference。并行 Agent inference 只是 provisional response，必须以 expected room revision 串行接受。RoomEvent 不自动成为 CharacterMemory 或 CharacterStoryline progress。

## Chat、TTS、Avatar 与 Voice

CharacterVersion 保存 voice identity/defaults、portrait/avatar refs 和表达边界。每个 CharacterRun/participant 保存本次有效 Chat/TTS config；started turn 冻结实际 provider/model/voice/parameters receipt。运行中修改只影响后续 turn，“全部应用”是逐 participant 的显式批量操作，不产生共享可变配置。

Voice/Media owner 保存生成音频产物。Avatar runtime 可消费 timing/viseme、pose/expression/action projection，但不拥有 TTS 配置、音频事实、Character canon 或 Agent turn。portrait、Live2D、VRM、MMD 和 PNGTuber 通过 exact representation ref 选择一个 renderer；失败时局部 diagnostic，不尝试其他格式或静默回退 portrait。

## Character Studio 与 Runtime Workbench

Character Studio 是 Window 级单例管理场景：catalog 约占 30%，detail 约占 70%。detail 包含概览、背景故事、原生背景设定、认知与行为、角色故事线、角色/关系记忆、表现资源、声音、运行历史和发布版本。

Character Runtime Workbench 使用独立 slots：

- Agent Interaction/Room；
- 唯一 Avatar/Scene Main；
- Character Runtime Configuration；
- 按需 Room Timeline；
- Status diagnostic。

Runtime manager 展示 CharacterRun、StorylineRun、MemoryScope、relationship、Agent Conversation、Chat/TTS 和 representation projection。外部 Composition 只能通过 owning provider 的只读摘要与 exact navigation target 出现，不得作为 `storyline / saves / world` Chara capability bag。

离开场景时 React Roots 卸载；受保护 Agent turn 可以继续，但不得因此保留隐藏 Root。无运行、排队、审批或外部操作保护条件的 Avatar/Voice/runtime resource 必须释放。恢复使用原 exact identities，不回退 active/recent Character 或 Room。

## 持久化与失效隔离

CharacterProject、CharacterVersion、CharacterStorylineVersion、CharacterMemoryScope、UserCharacterRelationship 和 CharacterRoom 是 durable records。CharacterRun、CharacterStorylineRun、RoomRun 和 AgentSession 是可脱离 UI 的业务/runtime identities。presentation snapshot 只保存 viewport、pose、selection、layout、draft 等可丢弃展示状态。

单条 lore/storyline/memory/run record 解码失败时必须：

- 保留记录可见性；
- 显示 exact diagnostic 和修复入口；
- 禁用依赖该记录的操作；
- 保持 sibling Character、Room、Memory 和其他产品场景可用；
- 不伪造默认 lore、空记忆或最新 StorylineVersion。

CharacterStorylineRun revision 和 CharacterMemoryScope revision 只服务真实 CAS 消费者，不能参与 schema、format、contract、cache 或实现分发。

## Character Foundation 收敛

当前以下生产路径属于架构漂移，必须原子删除：

- Character Host contract 中的外部 WorldProject/Version/Run/Save types 和 operations；
- `CharacterFoundationSnapshot.world`；
- `CharacterFoundationCommandService.worldAuthoring/worldRuntime`；
- `CharacterFoundationService.worldCatalog`；
- Character IPC/preload/Webview 对上述操作的 producer/consumer；
- Character Runtime manager 中表达外部 `storyline / saves / world` ownership 的占位项。

替换时同时更新 producer、consumer、fixtures 和 tests，并用 poisoned old operation/field 证明旧路径不能成功。不得保留兼容 alias、dual read、optional old snapshot、fallback handler 或成功 no-op。外部 records 本身不由 Chara 删除、修改或迁移；其他会话负责其 owning surface。

## 项目证据与 Agent context

角色证据必须通过 Desktop-safe ContentLocator/Content port 读取。Entity/Search 只提供稳定 identity、候选和 locator；Chara 按 Character identity、来源权威性、新鲜度和预算排序、去重并裁剪。证据先进入 CharacterProject candidate/review，不直接修改 CharacterVersion、StorylineRun 或 MemoryEntry。

Context Materializer 固定组合：

```text
exact CharacterVersion
  -> authorized CharacterStoryline view
  -> authorized CharacterMemory view
  -> authorized RelationshipMemory view
  -> participant-scoped RoomView
  -> optional owning Composition view
  -> turn permission/model/TTS receipt
```

每个 view 保留 owner identity、revision 和 source refs。缺失 required owner/revision/permission 必须返回 diagnostic；owner 成功但没有 eligible memory 是合法空 view。不得用另一 memory scope、transcript、模型常识或 active selection 伪装成功。

## 错误与演进边界

- 缺失 CharacterVersion、CharacterStorylineRun、CharacterMemoryScope、relationship、RoomRun、AgentSession、permission 或 required provider 必须 fail-visible、fail-local。
- BackgroundStory/OriginSetting 失效不能升级为全局启动失败，也不能自动转换为 runnable world。
- Chara 不提供平行 Agent controller、外部 World service、Activity engine 或跨域 registry。
- 新增字段时一次性更新 canonical producer、consumer、fixture 和 test；不建立内部 contract generation、兼容读取或旧新路径。
- 现有 Character 用户记录不得被静默覆盖。无法满足新 canonical shape 时保留原记录并在 owning Character 显示 diagnostic/修复入口。
- 外部 Composition、World、Activity 和其他 runtime 未实现时保持 owner-qualified unavailable；不得由 Agent prompt、Webview state、静态占位或空 adapter 代替。
