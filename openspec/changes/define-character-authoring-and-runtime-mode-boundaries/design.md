## Context

现有 Character 目标架构以 `CharacterProject -> CharacterVersion -> CharacterRun` 为主线，并已确定：

- Chara 拥有角色创作与运行语义；
- World 通过发布的 CharacterVersion 使用角色；
- 每个 CharacterRun 至多拥有一个 active primary AgentSession；
- CharacterRun memory candidate 或 WorldSave experience 经过审阅后可以进入新的 CharacterVersion；
- Agent、Entity、Assets、Renderer、Voice、Media 和 Memory infrastructure 保持各自 owner。

这个模型能够阻止 Agent transcript 或 UI state 成为角色事实，但仍把不同性质的互动压入同一个 CharacterRun：

- 剧情角色需要绑定故事线、分支、时间点和存档，角色只能记得当前因果路径上已经发生且可感知的事件；
- 日常角色需要以发布版本为初始设定，在现实背景中与本地用户持续互动，并跨多次会话保留关系记忆；
- 陪玩、观影和工具调用需要复用 owning domain 的 Activity/Capability，而不是成为 Chara 内部状态机；
- 发布版本升级不能同时满足剧情重放稳定性和日常关系记忆延续，必须使用不同迁移规则。

当前 `@neko/chara` 仍是未接入 Desktop 的第一阶段 host-neutral 内核，CharacterProject、CharacterVersion、World/Narrative runtime、持久 CharacterRun 和关系记忆 store 均未实现。本变更只冻结目标设计，不授权恢复 VS Code Host、旧角色 controller、共享路径 DTO 或成功 no-op。

## Goals / Non-Goals

**Goals:**

- 明确角色创作定义、发布版本与运行实例的事实边界。
- 将剧情运行和日常陪伴建模为两个不可变运行种类，而不是活动 session 上的可切换 flag。
- 为剧情存档记忆与日常关系记忆确定不同 durable owner、可见性和迁移规则。
- 保持一个 Pi/AgentSession canonical path，同时让 durable relationship/save state 独立于 Agent transcript。
- 让现实背景、工具、媒体和游戏活动通过窄 port/ref 组合，不把其实现或临时状态放入 Chara。
- 定义跨模式隔离、版本升级、记忆候选、删除和 fail-visible 语义。
- 为后续 Character/World/Companion 实施 OpenSpec 提供可测试的契约边界。

**Non-Goals:**

- 本变更不实现 CharacterProject/Version codec、World/Narrative runtime、Companion store、Agent adapter、Desktop IPC、Webview 或 UI。
- 不定义具体数据库表、embedding 模型、召回算法或 provider。
- 不把 Canvas Storyline playback projection 升级为剧情运行或存档 authority。
- 不实现多人账号、云同步、远程社交关系或多租户 memory service。
- 不决定陪玩、观影或其他 Activity 的具体产品清单和第三方集成。
- 不迁移现有 `Npc*` DTO、`character-memory.json` 或用户数据；其处置由后续 contract/data OpenSpec 负责。

## Five-layer analysis

| Layer          | Decision                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | CharacterProject/Version 拥有可发布角色 canon；World/Narrative save 拥有剧情事实；Chara companion relationship 拥有日常长期互动记忆；run 只拥有活动编排和短期状态。 |
| Dependency     | Chara core 不依赖 World/Agent/Media 实现；Narrative/Companion application 通过 package-local consumer ports 消费 save、AgentSession、RealityContext 和 Activity。   |
| Interface      | 运行入口使用 `narrative` / `companion` 判别契约和显式 identity；记忆读取先由 owner 产生授权 snapshot，再交给派生检索。                                              |
| Extension      | 新剧情规则进入 World/Narrative owner；新陪伴活动进入 owning capability/activity provider；新角色创作事实进入 CharacterProject/Version。                             |
| Testing        | 后续实现必须覆盖跨分支隔离、跨模式隔离、版本固定/重绑、AgentSession 唯一映射、活动 owner 和禁用 legacy/fallback 路径。                                              |

## Decisions

### 1. 角色创作与角色运行是不同生命周期

目标模型是：

```text
CharacterProject
  -> publish immutable CharacterVersion
       -> NarrativeCharacterBinding -> NarrativeCharacterRun
       -> CompanionBinding -> UserCharacterRelationship -> CompanionRun
```

`CharacterProject` 拥有草稿、候选、审阅、测试和发布过程。`CharacterVersion` 是不可变或内容寻址的发布快照，拥有角色 canon：

- 稳定角色身份引用和显示语义；
- 人格、背景、关系设定和知识边界；
- 对话、行为、记忆与 capability policy；
- representation、voice、motion 等稳定 binding；
- schema/version、发布 provenance 和兼容性 metadata。

运行实例只能引用冻结的 CharacterVersion 或明确的 authoring test snapshot，不能持续读取可变 CharacterProject draft。运行产生的事件和记忆不得直接修改 CharacterVersion。

选择该设计而不是让 CharacterRun 直接引用 CharacterProject，是为了保证剧情重放、日常关系升级和测试结果都基于可识别的角色定义。

### 2. `narrative` 与 `companion` 是创建时固定的运行种类

产品文案可以显示“剧情模式”和“日常模式”，领域 contract 使用：

```ts
type CharacterRuntimeKind = 'narrative' | 'companion';
```

运行种类在创建 CharacterRun 时固定。活动运行不能原地切换 kind；切换产品体验必须创建另一个 run，并重新解析 identity、policy、memory owner 和 AgentSession。

两个运行种类可以共享 CharacterVersion、Profile projection、AgentSession port、Voice/Renderer port 和通用 UI primitive，但不能共享：

- durable memory store；
- active transcript；
- capability snapshot；
- save/relationship identity；
- current activity/environment state；
- active AgentSession。

判别联合优于单一 session 上的条件 flag，因为两种模式的恢复、版本升级、记忆检索和失败语义均不同。

### 3. 剧情运行是 CharacterRun 对 World/Narrative save 的绑定

剧情运行使用：

```text
WorldVersion or accepted NarrativeDefinition
  -> WorldRun / NarrativeRun
  -> NarrativeSave
  -> branch + checkpoint/timepoint
  -> WorldActorInstance
  -> NarrativeCharacterRun
  -> primary AgentSession
```

当前架构中 World 已拥有规则、事件、分支、save 和 replay，因此剧情运行默认作为受限 WorldRun 组合，不在 Chara 内新增 Storyline engine。未来如果出现独立于 World、具有真实消费者的 Narrative runtime，必须通过单独 OpenSpec 建立 owner；在此之前 Canvas Storyline 仅是内容路线与播放投影。

生产剧情运行必须绑定已发布 CharacterVersion。Character Studio 的创作调试可以绑定一次冻结的 authoring test snapshot，但该 snapshot：

- 只能用于测试/调试 scope；
- 必须有独立 snapshot identity 和 source revision；
- 不得被 WorldProject、日常陪伴或 Home 角色库当作发布版本；
- draft 更新后不能静默改变已启动运行。

### 4. 剧情记忆由 save 的因果历史决定

剧情角色的可见记忆不是全局向量检索结果，而是 save owner 产生的授权记忆视图：

```text
NarrativeMemoryView =
  CharacterVersion canon
  + facts visible in the current save
  + events reachable from the current branch ancestry
  + events at or before the current checkpoint/timepoint
  + observations permitted by actor knowledge/visibility policy
  + user interactions committed to the same causal path
```

检索必须先按显式 `saveId`、`branchId`、checkpoint/timepoint、actor identity、event revision 和 knowledge scope 过滤，再在该有限集合内执行排序、压缩或语义召回。Memory infrastructure 不能先跨 save/branch 全局召回，再依赖 Prompt 排除不可见事实。

分支操作复制或引用共同祖先事件并产生新的 branch identity。回到旧 checkpoint 必须恢复当时的记忆视图。其他分支、未来事件、角色未感知事件和另一个 save 的用户互动默认不可见。

剧情中的用户互动属于 NarrativeSave/WorldSave event history。它可以形成角色记忆投影，但不会自动进入 Companion relationship 或 CharacterVersion。

### 5. 日常陪伴新增 Chara-owned 持续关系聚合

日常模式只允许引用已发布 CharacterVersion，并新增：

```text
UserCharacterRelationship
  relationshipId
  localUserScope
  currentCharacterVersionRef
  memory journal / accepted memory refs
  version binding history
  retention and privacy policy
  revision
```

`UserCharacterRelationship` 是本地产品内用户与一个发布角色的持续关系，不是云账号、社交图或新的全局用户服务。它比单次 CompanionRun 生命周期更长，可以顺序创建多个 CompanionRun 和 AgentSession。

`CompanionRun` 拥有：

- run identity 和一个 active primary AgentSession mapping；
- 当前短期上下文和 activity bindings；
- 当前 reality context snapshot；
- 尚未提交的 memory candidates；
- 取消、结束和资源释放状态。

关系聚合拥有已接受的长期互动记忆；Agent transcript 只提供证据，不是关系记忆 authority。关闭对话 view 或结束一个 AgentSession 不删除关系记忆。

### 6. 日常上下文由三层独立输入组成

日常 responder context 按以下职责组合：

```text
CompanionContext =
  CharacterVersionInitialContext
  + RelationshipMemoryView
  + RealityContextSnapshot
  + CurrentActivityContext
  + EffectiveCapabilitySnapshot
```

- `CharacterVersionInitialContext` 提供角色初始人格、背景、知识边界和表达策略；
- `RelationshipMemoryView` 提供与本地用户的已接受长期互动事实；
- `RealityContextSnapshot` 提供当前时间、区域、用户明确提供的现实背景和经授权的外部知识；
- `CurrentActivityContext` 提供当前观影、游戏或其他 activity 的临时状态；
- `EffectiveCapabilitySnapshot` 提供当前 turn 可调用能力。

现实背景和 provider/model 常识不是长期记忆。RealityContext 必须携带 source、freshness 和 scope；过期或缺失时返回明确 diagnostic，不能写入 CharacterVersion 或伪装为用户共同经历。

### 7. 日常长期记忆通过候选和关系策略提交

CompanionRun 可以从用户消息、角色响应、Tool result 或 Activity event 产生结构化 memory candidate，例如：

- 用户明确偏好；
- 双方约定；
- 共同完成的活动；
- 关系里程碑；
- 用户要求记住的事实。

候选必须携带 source event/transcript/tool/activity identity、proposed scope、sensitivity、confidence 和 retention class。提交由 UserCharacterRelationship owner 根据当前 policy 执行：

- 明确要求记住的内容可以进入审阅或受策略允许的提交路径；
- 敏感、凭据、私密文件内容和未经授权的第三方信息不得自动保存；
- Tool output 和媒体内容只能保存必要摘要与稳定 ref，不能保存 token、临时 URL、完整字幕或 provider object；
- 用户必须能够查看、拒绝、删除或更正关系记忆；
- 删除必须更新关系 revision，并使派生索引失效或重建。

日常关系记忆不 promotion 到 CharacterVersion。只有关于角色设计本身的独立 authoring insight，经过 CharacterProject 审阅并发布新版本后，才能改变角色 canon。

### 8. 两类版本升级使用不同事务

剧情运行默认固定启动时的 CharacterVersion：

```text
NarrativeSave(version A)
  -> explicit compatibility review
  -> new save revision or branch bound to version B
```

更新不得原地改写旧 save、历史 event 或 replay。无法兼容的 binding、knowledge state 或 capability 必须产生 typed diagnostic。

日常陪伴更新通过关系重绑：

```text
Relationship revision N(version A + accepted memories)
  -> compare version B
  -> select retained / quarantined / discarded memories
  -> Relationship revision N+1(version B + selected memories)
```

选择“追加记忆”表示将选中的关系记忆继续绑定到新关系 revision，不表示修改 CharacterVersion B。与新 canon 冲突的记忆必须进入 quarantine/review，不能静默覆盖版本设定。旧 revision 保留审计与显式回退能力。

### 9. 工具、陪玩和观影使用 owning Activity/Capability

日常运行支持工具和陪伴活动，但 Chara 不拥有媒体播放器、游戏状态、文件 IO 或第三方应用：

```text
CompanionRun
  -> primary AgentSession
  -> typed Tool Call / Activity request
  -> Media, Preview, Game, Device or other owning domain
  -> ActivitySessionRef + authorized observation
  -> Companion memory candidate
```

Activity owner 管理实际资源、进度、控制、取消和释放。Chara 只保存稳定 Activity ref、角色参与策略和经筛选的关系记忆候选。

“一起看电影”不能让 Chara 保存播放 handle 或完整字幕；“陪玩”不能让 Chara 直接拥有游戏状态或任意输入控制。具体操作必须通过 owning capability 暴露的 typed affordance，并继续遵守审批、用户数据和安全边界。

### 10. 两种运行都复用唯一 AgentSession canonical path

每个 active NarrativeCharacterRun 或 CompanionRun 至多映射一个 primary AgentSession。日常 relationship 可以跨时间拥有多个顺序 run/session，但同一 run 不得创建平行 responder loop。

Agent 拥有模型调用、turn、Tool Call、Approval、取消、transcript、compaction 和事件投影。Chara application service 拥有 run identity、mode-specific context assembly、memory candidate 和 relationship binding；World/Narrative owner 拥有剧情 event/save commit。

现有 bounded `ICapabilityPurposeTextRuntime` 只适合无会话、无工具的 profile extraction、evaluation 或其他明确 bounded operation。它不能承载剧情/日常多轮运行，不能替代 primary AgentSession，也不能持有 durable transcript 或 memory authority。

### 11. 有效能力按运行种类取交集

剧情运行：

```text
NarrativeCapabilities =
  HostPermission
  ∩ WorkspaceTrust
  ∩ CharacterVersionPolicy
  ∩ WorldCharacterBindingPolicy
  ∩ NarrativeRunScope
```

剧情 mutation 只能通过 revisioned World/Narrative action 由 save owner 提交。通用现实工具默认不进入剧情能力目录，除非 World binding 显式允许且不破坏知识边界。

日常陪伴：

```text
CompanionCapabilities =
  HostPermission
  ∩ WorkspaceTrust
  ∩ CharacterVersionPolicy
  ∩ RelationshipPolicy
  ∩ CurrentActivityScope
```

任何下游层只能收窄能力。真正产生副作用的 owner 在提交时重新校验 permission、identity、revision 和 approval。

### 12. 跨模式记忆默认隔离

同一个 CharacterVersion 可以同时被剧情和日常运行使用，但：

- NarrativeSave memory 不自动进入 UserCharacterRelationship；
- Relationship memory 不自动进入 NarrativeSave；
- 任一运行记忆不自动进入 CharacterVersion；
- 一个 run 的 transcript、tool result 或 Activity state 不自动进入另一个 run；
- UI active selection 不得作为任何导入目标。

未来若提供“把共同回忆带入剧情”或“把剧情经历作为日常回忆”的产品能力，必须使用显式、可审阅、带 source/target identity 的 import transaction，并定义 canon conflict 和隐私规则。

### 13. 持久与运行时数据保持隔离

可持久事实只保存稳定 identity、revision、policy、accepted memory record 和 portable locator。以下内容保持 host-private/run-scoped：

- Agent/provider client、Renderer/Voice/Media/Game live handle；
- Webview/blob/localhost URL、token、进程 ID；
- 绝对路径、cache path 和临时文件；
- 当前设备枚举 ID、窗口或 active tab identity；
- 未提交的完整 Tool payload 和外部敏感内容。

恢复失败、版本不存在、save/branch/checkpoint 不匹配、relationship revision 陈旧、Activity 不可用或 permission 被撤销时必须返回 typed diagnostic。不得回退 active run、其他 mode、旧版本、普通 Agent conversation 或空 memory success。

## Risks / Trade-offs

- [新增 relationship 聚合扩大 Chara 责任] -> 只拥有用户与角色的关系记忆、版本绑定和 policy；账号、媒体、游戏、工具和通用用户画像留在原 owner。
- [剧情模式依赖尚未实现的 World] -> 本变更只冻结 consumer port 和 owner；World/Narrative runtime 未建立前剧情产品路径保持 unavailable。
- [两类运行共享 UI 后再次合并状态] -> UI 只消费 discriminated projection；Host/application 依据显式 run kind 和 identity 路由，禁止 active-tab fallback。
- [长期记忆保存过多或侵犯隐私] -> 采用 candidate、sensitivity、retention policy、审阅/删除和派生索引失效机制。
- [版本升级产生 canon 冲突] -> 使用显式 compatibility review、quarantine 和新 relationship/save revision，不做原地 merge。
- [语义检索泄漏其他分支] -> 先由 save owner执行因果/知识过滤，再在授权集合内检索。
- [Activity 被 Chara 吸收] -> Chara 只持有 ActivitySessionRef 和观察摘要；架构测试禁止导入具体媒体、游戏或设备实现。
- [日常关系被误作 CharacterVersion] -> CharacterVersion 保持不可变，relationship revision 与版本 revision 使用不同 identity 和 store。

## Migration Plan

本变更是纯设计变更，没有运行时代码或用户数据迁移：

1. 新增 Character authoring/runtime mode capability，并修订 Character/World memory ownership requirement。
2. 更新 Chara 稳定领域文档和 package boundaries，标明当前仍未实现、未接入 Desktop。
3. 先归档被本设计接续的已完成 Character 聚合变更，再按 OpenSpec 顺序归档本变更，确保 modified capability 有稳定基线。
4. 后续分别创建 CharacterProject/Version contract、World/Narrative save runtime、Companion relationship memory、AgentSession adapter 和 Desktop surface OpenSpec。
5. 每个实现变更必须定义旧 `Npc*`/character-memory 数据的迁移、重建、拒绝或有意忽略策略，并提供 canonical-path tests。

回滚仅撤销本次文档变更；不会删除或修改现有用户数据。后续实现不得以回滚为由恢复旧 VS Code controller、Dashboard evidence、共享 active session 或 silent fallback。

## Open Questions

- Companion memory 默认采用逐条确认、按类别自动接受还是混合策略，需要在具体产品/隐私 OpenSpec 中确定。
- 本地用户 scope 的稳定 identity 和多本地 profile 支持需在 Companion persistence contract 中冻结；不得因此引入云账号或多租户抽象。
- CharacterVersion compatibility metadata 的最小 schema、冲突分类和 UI review 需要在发布/升级 OpenSpec 中确定。
- 独立 Narrative runtime 只有在出现不适合 WorldRun 的真实生命周期和消费者时才可提出；当前默认复用 World owner。
