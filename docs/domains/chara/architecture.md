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

`@neko/entity-domain` 只提供通用 Entity identity、alias、occurrence、可重建 relationship
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

## 产品设计：角色数量 × 互动类型

用户可见体验只暴露角色数量和互动类型两个正交维度：

| 产品预设    | Character topology | Interaction | 运行含义                                                           |
| ----------- | ------------------ | ----------- | ------------------------------------------------------------------ |
| 单角色对话  | `single-character` | `dialogue`  | 用户与一个 agent-controlled character 对话                         |
| 单角色 Play | `single-character` | `play`      | 一个角色代打、陪玩、观战或指导，并绑定可选游戏席位                 |
| 多角色对话  | `multi-character`  | `dialogue`  | 用户与多个独立 CharacterRun 在同一 revisioned room 中互动          |
| 多角色 Play | `multi-character`  | `play`      | 多角色共享聊天室与授权游戏 observation，按角色分别绑定游戏参与职责 |

四种预设必须复用同一 participant、room event、AgentSession 和 Activity contract，不能形成四套
controller、transcript 或 UI store。`Embody Character` 仍是用户扮演一个角色、只读 evaluator
提供证据反馈的 authoring workflow；它不拥有游戏输入，也不是 Play mode。Play-use 是 Play 内部
用于观察、决策和控制游戏的技术机制，不是第五种产品模式。

每个 participant 必须携带稳定 participant identity 和显式 controller：human、agent 或
deterministic system。agent-controlled character 才创建 CharacterRun 与 primary AgentSession；
human-controlled character 不得同时启动隐藏的角色扮演 Agent。World Director、room coordinator
和规则裁判使用独立 scope，不伪装成普通 CharacterVersion。

## 房间、配置与回合

Dialogue-only workspace/rehearsal room 可以由 Chara application owner 管理临时互动；正式剧情或
游戏房间的规则、event、save、branch 和 replay 由 World/Game owner 管理。两者都必须提供唯一
有序 room timeline；每个 committed event 携带 room、actor、visibility、source turn/action、
expected revision 和 committed revision。并行模型推理只能产生 provisional intent，公开发言与
同席位动作按 revision 串行提交。

角色 Agent 配置分成四层：

1. `CharacterVersion`：冻结的 canon、知识边界、对话样例和默认角色 policy；
2. `CharacterRun` binding：runtime kind、participant policy、memory owner 和 Activity ref；
3. conversation config：精确 provider/model/parameters、capability 与参与策略 revision；
4. turn snapshot：当前 turn 冻结的模型、permission、room/memory revision 和授权 observation。

CharacterProject 更新不得改变 active run。runtime kind、CharacterVersion 或 memory owner 变化
必须创建新 run 或显式 binding transaction；conversation/model 参数修改只能影响后续 turn。
每个 agent-controlled participant 独立拥有上述配置和 AgentSession，不能通过共享 responder 后
切换 profile/model 模拟多个角色。

Room/World/Game owner 必须先按 participant visibility、team/seat、save/branch、actor knowledge
和 owner revision 过滤 observation。角色只接收当前回合的不可变 view；密聊、隐藏身份、未感知
事件和其他席位的 private state 不得因共享房间、语义相似或模型常识进入上下文。

## 技术概念：LLM、VLA、记忆与上下文

Play 使用分层智能，不要求一个模型同时承担长程策略、角色表达和每帧控制：

```text
CharacterVersion + authorized memory/context
  -> LLM / AgentSession
       roleplay + rules + strategy + collaboration + long-horizon goal
  -> VLA / low-latency control policy
       cropped observation + short goal -> bounded action chunk
  -> Game Activity verifier
       state/outcome/revision -> replan or commit
```

- LLM 拥有当前 AgentSession 的角色表达、规则理解、长期目标、策略、队友沟通、记忆查询、
  上下文压缩和重规划；不直接拥有游戏事实或 Host 输入。
- VLA（Vision-Language-Action）或等价 control policy 负责实时游戏的短时视觉到动作闭环；
  只接收裁剪 observation、短期 goal、允许 action space 和 stop condition，不拥有 Character canon、
  relationship memory、room timeline 或 game save。
- Game Activity owner 校验 action、seat、state、expected revision 和 outcome；模型生成的动作在
  owner 接受前只是 provisional intent。

不同游戏类型复用同一层级，但选择不同路径：

| 游戏类型           | 主要输入/动作                       | 模型与运行重点                                                   |
| ------------------ | ----------------------------------- | ---------------------------------------------------------------- |
| 回合制/策略游戏    | 结构化 state、规则、离散合法 action | LLM 长程规划为主，VLA 可选；每回合由 Game owner 校验             |
| 实时/动作游戏      | 连续画面、手柄/键鼠 action chunk    | VLA/低延迟 policy 负责短时闭环，LLM 只在事件/目标/失败边界重规划 |
| 多人/合作/对抗游戏 | seat、team、visibility、room event  | 独立 AgentSession、逐席位 lease、私有观察过滤与有序协作          |

角色记忆、游戏经验和运行上下文必须分离：

| 信息                                    | Owner                                        |
| --------------------------------------- | -------------------------------------------- |
| 角色 canon、知识边界、说话方式          | CharacterVersion                             |
| 剧情/日常长期记忆                       | NarrativeSave / UserCharacterRelationship    |
| conversation transcript/compaction      | AgentSession                                 |
| 当前游戏状态、规则进度、胜负和存档      | Game / World owner                           |
| 规则摘要、动作语义、示范和 episode 结果 | Game Activity experience/playbook projection |
| 当前回合的预算化上下文                  | 可重建 Context Materializer snapshot         |

Context Materializer 固定按以下顺序组合并保留 source identity/revision：冻结 profile → 授权剧情/
关系 memory view → 游戏规则与 playbook → room/team/private event view → 当前 game observation →
当前 goal、permission、model 与 control-lease receipt。LLM 接收预算化文本/结构化 context；VLA
只接收短时控制所需 context。原始连续帧不进入 durable transcript，Agent compaction 也不能升级为
角色或游戏事实。

## 跨游戏快速学习

Play 的目标是跨新游戏快速适应，不是为每款游戏训练专用模型。Game Activity 使用通用、版本化
`GameCapabilityProfile` 描述：

- observation：structured、pixels 或 hybrid；
- action space：semantic、discrete、continuous 或 text；
- timing：turn-based 或 realtime；
- seat、team、visibility、reset/checkpoint、verification 和 target qualification。

Profile 只描述接口和约束，不包含固定坐标宏、按游戏名称分支的 Character controller 或私有模型
权重。新游戏的 canonical adaptation path 是：识别并资格化目标 → 检索授权规则/教程 → 在教程、
训练场或安全 checkpoint 校准 observation/action → 可选记录少量用户示范 → LLM 生成初始策略 →
VLA/control policy 进行有限试玩 → verifier 评估 outcome → 保存可删除、带版本和来源的 episode
experience。后续 session 通过 retrieval 与 in-context demonstration 复用经验，常规接入不重新
训练模型。

game/version/UI/action fingerprint 不兼容时，旧 experience 必须失效并重新校准。无法在 step、
延迟、安全和验证预算内适应时，只能保持 commentator/coach、assisted/needs-review 或 unavailable，
不能通过无限探索、静默输入或伪造“已学会”返回成功。

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

Play-use 是 CharacterRun 参与 Game Activity 的能力，不是 Character Dialogue 增加键鼠权限。
角色参与职责固定为：

| Play-use role | 权限与用途                                                              |
| ------------- | ----------------------------------------------------------------------- |
| `commentator` | 只观察并参与聊天室，不提交游戏动作                                      |
| `coach`       | 分析局面并给出建议，不持有控制 lease                                    |
| `co-player`   | 控制一个明确、独立的游戏席位                                            |
| `delegate`    | 在用户明确授权期间临时控制用户席位，用户可随时 Pause、Stop 或 Take over |

Play-use canonical path 固定为：

```text
CharacterRun
  -> primary AgentSession
  -> typed Tool Call / Game Activity request
  -> Game Activity owner
  -> structured adapter or qualified ComputerUseSession
  -> Desktop Host target/observation/input port
```

每个可写游戏席位同时最多一个 controller lease。多角色存在不自动授予多个 Agent 输入权；
commentator/coach 永远只读，co-player 必须绑定独立 seat，delegate 使用可撤销的用户 seat lease。
控制交接携带 ActivitySession、seat、controller 和 expected revision 并原子提交。用户输入、接管、
目标窗口/进程失配、焦点或权限变化必须暂停控制；恢复前重新验证 target 和 pending action。

Game Activity/adapter 拥有游戏语义、允许动作、席位、状态、完成判断和 verification；Desktop Host
只拥有精确 app/process/window binding、授权截图/region、聚焦和输入原语。Computer Use 必须是
预先选择并资格化的 transport，执行有限的 `observe -> validate target -> propose -> approve ->
act -> observe -> verify` 循环，携带 timeout、step budget、action traits 和 evidence policy；API、
adapter 或 target 失败不得静默切换为任意键鼠控制。用户可见 UI 必须持续投影 Pause、Stop 和
Take over。

普通 bounded Character Dialogue 使用精确 `character.dialogue` purpose。Play 分别解析完整
AgentSession 的 `game.plan` LLM、可选 `game.observe` perception model 与 `game.control` VLA/control
model；同一多模态模型可以承担多个 role，但 receipt 必须记录每个 purpose 的确切 provider、model
和 parameters。UI 的 fast/balanced/powerful 只能是 preset。缺失 capability、credential 或 binding
时返回 unavailable diagnostic，不回退另一 participant、其他 purpose 或 first-compatible model。

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
| 游戏规则、状态、存档和可重建经验    | Game / World / Activity owner        |
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

角色模型选择与证据检索是两条独立契约。bounded 角色用途使用 `character.dialogue` /
`character.profile` 精确绑定；完整 CharacterRun 的 participant/conversation override 由 Agent owner
解析并冻结为 turn snapshot。Chara 不复制 provider registry、credential 或 Agent 会话级可变模型
状态，也不在绑定、capability 或证据失败时回退 Agent/default model。

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
  Companion Activity、多人 room、Play-use、Game/Device/Computer Use Host port 和独立 Webview
  未实现或未经真实平台/游戏版本资格验证时必须 fail-visible。
