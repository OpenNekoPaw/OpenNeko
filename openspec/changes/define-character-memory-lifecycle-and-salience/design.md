## Context

前置变更 `define-character-authoring-and-runtime-mode-boundaries` 已确定：

- CharacterVersion 是不可变角色 canon，不接收运行互动记忆；
- NarrativeSave/WorldSave 拥有剧情分支、时间点、角色可见事件和用户互动；
- UserCharacterRelationship 拥有本地用户与发布角色的跨会话日常关系记忆；
- AgentSession 拥有 transcript、Tool Call、compaction 和 turn 生命周期；
- embedding、摘要、索引和召回排序是可重建 Memory infrastructure，不拥有领域事实。

仍缺少的是对话进入这些 owner 的 canonical path，以及长期记忆从候选、接受、纠错、删除到
检索的完整语义。常见“把全部 transcript 放入向量库”方案无法表达：

- 工作区创作聊天不能污染用户与角色的真实关系；
- 剧情角色只能记得当前 save、branch、timepoint 和 knowledge scope 内的已提交事件；
- 日常完整对话可以作为证据，但寒暄、模型错误、否定句、临时信息和敏感 payload 不能自动
  成为可召回关系事实；
- 高频事件不等于重要事件，单次明确要求记住的信息也不能因密度低而被遗忘；
- task relevance 会随当前目标变化，不能被写成永久 importance；
- 删除和纠错必须同时失效摘要、全文、embedding 和图投影。

当前仓库的 `.neko/memory.md` 是普通工作区 Agent 的项目级 Markdown memory；
`MemoryRecall` 只做 H2 section 的关键词重叠排序；Pi compaction 只压缩 conversation context；
`SharedMemoryStore` 是 bounded in-memory scratchpad；旧 `neko/character-memory.json` 只有遗留
路径语义。这些机制均不具备 relationship/save identity、revision、可见性、敏感性和用户控制
契约，不能直接成为 Chara 长期记忆 authority。

## Goals / Non-Goals

**Goals:**

- 定义 workspace、narrative 和 companion 三类互斥 conversation memory scope。
- 明确每类对话的 transcript、domain event、memory candidate、durable fact 和派生索引 owner。
- 让剧情对话成为 revisioned save event，并支持按分支、时间点和角色认知产生记忆视图。
- 让日常对话跨会话形成可审计、可纠错、可删除的关系记忆，同时保留 transcript 与 accepted
  memory 的边界。
- 定义结构化记忆种类、来源、时间、敏感性、retention、状态和 revision 语义。
- 将时间/空间/叙事密度用于聚合、摘要粒度、冗余控制和多样性，不把密度当作事实或重要度。
- 将显著性保存为可解释证据并按运行场景动态投影，不持久化不可解释的单一 importance score。
- 规定硬作用域过滤先于 lexical/vector retrieval、密度、显著性和 task relevance。
- 为后续 store、contract、retrieval、UI 和 evaluation OpenSpec 提供可测试边界。

**Non-Goals:**

- 本变更不实现 TypeScript contract、数据库表、Agent adapter、Desktop IPC/UI 或数据迁移。
- 不选择 SQLite、Markdown、JSONL、embedding provider、vector extension 或 graph database。
- 不让 workspace 成为第三种 CharacterRuntimeKind。
- 不定义通用跨产品 Memory Service、云同步、多用户账号或社交图。
- 不实现自动心理分析、隐藏亲密度分数、人格成长或情绪操纵。
- 不把 Reminder、Task、Media/Game state 或现实位置追踪收归 Chara。
- 不要求首版实现核密度估计、图中心性或 embedding；规范只冻结其合法输入和 owner 边界。

## Five-layer analysis

| Layer          | Decision                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Workspace owner 持有工作区记忆；save owner 持有剧情对话事件；relationship owner 持有 accepted 日常记忆；AgentSession 持有 transcript；Memory 只持有派生投影。     |
| Dependency     | Chara 不依赖 Agent/World/storage 具体实现；application service 通过 package-local ports 获取 transcript evidence、save snapshot、relationship revision 和 index。 |
| Interface      | 会话创建时绑定判别 scope；mutation 使用 expected revision；recall 输入包含显式 owner identity、context、budget 和 policy snapshot。                               |
| Extension      | 新记忆种类扩展判别 record；新密度维度扩展派生 feature provider；新 Activity 只提供稳定 observation/source ref，不进入 Chara 实现。                                |
| Testing        | 后续验证覆盖跨 scope/branch/user 隔离、提交失败、纠错删除、索引失效、密度聚合、显著性锚点和 task relevance 不落盘。                                               |

## Decisions

### 1. Conversation memory scope 与 Character runtime kind 分离

目标 contract 使用显式判别 identity：

```ts
type ConversationMemoryScope =
  | {
      readonly kind: 'workspace';
      readonly workspaceId: string;
      readonly conversationId: string;
    }
  | {
      readonly kind: 'narrative';
      readonly saveId: string;
      readonly branchId: string;
      readonly checkpointId: string;
      readonly actorId: string;
      readonly conversationId: string;
    }
  | {
      readonly kind: 'companion';
      readonly relationshipId: string;
      readonly companionRunId: string;
      readonly conversationId: string;
    };
```

`workspace` 是普通 Agent conversation scope，不是 CharacterRuntimeKind。Character runtime kind
仍固定为 `narrative | companion`。Scope 在会话创建时固定；所有 operation/event 必须携带
匹配 identity，不能由 active workspace、tab、角色选择或最近 conversation 推断。

选择显式判别 scope，而不是在通用 transcript 上增加可选 `characterId`，是因为三类对话的
durable owner、恢复、删除、版本、分支和失败语义不同。可选字段会允许非法组合并诱导 fallback。

### 2. 一次对话只进入一个 canonical domain owner

```text
workspace turn
  -> AgentSession transcript
  -> optional WorkspaceMemory candidate
  -> Workspace Memory owner

narrative turn
  -> AgentSession execution evidence
  -> proposed NarrativeDialogueEvent / action
  -> save owner commit
  -> NarrativeSave revision

companion turn
  -> AgentSession transcript evidence
  -> RelationshipMemoryCandidate
  -> relationship owner decision
  -> UserCharacterRelationship revision
```

同一 turn 不进行 workspace/save/relationship 三路写入。跨 scope 使用独立、显式、
source/target-identified review transaction；共享 CharacterVersion、同一用户、同一模型或同一
UI surface 都不授权自动传递。

工作区中的角色分析、Dialogue 测试或模拟扮演仍属于 workspace scope。它只能形成工作区记忆或
CharacterProject authoring candidate，不能自动成为 NarrativeSave 或真实关系记忆。

### 3. 剧情对话必须由 save owner 原子提交为事件

剧情模型采用：

```text
provider/Agent produces proposed response or action
  -> World/Narrative validates scope, actor, expected revision and rules
  -> atomically commits NarrativeDialogueEvent / WorldEvent
  -> advances save revision and checkpoint projection
  -> Chara consumes committed actor memory view
```

`NarrativeDialogueEvent` 至少表达 save、branch、event、actor/speaker/participant、narrative
time/checkpoint、observation/knowledge scope、source turn、CharacterVersion binding 和 committed
revision。具体 wire schema 留给 Narrative/World 实施变更。

流式响应在 commit 前只能是 provisional projection。若 save commit 失败，UI 必须显示失败或
可重试状态；Agent transcript 中出现过文本不能证明角色已经说过、听过或记住该内容。

从旧 checkpoint 继续互动必须创建新 branch identity，不原地改写旧 history。Memory
infrastructure 只能接收 save owner 已按 branch ancestry、timepoint、actor visibility 和
revision 过滤的授权集合。

### 4. 日常 transcript archive 与 accepted relationship memory 分层

日常对话具有长期记忆候选资格，但“完整 transcript 可保留”不等于“每句话都是长期事实”：

```text
Companion transcript archive
  evidence: exact user/assistant/tool/activity source
             |
             v
RelationshipMemoryCandidate
  proposed type + normalized content + source refs + policy metadata
             |
             v
UserCharacterRelationship
  accepted facts / boundaries / agreements / episodes / milestones
```

AgentSession transcript 是 evidence authority；relationship owner 是 accepted memory authority。
结束、压缩或关闭 AgentSession 不删除 accepted memory。反之，transcript 中的模型错误、临时
上下文或未接受候选不能因为可搜索而进入 RelationshipMemoryView。

完整 transcript 的默认 retention、是否加密和用户删除粒度由后续 privacy/storage 设计确定。
无论采用何种 retention，召回必须区分 exact evidence 与 accepted memory。

### 5. Relationship memory 使用判别种类和 revisioned lifecycle

首批领域种类建议保持有限：

| Kind                     | Meaning                          |
| ------------------------ | -------------------------------- |
| `user-fact`              | 用户明确或可靠确认的稳定事实     |
| `user-preference`        | 长期偏好与厌恶                   |
| `user-boundary`          | 不希望保存、讨论或执行的边界     |
| `agreement`              | 用户与角色之间明确形成的约定     |
| `shared-episode`         | 双方共同经历且适合长期保留的事件 |
| `relationship-milestone` | 首次互动、重要纪念或关系状态改变 |

Reminder、日程和待办由 Task/Reminder owner 持有；关系记忆只保存经授权的稳定 ref 或“双方曾有
此约定”的事实。Media/Game 内容和状态由 Activity owner 持有；Chara 只保存最小经历摘要和稳定
Activity ref。

候选/记录生命周期为：

```text
proposed
  -> accepted -> superseded
              -> deleted
  -> quarantined -> accepted / rejected / deleted
  -> rejected
```

- `proposed` 属于 CompanionRun，携带 source、类型、sensitivity、confidence 和 retention 建议。
- `accepted` 由 relationship owner 以 expected revision 提交。
- `quarantined` 用于与新 CharacterVersion canon 冲突、敏感性不明或需要用户审阅的内容。
- `rejected` 不持久保存敏感 payload；只在确有诊断/审计需要时保留不含内容的 decision metadata。
- `superseded` 保留纠错来源但不参与普通召回。
- `deleted` 必须移除内容和派生索引；必要 tombstone 只保留非敏感 identity/revision，不能恢复
  被删除 payload。

用户明确要求记住的非敏感内容可以进入 policy 允许的快速接受路径。模型推断的健康、身份、
创伤、情绪或第三方隐私不得自动接受。

### 6. 记忆记录保存事实和可解释证据，不保存单一 importance

未来 record contract 至少需要：

```text
identity:
  memoryId, relationshipId, localUserScope, revision

meaning:
  discriminated kind, normalized content

provenance:
  source conversation/turn/tool/activity refs

temporal:
  occurredAt, validFrom, optional validUntil

policy:
  sensitivity, retentionClass, acceptance source

evolution:
  status, optional supersedesMemoryId, createdUnderCharacterVersion

salience evidence:
  explicit user importance, consequence, optional emotion evidence
```

新颖性、重复度、连接性、密度、embedding similarity 和 recall score 由授权 snapshot 派生，
不作为 immutable truth 写入 record。需要缓存时必须携带 source owner revision 和 algorithm
version，revision 变化后失效。

### 7. 密度是多轴派生分布，不是重要度

密度不是首版必需能力，也不进入领域事实契约。实现可以不生成任何密度投影；只有真实记忆量
和 evaluation 证明存在高频重复、摘要粒度或召回多样性问题时，才逐步启用。首版如需密度，
优先采用固定时间窗口计数和显式 topic/thread 重复计数，不要求核密度估计、连续分布拟合或
叙事图中心性。

启用时定义三个可选密度维度：

```text
TemporalDensity(memory)
  nearby authorized events within a mode-specific time window

SpatialDensity(memory)
  authorized events sharing explicit scene/place/region identity

NarrativeDensity(memory)
  authorized events linked to the same arc/topic/goal/relationship thread
```

- Narrative density 只在 save owner 已过滤的 branch/timepoint/knowledge 集合内计算。
- Narrative spatial identity 来自 World/Narrative scene/place contract，不由文本相似猜测。
- Companion spatial density 只使用用户授权的粗粒度 place identity；默认不保存 GPS 轨迹。
- Workspace 可以使用时间/主题聚合，但其投影属于 Workspace Memory，不进入 Chara。

密度用于：

- 识别应当聚合的重复或连续事件；
- 决定摘要粒度；
- 限制同主题重复召回；
- 保持不同主题和时间锚点的多样性。

密度不得扩大 owner scope、提升 confidence、证明事件真实或覆盖用户显式重要度。

### 8. 显著性保存为证据向量并按场景投影

显著性是必要的记忆选择语义。系统必须保留足以解释“为何保留、聚合或优先召回”的证据，
但不要求每条记忆具有全部因素，也不定义跨模式统一的单一 `importance` 数值。

显著性因素分三类：

| Class      | Factors                                                     | Persistence                                        |
| ---------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Intrinsic  | 用户明确重视、事件后果、经授权的情感强度与 valence evidence | 保存来源明确的证据                                 |
| Structural | 新颖性、独立重复证据数、显式关联/连接性                     | 从 owner snapshot 派生，可缓存重建                 |
| Contextual | 当前 query、task、scene、goal relevance                     | 仅当前 recall 计算，不写回 durable record/salience |

具体规则：

- 新颖性相对同 owner 的 accepted memory 计算，不能使用“模型觉得惊讶”证明事实。
- 重复度按独立 source/turn/event 计数，使用有上限的对数或等价饱和函数；模型复述不重复计数。
- 连接性来自显式 entity/event/arc/topic refs，不使用召回次数，避免“越召回越重要”反馈循环。
- 情感 `valence` 与 `arousal/intensity` 分离；显著性主要消费强度和后果，不能让负面内容天然
  压过用户边界或积极锚点。
- 用户 `remember-requested` / pinned 是最可靠的长期保留证据，但仍受敏感性和删除策略约束。
- task relevance 是动态 boost；任务切换不能改变 durable memory。

不定义跨模式统一权重。Workspace、Narrative 和 Companion 分别拥有 mode-specific projection
policy；权重、阈值和模型选择属于后续可评估策略，不写进领域事实。

### 9. Recall 固定为 hard filter 后的有预算排序

Canonical recall pipeline：

```text
explicit scope + owner identity + expected revision
  -> load authoritative snapshot
  -> hard filter:
       user / relationship / save / branch / timepoint / actor knowledge
       accepted status / version compatibility / permission / sensitivity / retention
  -> derive lexical/vector relevance, density and salience features
  -> apply mode-specific contextual relevance and recency
  -> diversify and suppress redundant memories
  -> enforce token/item budget
  -> return MemoryView with owner revision and source refs
```

一种可能的派生表达是：

```text
RecallScore =
  QueryRelevance
  + ModeSpecificSalienceProjection
  + CurrentContextBoost
  + TypeAwareRecency
  - RedundancyPenalty
```

它只在 hard filter 通过后计算。实现不能把 scope eligibility 作为可被高分抵消的软权重。

空授权集合可以产生合法空 MemoryView；owner、revision、permission 或必需 index 读取失败必须
返回 typed diagnostic，不能伪装为空记忆成功。Embedding 或 graph index 缺失时是否允许使用
明确的 lexical-only 策略，由后续 runtime contract 显式声明；不得静默 fallback。

### 10. 密度与显著性共同决定 consolidation，不决定删除

建议的 consolidation policy：

|              | Low salience                      | High salience                                |
| ------------ | --------------------------------- | -------------------------------------------- |
| Low density  | 降低召回权重，按 retention 过期   | 保留独立 anchor memory                       |
| High density | 生成可重建主题/阶段摘要并抑制重复 | 保留摘要、关键 anchor 和 source episode refs |

自动摘要默认是 derived projection。只有用户或 owner policy 将其作为新的 accepted memory 提交
时，它才成为 relationship fact，并必须保留来源集合和 revision。

时间衰减只影响召回权重，不自动删除事实。Pinned memory、用户边界、仍有效的 agreement 和明确
纠错不能仅因时间过去而消失。实际删除由 retention policy 或用户操作触发。

### 11. 删除、纠错和索引一致性优先于召回优化

- 用户纠正创建新 revision，并以 `supersedesMemoryId` 连接旧记录；旧记录立即退出普通召回。
- 删除先由 relationship owner 提交新 revision，再失效全文、embedding、summary、density 和
  graph projection。
- Index consumer 必须携带 owner revision；陈旧 revision 的结果被拒绝，不可合并进新 view。
- 备份、导出和 transcript retention 必须在后续 privacy 设计中明确删除覆盖范围，不能只删除
  UI row。
- Narrative save rewind/branch 不删除历史事件，而是改变授权因果集合；普通召回不得跨 branch
  使用历史索引。

选择 revision + projection invalidation，而不是尝试就地更新所有索引，是为了让本地产品保持
唯一事实源并使删除、恢复和测试可证明。

### 12. 首版不依赖 embedding 或复杂图算法

建议后续实现分期：

1. 结构化 record、显式记住/删除/纠错、source refs、revision、关键词/类型/时间筛选和
   规则化显著性证据；不要求密度分布。
2. 受控自动 candidate、事件聚合、可解释显著性投影、lexical hybrid ranking，以及有明确
   召回缺陷时的窗口计数和主题重复统计。
3. 数据规模和 evaluation 证明必要后，再增加 embedding、时间核密度、叙事图指标和周期性
   consolidation。

这符合本地 Electron 产品边界，并避免在没有真实记忆量、召回缺陷和隐私策略证据前引入通用
vector service、graph database 或后台 daemon。

## Risks / Trade-offs

- [全部日常 transcript 长期保留会增加隐私和存储风险] -> transcript retention 与 accepted
  memory 分层；默认策略、加密和删除覆盖由后续 privacy/storage 设计显式确定。
- [自动候选会把模型推断伪装成事实] -> 保存来源和 acceptance source；敏感推断默认
  quarantine/reject；用户明确表达优先。
- [高频寒暄主导召回] -> 重复度饱和、密度用于聚合而非重要度，并应用冗余惩罚和类型预算。
- [负面内容因情感强度反复召回] -> 分离 valence/arousal，限制情感 boost，用户边界和 task
  relevance 优先，提供查看/置顶/删除控制。
- [图连接性产生富者愈富反馈] -> 只消费显式持久 link，不消费 recall count，并对结构 boost 封顶。
- [动态任务相关性污染永久显著性] -> contextual feature 只存在于 recall request/result，不写回
  record。
- [剧情密度跨分支泄漏] -> save owner 先执行 causal/knowledge hard filter，Memory 只接收授权
  snapshot 和 revision。
- [摘要失真] -> 自动摘要保持 derived，保存 source refs；只有显式接受后才成为新事实。
- [索引异步更新导致已删除记忆复现] -> index result 携带 owner revision；删除推进 revision 并
  fail-closed 拒绝陈旧结果。
- [过早设计通用 memory platform] -> 首版保持 Chara/World/Workspace owner-specific contract，
  只共享无领域事实的派生 indexing primitive。

## Migration Plan

本变更不迁移代码或数据。后续实施必须：

1. 先定义 ConversationMemoryScope、NarrativeDialogueEvent consumer contract 和
   RelationshipMemoryRecord/candidate codec。
2. 建立新 canonical owner path，并在测试中 poison `.neko/memory.md`、Pi compaction、
   SharedMemoryStore 和旧 `character-memory.json` 作为 Chara authority 的使用。
3. 对旧数据选择显式 migrate、review/import、rebuild、ignore 或 reject 策略；不得 dual-read、
   dual-write 或静默 fallback。
4. 先交付无 embedding 的结构化 store、用户控制和路径级验证，再引入派生检索优化。
5. 若实现失败或回滚，保留原 owner 数据和 revision；删除可重建 index，不回退旧角色记忆路径。

## Open Questions

- `localUserScope` 的稳定本地 identity 与设备迁移语义由哪个 owner 定义？
- UserCharacterRelationship 是全局用户级事实、角色库旁车数据，还是可移植加密文档？
- Companion transcript 默认保留多久，是否允许只保存 accepted memory 而不保存全文？
- CharacterVersion compatibility 如何判断同一角色的正常升级、重启设定和 alternate-universe 版本？
- Narrative scene/place/arc identity 由未来 World 还是独立 NarrativeDefinition 提供？
- 日常情感证据哪些只能由用户明确标记，哪些允许模型提出 candidate？
- 用户删除是否覆盖备份和导出历史，以及如何给出可验证 diagnostic？
- 哪些真实数据规模、召回指标或缺陷阈值触发 embedding 和图指标阶段？
