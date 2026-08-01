# Chara 领域架构

## 当前状态

`@neko/chara` 是 Character Dialogue、Embody、角色证据、Profile Assembly、角色 purpose
operation 和未来角色运行编排的语义 owner。当前 package 只保留 host-neutral
core/application/testing，没有 Desktop Host adapter 或 manifest consumer；Electron Character
routes 在 P1.6 composition 完成前保持 unsupported。

“package 已存在”只表示第一阶段 owner 已收敛，不表示 CharacterProject、剧情模式、日常模式
或角色会话已经成为 Desktop 产品能力。

## Owner 与事实模型

```text
CharacterProject
  -> publish immutable CharacterVersion
       -> NarrativeCharacterBinding -> NarrativeCharacterRun
       -> CompanionBinding -> UserCharacterRelationship -> CompanionRun
```

- `CharacterProject` 拥有草稿、候选、角色 canon 创作、测试、审阅和发布。
- `CharacterVersion` 拥有不可变的角色 canon、知识边界、角色策略和稳定表现绑定。
- `NarrativeCharacterRun` 拥有剧情角色的活动编排；剧情事实和记忆由
  NarrativeSave/WorldSave 拥有。
- `UserCharacterRelationship` 拥有本地用户与发布角色的跨会话关系记忆、版本绑定历史和
  retention/privacy policy。
- `CompanionRun` 拥有一次日常互动或陪伴活动的短期上下文、候选记忆和运行资源。
- Agent transcript、UI tab、Canvas Storyline 和 Memory index 都不是上述事实的 owner。

`@neko/entity` 只提供通用 Entity identity、alias、occurrence、可重建 relationship
projection、representation 和稳定 ref。Content/Assets、Renderer、Voice、Media、Game、
Device 和其他 Activity owner 继续拥有各自事实与执行实现。

## 分层与依赖

```text
@neko/chara/core
  -> shared stable refs / domain values

@neko/chara/application
  -> chara/core
  -> package-local AgentSession / memory / environment / activity consumer ports

adapters/agent|world|activity
  -> @neko/chara/application
  -> public owning-domain contracts

apps/neko-desktop
  -> public Chara entry
  -> concrete Agent / Entity / Content / World / Activity adapters
```

Core/Application 不导入 Electron、React、Agent runtime implementation 或其他领域的 Host
implementation。Chara 只能消费 Agent contract，不创建 `RoleplayAgent`、
`CharacterAgentExecutor` 或第二套 Tool/Task/Session loop。Agent core/platform/Webview
不反向依赖 Chara；Desktop 未完成 Chara composition 时必须保持 capability unavailable。

## 角色创作与运行生命周期

运行必须绑定冻结的 CharacterVersion。Character Studio 可以为创作调试生成带 identity 和
source revision 的 authoring-test snapshot，但它不能进入 Home 角色库、正式剧情或日常陪伴。
CharacterProject draft 更新不得静默改变已启动运行。

产品文案可以使用“剧情模式 / 日常模式”，领域 contract 固定为
`narrative / companion`。Runtime kind 在创建时确定，不能在活动 CharacterRun 上切换；
切换体验必须创建新的 run、policy snapshot、memory binding 和 AgentSession mapping。

每个 active CharacterRun 至多映射一个 primary AgentSession。Companion relationship 可以
顺序创建多个 run/session，但不能通过共享 responder、active tab 或会话参数切换模拟并发实例。

## 对话记忆作用域

对话在创建时绑定且仅绑定一个 memory scope：

```text
workspace
  -> AgentSession transcript
  -> optional WorkspaceMemory candidate
  -> Workspace Memory owner

narrative
  -> AgentSession execution evidence
  -> NarrativeDialogueEvent / WorldEvent
  -> NarrativeSave / WorldSave revision

companion
  -> AgentSession transcript evidence
  -> RelationshipMemoryCandidate
  -> UserCharacterRelationship revision
```

`workspace` 是普通 Agent conversation scope，不是第三种 CharacterRuntimeKind。工作区中的
角色分析、Dialogue 测试或模拟扮演不能自动进入 NarrativeSave 或 UserCharacterRelationship；
它只能形成 Workspace Memory 或带来源的 CharacterProject authoring candidate。

Scope 和 owner identity 在 conversation 创建时固定。所有 operation/event 必须携带匹配的
workspace、save/branch/checkpoint/actor 或 relationship/run identity，不得从 active workspace、
tab、角色选择或最近会话推断。跨 scope 导入必须使用独立、显式、带 source/target identity 的
review transaction。

## 剧情运行

剧情运行固定路径为：

```text
WorldVersion / accepted NarrativeDefinition
  -> WorldRun / NarrativeRun
  -> NarrativeSave
  -> branch + checkpoint/timepoint
  -> WorldActorInstance
  -> NarrativeCharacterRun
  -> primary AgentSession
```

当前架构由 World 拥有规则、事件、branch、save 和 replay。Chara 通过窄
Narrative/Environment port 消费授权状态，不创建第二套 Storyline/save runtime；Canvas
Storyline 仍只是内容路线与播放投影。

剧情对话不是仅存在于 Agent transcript 的消息。模型生成的 response/action 先是 provisional
结果，必须由 World/Narrative owner 校验 save、branch、actor、规则和 expected revision，并
原子提交为带 narrative time/checkpoint、observation scope、source turn 和 committed revision
的 NarrativeDialogueEvent/WorldEvent。提交失败时不得宣称角色已经说过、听过或记住该内容。

剧情记忆必须先由 save owner 按 save、branch ancestry、checkpoint/timepoint、actor
knowledge scope 和 event revision 过滤，再交给 Memory infrastructure 排序、压缩或语义召回。
其他分支、未来事件、未感知事件和另一个 save 的用户互动不得进入当前角色上下文。剧情用户
互动属于 save event history，不自动进入日常关系或 CharacterVersion。

从旧 checkpoint 继续互动必须创建新 branch identity，而不是改写旧历史。Agent transcript、
embedding similarity、显著性或叙事连接性都不能把另一个分支或角色未知事件重新引入当前
MemoryView。

World/Narrative runtime 未实现时，剧情运行必须返回 unavailable diagnostic。

## 日常陪伴

日常陪伴只允许发布的 CharacterVersion，并以 Chara-owned `UserCharacterRelationship`
作为 durable owner：

```text
UserCharacterRelationship
  -> current CharacterVersion ref
  -> accepted relationship memory
  -> version binding history
  -> retention / privacy policy
  -> CompanionRun -> primary AgentSession
```

日常上下文由五个独立投影组合：

1. CharacterVersion 初始角色信息；
2. 已授权的 RelationshipMemory view；
3. 带 source/freshness 的 RealityContext snapshot；
4. 当前 Media/Game 等 Activity context；
5. 当前 effective capability snapshot。

日常 transcript 可以按 retention policy 跨会话保留为 exact evidence，但可搜索 transcript
不等于 accepted relationship memory。只有 relationship owner 接受的结构化用户事实、偏好、
边界、约定、共同经历和关系里程碑进入 RelationshipMemoryView。关闭或压缩 AgentSession
不删除已接受记忆；transcript 中的寒暄、模型错误和未接受候选也不能因为可搜索而变成事实。

现实背景、模型常识、Tool output 和 Activity state 不是长期记忆。用户消息、工具结果和活动
事件只能产生带 source、sensitivity、retention class 和 revision 的 memory candidate；最终
由 relationship owner 接受、拒绝、更正或删除。凭据、私密文件、临时 URL、完整外部 payload
和 live handle 不得进入关系记忆。

Relationship memory lifecycle 固定为：

```text
proposed
  -> accepted -> superseded / deleted
  -> quarantined -> accepted / rejected / deleted
  -> rejected
```

用户明确要求记住的非敏感信息可以进入 policy 允许的快速接受路径。健康、身份、创伤、情绪和
第三方隐私等模型推断默认不得自动接受。纠错创建新的 relationship revision 并保留 supersession
来源；删除必须移除内容并失效全部派生索引，tombstone 不能保留可恢复的敏感 payload。

## 版本升级

- 剧情 save 默认固定启动时的 CharacterVersion。升级必须显式创建兼容的新 save revision
  或 branch，不改写旧 event 和 replay。
- 日常陪伴通过新的 relationship binding revision 切换 CharacterVersion，并明确把现有记忆
  分类为 retained、quarantined 或 discarded。
- “向新版本追加记忆”表示继续绑定选中的关系记忆，不表示修改发布版本。
- 只有独立的角色设计 insight 经过 CharacterProject 审阅并发布新版本，才能改变角色 canon。

## Agent 与 Activity

剧情和日常运行都复用 Pi/AgentSession 的 turn、Tool Call、Approval、取消、transcript、
compaction 和 event canonical path。`ICapabilityPurposeTextRuntime` 只适用于无会话、无工具的
profile extraction/evaluation 等 bounded operation，不能承载多轮 CharacterRun。

陪玩、观影和其他活动由 owning domain 执行：

```text
CompanionRun
  -> primary AgentSession
  -> typed Tool Call / Activity request
  -> Media / Preview / Game / Device owner
  -> ActivitySessionRef + authorized observation
  -> relationship memory candidate
```

Chara 不拥有媒体播放、游戏状态、设备 handle、任意输入控制或外部应用状态，只保存稳定
Activity ref、参与策略和经筛选的记忆候选。

剧情有效能力使用 Host permission、workspace trust、CharacterVersion policy、World binding
policy 与 NarrativeRun scope 的交集；日常有效能力使用 Host permission、workspace trust、
CharacterVersion policy、relationship policy 与 Activity scope 的交集。任何层只能收窄授权。

## 记忆所有权

| 事实或派生能力                      | 唯一 owner                           |
| ----------------------------------- | ------------------------------------ |
| 角色 canon、知识边界和记忆策略      | CharacterProject / CharacterVersion  |
| 剧情事件、关系、分支和用户互动      | NarrativeSave / WorldSave            |
| 日常跨会话长期互动记忆              | UserCharacterRelationship            |
| 当前短期上下文与未提交候选          | NarrativeCharacterRun / CompanionRun |
| embedding、压缩、索引和召回排序     | 可重建 Memory infrastructure         |
| transcript、Tool Call 与 compaction | AgentSession                         |

同一 CharacterVersion 的剧情和日常运行默认完全隔离记忆。未来跨模式导入必须通过独立、
显式、带 source/target identity 的 review transaction，不能由共享版本、语义相似或 active
selection 自动触发。

## 记忆密度

密度不是首版必需的领域语义。实现可以完全不计算密度；需要处理高频重复、摘要粒度或召回
多样性时，才在 owner 授权 snapshot 上生成可重建统计投影。首版应优先使用固定时间窗口计数、
显式 topic/thread 重复计数等简单统计，不要求核密度估计、连续分布拟合或叙事图中心性。

启用密度投影时，它不是事实、confidence 或 importance：

- temporal density：同一 scope 中时间接近事件的密度；
- spatial density：共享显式 scene/place/region identity 的事件密度；
- narrative density：共享 arc/topic/goal/relationship thread 的事件密度。

剧情密度只能在 save owner 已按 branch/timepoint/actor knowledge 过滤的集合内计算；空间
identity 由 World/Narrative owner 提供，不能由相似文本猜测。日常空间密度只使用用户授权的
粗粒度 place identity，默认不得保存 GPS 轨迹。

密度用于发现重复/连续事件、决定摘要粒度、抑制同主题重复召回和保持多样性。它不得扩大 owner
scope、证明事件真实、覆盖用户明确重视或直接删除记忆。

## 显著性与召回

显著性是必要的记忆选择语义：Chara 必须能够解释记忆为何被保留、聚合或优先召回，但不要求
每条记忆具有所有证据，也不要求计算统一数值。显著性保存为可解释证据和派生 feature，不
持久化单一 `importance` 分数：

| Class      | Evidence / feature                                          | Persistence                                |
| ---------- | ----------------------------------------------------------- | ------------------------------------------ |
| intrinsic  | 用户明确重视、事件后果、经授权的情感强度与 valence evidence | 保存带来源的证据                           |
| structural | 新颖性、独立重复证据数、显式连接性                          | 从 owner snapshot 派生，可缓存重建         |
| contextual | 当前 query、task、scene、goal relevance                     | 只存在于当前 recall，不写回 durable memory |

- 新颖性相对同 owner 的 accepted memory 计算，模型声称“惊讶”不能证明重要。
- 重复度按独立 source/turn/event 计数并使用有上限的饱和策略；模型复述不重复计数。
- 连接性来自显式 entity/event/arc/topic ref，不使用 recall count，避免越召回越重要。
- 情感 valence 与 arousal/intensity 分离；负面方向不能天然压过用户边界或积极锚点。
- 用户 `remember-requested` / pinned 是最可靠的长期保留证据，但仍受敏感性和删除策略约束。
- task relevance 随当前目标动态计算，不能反向修改 durable salience。

Recall 固定先硬过滤后软排序：

```text
explicit scope + owner identity + expected revision
  -> authoritative snapshot
  -> user / relationship / save / branch / timepoint / actor knowledge
  -> accepted status / version / permission / sensitivity / retention
  -> lexical/vector relevance + density + salience + contextual relevance
  -> redundancy suppression + diversity + item/token budget
  -> MemoryView(owner revision + source refs)
```

高分不能抵消 hard filter。Owner 成功但没有 eligible memory 是合法空 view；owner、revision、
permission 或 contractually required index 失败必须返回 diagnostic，不能伪装为空记忆或静默
改用另一 scope/retriever。

## 聚合、纠错与删除

|              | Low salience                    | High salience                                |
| ------------ | ------------------------------- | -------------------------------------------- |
| Low density  | 降低召回权重，按 retention 过期 | 保留独立 anchor                              |
| High density | 生成派生摘要并抑制重复          | 保留摘要、关键 anchor 和 source episode refs |

自动摘要默认是 derived projection；只有经过 owner policy 显式接受并保留来源，才成为新的领域
事实。时间衰减只影响召回权重，不自动删除 pinned memory、用户边界、仍有效 agreement 或纠错。

Relationship revision 变化后，全文、embedding、summary、density、salience 和 graph projection
全部失效。Index result 必须携带 source owner revision；陈旧结果 fail-closed，不能把已删除或
superseded 内容重新注入 Agent context。Narrative rewind/branch 不删除历史事件，而是改变合法
因果集合。

## 项目证据链路

第一阶段角色证据语义继续沿以下 canonical path 装配，未来实现必须改用 Desktop-safe
ContentLocator/Content port，不能建立 package-local file adapter：

1. Entity 通过稳定 `CreativeEntityRef` 提供 canonical name、display name 和 aliases，不负责角色问题检索或 prompt 组装。
2. Chara 分别以非空角色名称和别名调用 Project Search，并按稳定 Search item ID 去重。当前回合问题和内部 Entity ID 不得进入 `story-symbols` 查询。
3. Search 只返回项目内场景或角色 locator；其全局 token 匹配语义不因角色场景而改变，也不负责索引完整对白正文。
4. Desktop 注入的 Content/file port 校验 locator 的项目边界和受支持扩展名，并读取场景正文。
5. Chara Core 按当前回合问题、角色身份、来源权威性、新鲜度和预算排序、去重并裁剪正文。
6. Character session 只把最终 evidence bundle 注入当前 responder system prompt，不把证据写入 transcript 或持久 profile source。

Profile Assembly 与 Character Dialogue/Embody 的单轮证据加载复用同一组 Chara application
ports。不得恢复 Dashboard evidence reader、宽泛 workspace 搜索、Agent memory 或模型常识
fallback。Search 成功但没有角色场景是合法空证据；Entity/Search 等必需依赖失败必须终止
当前启动或回合，并且不得调用 responder。

角色模型选择与证据检索是两条独立契约。角色用途使用全局 `character.dialogue` / `character.profile` 精确绑定；Chara 不复制 Agent 会话级模型切换状态，也不在绑定或证据失败时回退 Agent/default model。

## 错误与演进边界

- 缺失 CharacterVersion、workspace、Entity identity、required evidence、save/branch/checkpoint、
  relationship revision、Activity owner、permission 或非法 run/session 必须返回明确 diagnostic。
- 不得回退 active run、另一运行模式、旧版本、普通 Agent conversation 或 empty-memory success。
- Chara 是 Character 语义与 application runtime 的唯一 owner，不提供平行 controller 或 re-export。
- 跨包 `Npc*` DTO 与 Agent Renderer 角色投影属于共享 contract/Chat shell；Chara 仍是语义 owner，wire/persistence 变更必须通过独立 OpenSpec。
- 现有 `character-memory.json`、路径型 ref 和 `Npc*` DTO 不自动成为新关系/存档格式；后续
  contract OpenSpec 必须明确迁移、重建、拒绝或有意忽略策略。
- `.neko/memory.md`、关键词 MemoryRecall、Pi transcript/compaction 和 SharedMemoryStore 不得
  作为 Character 长期记忆 authority；它们分别属于 Workspace Memory、AgentSession 或临时
  scratchpad。
- CharacterProject/Version、NarrativeSave/World、UserCharacterRelationship、持久恢复、
  Companion Activity 和独立 Webview 未实现时必须 fail-visible。
