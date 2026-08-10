## Context

`@neko/chara` 已拥有 host-neutral Dialogue/Embody、角色证据、Profile Assembly 和 bounded purpose operation，但 Desktop Character routes 仍为 unsupported，CharacterProject/Version、CharacterRun、UserCharacterRelationship、CharacterRoom 和 RoomRun 尚未实现。`@neko/world` 当前不存在；现有 World 提案面向完整 AI-native World，范围远大于聊天室当前需要的世界书、背景、演化、timeline 和角色可见视图。

本设计先建立角色、单角色对话、聊天室和最小 World Foundation。Browser Use、Computer Use、Play-use、外部游戏和 VLA 已由其他变更处理，不进入本设计的 contract、tasks、成功路径或验收声明。

2026-08-09 参考调研了 Apache-2.0 项目 [Project-N-E-K-O/N.E.K.O](https://github.com/Project-N-E-K-O/N.E.K.O) 的公开文档，重点核对其 Live2D、VRM、MMD、PNGTuber、memory system 和 session management。可借鉴的产品结论是“多表现类型共享角色语义入口、角色记忆分层、表现可进入桌宠窗口”；不采用其 Python main server、per-character manager、HTTP/WebSocket endpoint 或文件布局，因为 OpenNeko 的 owner、Electron trust boundary 和 package layering 不同。上游格式支持和实现细节会变化，本设计只把当前真实消费的稳定产品边界纳入约束。

### 五层分析

| 层   | 结论                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 职责 | Chara 拥有角色 canon、版本、运行绑定、关系记忆、Room participant/调度、Room timeline 与 Avatar representation selection；World 拥有世界书、世界事实、演化、World timeline、save/branch 和 WorldView；Agent 拥有会话与模型执行；Host 拥有 Window scene/slot composition。 |
| 依赖 | Chara/World core 只依赖稳定 ref/domain value；application 通过窄 consumer port 组合。Desktop 才依赖 Electron、路径授权、文件和 IPC。                                                                                                                                     |
| 接口 | Character、Room、World、Avatar presentation 和 Desktop scene 各有唯一 canonical contract；跨域协作只传精确 identity、不可变 view、typed launch intent 和 typed result。                                                                                                  |
| 扩展 | 新 Avatar renderer 通过 representation kind 对应的唯一 renderer 注册扩展；完整 World、实时 AI 和 Activity 通过 World application/public port 扩展，不改变当前 CharacterRun、RoomRun 或 WorldEvent authority。                                                            |
| 测试 | package fixture 验证 owner、状态、隔离和 CAS；consumer test 验证 `@角色` 选择与唯一 AgentSession；真实 Electron 验证 catalog/detail、Workbench slots、Avatar、对话、聊天室、切换、恢复和 unavailable。                                                                   |

## Goals / Non-Goals

**Goals:**

- 提供可创建、编辑、测试、审阅、发布和选择的 CharacterProject/CharacterVersion。
- 提供 Character catalog + detail 管理场景，不以业务类型 Tab 组织管理和互动。
- 允许用户从 Agent Entry 通过一个或多个精确角色选择启动 Dialogue 或 Room。
- 提供 Character/Room 独立 Workbench，并在 Main slot 显示可替换的 2D/3D Avatar/Scene。
- 提供角色运行管理投影，使记忆、故事线、存档、分支和历史 Run 可按其真实 owner 检查和继续。
- 提供 companion/narrative 单角色对话和多角色聊天室的统一运行规则。
- 确保每个 agent-controlled CharacterRun 只使用一个 primary Pi AgentSession。
- 提供独立 participant/controller identity、有序 Room timeline、可见性过滤和 bounded scheduling。
- 建立聊天室当前真实消费的最小 World owner，而不是把世界事实放进 Chara 或 UI。
- 让日常模式在没有 World 时完整可用，让叙事模式只在精确 World authority 可用时启动。
- 保持 Room event、World event、Agent transcript 和长期记忆的唯一 owner。
- 为未来完整 World 提供稳定事实链，不预建空 provider、插件、控制或第二 runtime。

**Non-Goals:**

- 不实现 Browser Use、Computer Use、Play-use、外部游戏、VLA、seat/control lease 或 OS 输入。
- 不实现完整 World Library、World marketplace、实时生成式世界模型、Director/Narrator 或实时多模态表现。
- 不在本变更中承诺所有 Live2D、VRM、MMD、PNGTuber 格式的完整导入、编辑、物理、语音驱动或桌面悬浮窗口；首批只建立稳定表现 contract、可用 renderer 路径和缺失能力诊断。
- 不实现通用插件系统、动态 schema registry、兼容读取、migration path 或内部 contract version dispatch。
- 不把 Agent transcript、Room timeline、模型摘要、Renderer state 或搜索索引当作 Character/World authoritative data。
- 不允许运行中的 DialogueRun/RoomRun 切换 companion/narrative 或隐式改变 World/memory owner。

## Decisions

### 1. 互动拓扑与运行模式正交

产品当前只区分两种互动拓扑：`dialogue` 表示用户与一个角色互动，`chatroom` 表示用户与多个 human/agent/system participant 互动。`companion | narrative` 是独立的运行和记忆模式，不是 UI 页面类型。

合法组合为：日常单聊、叙事单聊、日常聊天室和叙事聊天室。Play 不是本次 Chara 互动类型；未来 Play-use 由独立 Activity/World 扩展组合。

### 2. CharacterProject 和 CharacterVersion 是角色事实 owner

`CharacterProject` 拥有可变草稿、证据引用、候选 canon、测试和审阅状态。发布产生用户可管理、不可变的 `CharacterVersion`，冻结 canon、知识边界、行为/表达策略和稳定表现引用。

Character authoring-test snapshot 必须携带独立 identity 和 source CharacterProject state，只能用于 Dialogue/Embody 创作验证，不得进入角色库、日常关系或正式叙事运行。CharacterProject 更新不得改变已启动 CharacterRun。

### 3. CharacterRun 只绑定唯一 AgentSession

每个 agent-controlled CharacterRun 在创建时冻结 CharacterVersion、runtime kind、memory binding、participant policy 和 primary AgentSession identity。Agent runtime 拥有 turn、queue、Tool Call、Approval、streaming、取消、transcript 和 compaction；Chara 只物化角色 profile、授权 memory/world/room view 和策略输入，并消费 Agent turn projection。

Desktop Main 的 concrete composition adapter 实现 Chara consumer port：`primaryAgentSessionId` 是选择 AgentSession transcript 的 exact conversation identity，Pi authority 在其内部继续维护独立 `piSessionId`、branch 和 transcript。adapter 只把 Chara 已过滤的冻结 context 投影为通用 `AgentWorkspaceRuntime` turn payload，并把 `AbortSignal` 绑定到同一 active Pi turn；Tool、Approval、transcript、compaction 和 terminal checkpoint 仍走 Agent application 公共路径。通用 `@neko/agent-runtime` 不依赖 Chara contract 或 application。

现有 `CharacterDialogueSession`、`EmbodyCharacterSession` 仅保留为 authoring test kernel。在产品路径接通时，不得把它们的本地 responder/transcript 用作 CharacterRun 成功路径。

### 4. Chatroom 拥有参与者和 Room timeline

`CharacterRoom` 是 durable 业务记录，保存标题、参与者模板、默认 runtime kind 和可选 WorldVersion ref。`RoomRun` 是一次活动互动，冻结 participant roster、controller、CharacterRun mapping、memory binding 和可选 World binding。

每个 participant 拥有稳定 participant identity，controller 明确为 human、agent 或 deterministic system。多个 agent participant 不能共享 responder、AgentSession、mutable transcript、model config 或 memory view。Room application service 负责 mentioned、turn-based 或 bounded autonomous scheduling；并行推理只产生 provisional response。

Room timeline 是 Chara-owned 有序事件流，只保存发言、加入、退出、提及、调度、moderation 和对 WorldEvent 的稳定引用。每次 commit 使用 `expectedRoomRevision`，拒绝陈旧或重复提交。

### 5. 最小 World Foundation 是当前真实 owner

当前建立 host-neutral World 闭包：

```text
WorldProject -> immutable WorldVersion
  -> WorldRun -> WorldEvent -> WorldState
  -> participant-scoped WorldView
  -> WorldSave + branch identity for narrative continuation
```

`WorldProject` 保存可编辑 WorldBook、背景介绍、地点/组织/规则/初始事实和经审阅 source ref。`WorldVersion` 冻结这些用户可见世界定义。`WorldRun` 保存当前实例 identity；`WorldEvent` 是唯一已发生事实；`WorldState` 只由 WorldVersion 初始状态和同一 branch 的已提交事件计算。

`WorldSave` 保留 root branch 和显式子分支。子分支只保存 `parentBranchId + forkedFromWorldEventId`、本分支新增事件和当前状态，不复制或改写父分支事件；其起始事实由 WorldVersion 初始事实和祖先事件重放得到，分支内 `worldStateRevision` 从 0 计数，叙事 `timepoint` 从 fork event 继续。历史分支可按精确 identity 读取；继续提交前必须显式激活目标分支，不得用 active/recent 分支回退。

Foundation 不提供独立 World 产品 surface，也不建立 AI role、表现 provider、Activity 或控制 adapter。它因 CharacterRoom 的真实 producer/consumer path 而存在，不是未来占位包。

### 6. Room timeline 与 World timeline 分离

角色发言不是世界事实。用户或 Agent 提出的世界变化首先是 `WorldActionIntent`，携带 actor、target、action、observation identity 和 expected World state revision。World application service 严格验证 identity、visibility、registered action、rule 和 revision，成功后原子提交 WorldEvent。

Room 可以引用已提交 WorldEvent，在 UI 中按时间组合展示两条 timeline；组合 projection 可重建且只读，不得写回 Room 或 World。模型摘要、背景介绍和 worldbook 文本也不能绕过 intent/commit 成为 WorldEvent。

### 7. World binding 由 runtime kind 约束

日常模式的长期 owner 是 `UserCharacterRelationship`。日常 DialogueRun/RoomRun 可以没有 World；显式绑定 World 时，WorldView 只提供背景、场景和活动上下文，World event 只能产生关系记忆候选。

叙事模式必须绑定精确 `worldVersionId + worldRunId + worldSaveId + branchId`。World owner 先按 branch、timepoint、participant/actor knowledge 和 visibility 物化 WorldView；缺失或失效时只拒绝该叙事 Run，不能降级为 companion、读取最近 WorldRun 或把 Room transcript 当作 save。

runtime kind 和 binding 在 Run 创建时固定。切换模式、CharacterVersion、relationship、WorldVersion、save 或 branch 必须创建新 Run 或执行 owning domain 明确定义的 transaction；不得原地切换 authority。

### 8. 记忆 owner 保持分离

| 数据                                    | 唯一 owner                          |
| --------------------------------------- | ----------------------------------- |
| 角色 canon、知识边界和默认策略          | CharacterProject / CharacterVersion |
| 日常跨会话关系记忆                      | UserCharacterRelationship           |
| 叙事事实、状态、分支和角色认知          | WorldSave / World branch            |
| Room participant 与公共发言             | CharacterRoom / RoomRun             |
| turn、Tool Call、transcript、compaction | AgentSession                        |
| embedding、搜索和摘要                   | 可重建 projection/infrastructure    |

跨模式导入必须是独立、显式、可审阅的业务操作。本变更不建立自动导入或兼容路径。

### 9. Character Management 是 catalog + detail 管理场景

Character 入口是 Window 级单例管理场景，不是 Character/Dialogue/Chatroom/World 工作区。Main slot 展示可搜索、排序、筛选和多选的 Character catalog；选中 CharacterProject 后，Secondary Main 展示 detail，承载草稿编辑、审阅、发布版本、表现绑定和运行记录。创建角色也是 detail 的 fresh state，不创建 management session 或隐藏业务 Root。

Main 与 Secondary Main 必须沿共享边界连续拼接，只由 Workbench 提供一条可调整的分隔线；场景组合不得在两个 package-owned Surface 之间增加 gutter、margin 或卡片式外边距。Surface 内部仍可按各自内容层级保留字段、工具栏和列表的正常间距。

World Foundation 不作为该管理场景的平级 Tab。WorldProject/Version 只通过 Character detail 的关联资源入口或 Character/Room Workbench 的 manager slot 管理；未来完整 World Library 由独立 World 变更建立自己的 Window 导航场景。

旧 `CharacterFoundationRoot` 四 Tab 组合被原子替换。新路径不得保留隐藏旧 Root、平行导航入口或通过 Tab 继续创建 Dialogue/Room。

### 10. Agent Entry 的角色选择决定 Conversation owner

Agent Entry 的 `@` catalog 投影已发布且有效的 CharacterVersion。选择角色产生 typed `CharacterLaunchSelection`，不是普通上下文片段：

- 一个精确 CharacterVersion 选择创建 companion 或 narrative DialogueRun，并创建 `character` owner 的 Agent Conversation；
- 两个或更多精确 CharacterVersion 选择创建用户显式触发的 CharacterRoom/RoomRun，并创建 `room` owner 的 Agent Conversation；
- 没有角色选择时保持普通 Assistant/Workspace Entry；
- 重复、失效、未发布或跨越不兼容 World binding 的选择在首次提交前 fail-visible，不创建部分 Run、Conversation 或隐式默认 Room。

首条用户消息只在 Chara launch application service 成功创建 exact owner 后提交给 Agent。`@角色` 选择不作为可被普通 context chip 替代的 prompt 文本，也不得在已启动 Conversation 内原地改变 owner；用户要更换角色集合或 runtime kind 时创建新 Conversation/Run。

Chatroom 因多角色显式选择而创建，仍是可选扩展能力。单角色 Dialogue 不创建或强制绑定 Room；companion 不强制 World。

### 11. Character Conversation 使用独立 Workbench composition

恢复或创建 Character/Room Conversation 后，Host 创建 `character-interaction` Window scene，并以 exact Conversation/Run identity 投影：

- `interaction`: 唯一 Agent Webview Root，绑定 `character | room` Conversation owner；
- `main`: package-owned Avatar/Scene Surface，显示角色 portrait、Live2D、VRM、MMD、PNGTuber 或未来 2D/3D 情景；
- `rightManager`: Character/World Resources Surface，按当前 Run 的精确角色与可选 World binding 展示管理能力；
- `timeline`: Room/World read-only combined projection，仅在用户打开或叙事工作流需要时可见；
- `status`: scene/runtime diagnostic。

Interaction、Main、Manager 和 Timeline 是同一可见 composition 的独立 owner Roots。离开场景时全部卸载；受保护 Agent turn/RoomRun/WorldRun 可继续，但不得因此保留 React tree。Main Avatar 与 manager 失败只隔离其 Surface，不能停止 Agent turn 或隐藏 durable record。

这些可见 Roots 必须像 Workspace Workbench 一样沿相邻边界连续拼接，不得由 Character 场景额外包裹 margin 或 gutter；组件间层级通过共享边框和 resize handle 表达。

### 12. Avatar representation 与 runtime 分离

CharacterVersion 保存稳定 `CharacterRepresentationRef`，引用由 Assets/Content authority 管理的资源 identity，并声明用户可选择的表现用途和类型。当前类型至少覆盖 portrait、Live2D、VRM、MMD 和 PNGTuber；格式文件、纹理、动画、表情映射和模型包仍由对应资源 owner 管理，Renderer 不接收 raw path。

Chara application service 从精确 CharacterVersion 和用户显式选择解析一个 active representation；Host 只授权资源并组合与 kind 精确匹配的 renderer。Registry 必须精确映射唯一 renderer，禁止 first-compatible、失败后换模型或静默退回 portrait。没有绑定表现时允许明确的 `no representation` fresh state；绑定失效或 renderer 缺失时显示局部 diagnostic。

Avatar runtime 只拥有渲染资源、pose/expression/action 播放和释放。表情/动作可消费已提交 Agent/Room/World projection，但不能写 Character canon、Agent transcript 或 World state。viewport、camera、model pose 和 layout 可进入 package-owned presentation snapshot；模型资产、运行记忆和 save 不得复制到 snapshot。

桌宠是 Avatar Surface 的未来 Host presentation：同一 active representation 可以由显式用户操作投影到独立透明 Window，但该 Window 不能创建第二 AgentSession、第二 Avatar fact owner 或隐藏 Conversation。当前 Workbench Main 是首个真实 consumer，不为未来桌宠预建空 Window adapter。

### 13. 角色运行管理按真实 owner 投影

Character detail 与 Workbench manager 提供一个可重建的 Character Runtime Management projection：

| 用户看到的内容                      | authoritative owner                                         |
| ----------------------------------- | ----------------------------------------------------------- |
| 日常关系记忆、候选、确认与纠正      | UserCharacterRelationship                                   |
| Dialogue/Room 历史和当前参与者      | DialogueRun / CharacterRoom / RoomRun                       |
| 对话消息、Tool、Approval 和压缩状态 | AgentSession transcript projection                          |
| 叙事故事线、世界事件、存档和分支    | WorldSave / World branch                                    |
| 当前 Avatar、动作、镜头和布局       | CharacterVersion representation ref + presentation snapshot |

管理视图不得建立统一 Character Session、复制 transcript/WorldSave，或用“最近运行”决定继续目标。用户继续、分支、归档或删除时必须指向精确 owner identity；本变更只实现已有 owner 支持的操作，未实现的记忆维护、存档比较或分支 UI 必须显示 unavailable，而不是成功 no-op。

### 14. 生命周期与 UI 驻留解耦

CharacterProject、CharacterVersion、CharacterRoom、WorldProject、WorldVersion 和 save 是 durable records；CharacterRun、RoomRun、WorldRun 和 AgentSession 是可脱离 UI 的业务/runtime identity；当前可见 Dialogue/Chatroom Root 只是 presentation。

卸载或切换 UI 不得删除 durable record、取消受保护 Agent turn 或重置 World state。无运行、排队、审批或外部操作保护条件的 runtime 应释放；恢复必须使用原精确 identity，不得回退 active/recent Workspace、Room、Character 或 World。

### 15. Future World 扩展同一 authority

未来完整 World 可以增加 WorldExperienceVersion、实时 AI World Model、Intent Interpreter、Character Agent、Director、Rule Evaluator、Narrator、实时表现、复杂 checkpoint/replay 和 Activity composition，但仍必须通过同一 `WorldActionIntent -> WorldEvent -> WorldState -> WorldView` 事实链。

Play-use 或其他 Activity 可以由未来 WorldExperience 编排，但实际游戏状态、浏览器/桌面 target、输入和验证仍由对应独立 owner 提供。本变更不定义这些 owner 的 contract，也不建立 optional import 或 no-op adapter。

### 16. Revision 只作为有真实消费者的 CAS token

本变更不得新增 schemaVersion、formatVersion、contractVersion 或按版本分发路径。CharacterVersion/WorldVersion 是用户可见、可引用和不可变的领域版本，不是内部格式版本。

允许两个有界 correctness token：

- `roomRevision` 由 Room application service 拥有，consumer 是并行 participant response commit；不变量是同一 RoomRun 的公开事件具有唯一总序，陈旧推理不能迟到写入。若未来 Room commit 可在不丢失该不变量的单线程事务中完全串行化，应移除 token。
- `worldStateRevision` 由 World application service 拥有，consumer 是 WorldActionIntent commit；不变量是 action 只能基于其观察到的确切 WorldState 提交。若未来 action 不再跨异步推理边界，应移除 token。

两者都不能改变 contract shape、选择 handler、路由新旧实现或作为持久 schema generation。

### 17. Package 和实施边界

`@neko/chara` 继续使用当前单包显式 `./contracts`、`./core`、`./application` 和 `./testing` subpath；跨领域消费者只导入 `@neko/chara/contracts`。Host-neutral World 使用单一 `@neko/world` package 和显式 subpath。SQLite persistence 已形成独立 Node 依赖闭包，因此由 `@neko/chara-node` 与 `@neko/world-node` 拥有，避免 Chara/World application 反向依赖 `@neko/local-metadata` 及其 Entity/Search 图；Webview 只有在真实 React surface 开始实施时再按同一 taxonomy 建立。

Desktop Main 只实现 repository/file/time adapter、sender-bound typed IPC、Window/Workspace identity binding、public service composition 和资源释放。Character/Room/World 规则、校验、状态、恢复和错误 taxonomy 留在 owning package。

### 18. Durable repository 与 Agent owner context

Character、Room 和 World 的 durable repository contract 与 SQLite row codec 由各自 owning package 的 application public entry 拥有；`@neko/local-metadata` 只提供注入的事务/SQL port，Desktop 只选择数据库实例并完成初始化。CharacterProject、CharacterVersion、relationship、CharacterRun、DialogueRun、CharacterRoom、RoomRun、WorldProject、WorldVersion 和 World runtime aggregate 分别按稳定 identity 保存，单条 decode 失败只影响该记录，不触发 sibling 清空、默认记录或全局启动失败。RoomRun 与 World runtime mutation 在同一 repository transaction 内校验并提交各自 CAS token，不建立 raw/cache/legacy 替代路径。

Agent catalog 继续使用唯一 `agent_conversation_authority` 作为 Conversation context authority，并将 canonical `AgentConversationContext` 扩展为 `assistant | workspace | character | room`。Character context 携带精确 `characterId + characterRunId + workspaceId`，Room context携带精确 `roomId + roomRunId + workspaceId`；其中 `workspaceId` 只选择实际 Pi runtime scope，不改变 Character/Room owner。`CharacterPrimaryAgentSessionPort.createPrimarySession` 必须在创建 Pi Conversation 时写入对应 owner context；失败时删除刚创建的 Conversation，不能留下无 owner 的成功记录，也不能新增第二 owner store。Agent Home 直接从该 context 投影现有 `AgentConversationOwnerRef`。

Desktop 的 canonical producer/consumer 路径为 Renderer `OpenNekoDesktopCharacterBridge` -> preload strict codec -> sender-bound Main handler -> package-owned Character/World facade -> package-owned repository/Agent adapter。被替代的是 Character route 的 unsupported 分支；切换时原子删除该分支，不保留 feature flag、optional handler 或 authoring-test runtime fallback。Desktop 保留的逻辑仅依赖 Electron sender/Window identity、preload 暴露和 concrete metadata/config composition，因此不能下沉为 host-neutral 业务行为。用户数据影响仅为新增 canonical records；当前不存在已发布旧 Character/Room/World 数据格式，不读取、迁移或覆盖未知旧 shape。

## Risks / Trade-offs

- [当前同时建立 Character、Room 和 World Foundation，范围仍较大] -> 按 owner 分阶段实施，先 contract/fixture，再 Character，随后 Agent path、Room、World，最后 Desktop vertical slice；每阶段保持未组合 route unavailable。
- [Room 和 World 都有 timeline，容易重复事实] -> contract 明确事件种类和 owner，组合 UI 只保存 ref，不复制 payload 或提交权。
- [日常可选 World 可能被误当作叙事 authority] -> runtime kind discriminated contract；companion WorldView 不能成为 relationship memory 或 narrative save。
- [叙事 World Foundation 被实现成简化聊天摘要] -> WorldState 只接受严格 WorldActionIntent/WorldEvent commit，transcript 与摘要永不成为事实。
- [未来完整 World 引入第二 runtime] -> 路径测试固定唯一 World event/state authority，并要求未来变更扩展而非替换 Foundation。
- [并发 revision 被滥用为内部版本] -> 仅保留上述两个 CAS owner/consumer/invariant，禁止参与 schema、routing、cache 或 compatibility。
- [`@角色` 被当作普通 prompt 上下文而不是 owner selection] -> 首次提交 contract 区分 launch selection 与 context chip，并以创建出的 Conversation context/Run identity 做路径级断言。
- [多角色选择隐式创建不受管理的 Room] -> 用户选择本身是显式创建条件，Chara 原子创建 durable Room/Run；失败不留下部分记录，后续可按 exact identity 管理。
- [多种 Avatar 格式诱发 fallback renderer 或万能 runtime] -> representation kind 精确映射唯一 renderer；每个 renderer 自己拥有资源生命周期，失败只影响当前 Surface 且不得切换格式。
- [角色管理与运行管理重新形成统一 Session] -> catalog、durable record、Agent runtime、World save 和 presentation snapshot 分别保留 owner，管理界面只消费组合 projection。

## Migration Plan

1. 重命名并收敛本 OpenSpec，删除 Character Play-use capability/spec/tasks；所有现有 Character Desktop routes 继续 unavailable。
2. 建立 canonical Character 和 World contracts/codecs，原子更新当前边界内 producer、consumer、fixture 和 tests，不保留旧 shape。
3. 实现 Character authoring/publication 与 authoring-test isolation。
4. 通过唯一 Pi AgentSession 接通 companion Dialogue，再实现 CharacterRoom participant/timeline/scheduling。
5. 实现 World Foundation、日常可选绑定和叙事强制 binding；缺失 authority 的叙事 route fail-visible。
6. 原子删除四 Tab `CharacterFoundationRoot` 产品路径，接入 Character catalog + detail 管理场景。
7. 在 Agent Entry 接入 typed `@CharacterVersion` launch selection，单角色创建 Dialogue、多角色创建 Room，并通过唯一 Pi AgentSession 提交首条消息。
8. 接入 Character Conversation Workbench、Avatar/Scene Main、Character/World manager、Room message 和最小 World action 产品桥接。
9. 通过真实 Electron、真实 Agent path、Avatar 资源释放、恢复和 identity isolation 验收后开放能力。

本变更当前没有已发布 Character/Room/World 用户格式或可用 Desktop route，不需要 compatibility reader 或数据 migration。若取消 World Foundation，删除未发布 package/route 和 artifacts；不得把 World facts 回收到 Chara transcript。
