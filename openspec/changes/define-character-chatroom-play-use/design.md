## Context

`@neko/chara` 当前拥有单角色 Character Dialogue、Embody、角色证据和 profile assembly 内核，Desktop 尚未组合 Character 产品能力。稳定架构已经规定每个 active CharacterRun 至多映射一个 primary AgentSession，并把 Gameplay、设备、外部应用和输入控制交给 World/Game/Activity 与 Desktop Host owner；但还没有定义单/多角色 × 对话/Play 产品模型，也没有定义 LLM/VLA 分工、角色记忆与游戏经验隔离、不同游戏类型的执行路径或无需重新训练的快速适应机制。

本设计需要同时保护五个真实边界：角色 identity/canon、AgentSession conversation、房间有序事件、游戏事实/席位和 Desktop 输入权限。相关方包括 Chara、Agent runtime、未来 World/Game Activity、Desktop Main 和 Agent Webview。

## Goals / Non-Goals

**Goals:**

- 用角色数量和 `dialogue / play` 两个正交维度表达四种产品预设，避免向用户暴露底层 Play-use transport。
- 定义 agent-controlled character、human participant、room coordinator、director 和 game seat 的独立 identity、owner 与生命周期。
- 允许每个 agent-controlled participant 绑定独立 CharacterVersion、AgentSession、模型配置、参与策略和授权 observation。
- 定义 LLM 的角色/策略/协作职责和 VLA 的短时视觉动作职责，并为策略、动作和多人游戏提供统一分层路径。
- 定义角色记忆、游戏经验、房间上下文、实时 observation 和 Agent transcript 的 owner 与物化顺序。
- 通过通用 observation/action/profile、检索、示范、短期经验和验证反馈支持新游戏快速适应，而不要求重新训练模型或新增游戏专用 Agent loop。
- 定义 Play-use 角色、控制 lease、用户接管、目标验证、有限自动化和结果证据。
- 保持唯一 Pi/AgentSession、Tool Call、Activity 和 Computer Use canonical path。

**Non-Goals:**

- 本变更不实现 CharacterProject/Version、World/Game runtime、Computer Use Host port、游戏 adapter、Webview 或 Desktop route。
- 不承诺支持任意游戏、反作弊规避、后台输入、进程注入、内存读取、脚本宏或未授权窗口观察。
- 不承诺所有新游戏零样本即可可靠自动操作；不通过为每款游戏微调/训练独立模型来伪造通用性。
- 不把房间 transcript、游戏存档或截图变成 CharacterVersion 或长期关系记忆。
- 不用一个大模型 responder 模拟多个独立角色，也不为 Chara 建立第二套 Agent loop。

## Decisions

### 1. 产品设计只暴露角色数量与互动类型

产品配置由 `characterTopology: single-character | multi-character` 与 `interaction: dialogue | play` 组合。四个用户可见预设只是合法组合的名称，不建立四套平行 runtime。Play 表示角色参与游戏；Play-use 是 Play 内部用于观察、决策和控制外部/本地游戏的技术能力，不作为产品 mode。`Embody Character` 继续是用户扮演角色并由只读 evaluator 提供反馈的 authoring workflow，不等同于 Play。

未采用单个四值 mode enum，因为角色数量和 Activity 生命周期独立变化；将二者压入一个 enum 会在参与者、模型和游戏控制策略中产生重复分支。

### 2. Participant identity 与 controller identity 分离

房间 participant 携带稳定 `participantId` 和可选 CharacterVersion/WorldActor ref；controller 明确为 human、agent 或 deterministic system。只有 agent-controlled character 才创建 CharacterRun 与 primary AgentSession。用户接管游戏席位只改变 control lease，不把 AgentSession identity 改成用户，也不切换 CharacterRun 的 active identity。

每个 active CharacterRun 至多一个 primary AgentSession；同一角色出现在不同 room/save/relationship 时创建不同 run/session mapping。多角色房间不能共享 responder、transcript、model config 或可变 memory view。

### 3. Room timeline 是唯一有序公共互动事实

房间 owner 保存带 `roomId`、`eventId`、`revision`、`actorRef`、visibility 和 source turn/action identity 的有序 event stream。公开发言和同一游戏席位动作按 expected room/game revision 串行提交；并行模型推理只能产生 provisional intent。

Dialogue-only workspace/rehearsal room 由 Chara application owner 管理临时 interaction；正式 narrative/game room 由 World/Game owner 管理 event、规则、save 和 replay。Renderer 只消费 versioned projection。

### 4. Agent 配置分为稳定版本、run binding、conversation config 和 turn snapshot

CharacterVersion 保存角色 canon、知识边界、对话样例和默认 policy，不保存 provider secret、活动 handle、room transcript 或动态游戏状态。CharacterRun 固定 version、runtime kind、memory binding 和 participant policy。Agent conversation config 保存精确 model binding 与参数；每个 turn 开始时冻结 model、permission、capability、room revision、memory revision 和 observation snapshot。

Dialogue-only bounded operation 使用精确 `character.dialogue` purpose。Play CharacterRun 使用完整 primary AgentSession，并按角色分别解析 `game.plan` LLM、可选 `game.observe` 视觉模型和 `game.control` VLA/控制模型；同一多模态模型可以满足多个 purpose，但 turn receipt 仍分别记录用途、模型和参数。产品 preset 可以展示 fast/balanced/powerful，但执行 receipt 必须记录确切 provider/model/parameters。缺失、不兼容或无凭据的 binding 返回 unavailable diagnostic，不回退其他 purpose 或模型。

### 5. LLM 与 VLA 使用分层而非竞争的控制权

LLM/AgentSession 负责角色身份与语言表达、长期目标、规则理解、策略规划、队友协作、记忆查询、上下文压缩和向用户解释。VLA（Vision-Language-Action）或等价短时控制 policy 负责从裁剪后的连续视觉 observation 和当前短期 goal 生成有界动作序列。VLA 不拥有角色 canon、关系记忆、游戏存档或 room timeline。

```text
CharacterVersion + memory/context
  -> LLM / AgentSession: intent, strategy, communication, short-horizon goal
  -> VLA / control policy: observation -> bounded action chunk
  -> Game verifier: state/outcome/revision
  -> LLM: replan, speak, remember candidate
```

回合制策略游戏可以只使用结构化 state/action 与 LLM planner，VLA 为可选；实时动作游戏不得让远程 LLM 参与每帧闭环，而由 VLA/低延迟 control policy 执行短 action chunk，LLM 只在事件、目标或验证边界重规划；多人游戏在相同层级上增加 team/seat/visibility 和 room coordination，不建立另一套模型 runtime。

### 6. 角色记忆、游戏经验和上下文是不同事实

角色 canon 与知识边界属于 CharacterVersion；剧情记忆属于 NarrativeSave/WorldSave；日常关系记忆属于 UserCharacterRelationship；conversation transcript/compaction 属于 AgentSession；当前游戏状态、规则进度和胜负属于 Game/World save；跨 session 可复用的规则摘要、动作语义、失败模式和 episode demonstration 属于 Game Activity 的 versioned experience/playbook projection。

每个 turn 的 Context Materializer 按硬边界组合：冻结角色 profile → 授权关系/剧情 memory view → 游戏规则与通用 playbook → 当前 room/team/private event view → 当前 game observation/state → 当前目标、permission、model 和 control-lease receipt。LLM 获取预算化摘要与 source revisions；VLA 只获取完成短期动作所需的裁剪 observation、goal、allowed action space 和 stop condition。原始视频帧不进入长期 LLM transcript，Agent compaction 也不能升级为角色或游戏事实。

### 7. 新游戏通过快速适应而非重新训练进入

Game Activity 使用通用 `GameCapabilityProfile` 描述 observation transport（structured/pixels/hybrid）、action space（semantic/discrete/continuous/text）、timing（turn-based/realtime）、seat/team/visibility、reset/checkpoint、verification 和 target qualification。Profile 描述接口和约束，不包含固定坐标宏、游戏专用提示词分支或模型权重。

新游戏接入顺序为：识别并资格化目标 → 读取官方规则/教程和授权资料 → 在教程、训练场或安全 checkpoint 校准 observation/action → 可选采集少量用户示范 → 用 LLM 形成初始策略和短期目标 → VLA/控制 policy 有界尝试 → verifier 评估结果 → 保存带版本、来源和 outcome 的 episode experience。后续 session 通过 retrieval 和 in-context examples 复用经验；模型更新不是常规接入条件。

只有 observation/action contract、目标资格或验证能力不同，才增加 game profile/adapter。角色、Agent 或 Chara 包不得出现按游戏名称分支的专用 controller。无法在预算内可靠适应时返回 assisted/needs-review 或要求用户接管，不能宣称成功。

### 8. Play-use 是 Activity 能力，不是 Character Dialogue mode

Play-use 角色分为：

- `commentator`：只消费授权 observation 并参与聊天；
- `coach`：只提出建议，不提交游戏动作；
- `co-player`：控制独立席位；
- `delegate`：在用户授权下临时控制用户席位。

调用路径固定为 `CharacterRun -> primary AgentSession -> typed Tool Call/Activity request -> Game Activity owner -> qualified ComputerUseSession/structured adapter -> Desktop Host`。Chara 只保存 ActivitySessionRef、参与策略和经过筛选的记忆候选。

### 9. 游戏控制使用 per-seat exclusive lease

每个游戏席位同时最多一个 controller lease。多角色存在不自动授予多个 Agent 输入权；commentator/coach 没有 write capability。co-player 必须绑定独立 seat，delegate 使用可撤销的用户席位 lease。控制交接是带 expected revision 的原子事务。

用户输入、Pause、Stop、Take over、目标窗口失配、进程重启、遮挡或权限变化立即暂停 lease；恢复前重新绑定 target 并确认 policy。多个 Agent 可以并行分析，但同席位动作必须串行验证和提交。

### 10. Play-use 复用受控 Computer Use 边界

Game Activity/adapter 拥有游戏语义、合法动作、完成判断和 verification；Desktop Host 只拥有精确 app/process/window binding、授权观察、聚焦与输入原语。操作循环保持有限的 `observe -> validate target -> propose -> approve when required -> act -> observe -> verify`，并带 timeout、step budget、action traits 和 evidence policy。

结构化官方 API/MCP 或游戏 adapter 优先；qualified Computer Use 是启动时显式选定的 transport，不是 API/contract 失败后的静默 fallback。Play-use 不允许任意桌面、固定坐标宏、后台点击、进程注入或绕过游戏限制。

### 11. Observation、房间上下文和长期记忆保持分离

Room/Game owner 先按 participant visibility、seat、team、phase、actor knowledge 和 revision 生成授权 observation。CharacterRun 只接收当前回合的不可变 view；原始 screenshot、live handle、secret 和未授权事件不进入 durable transcript、CharacterVersion 或 relationship memory。

Room/game event 只能产生带 source、visibility、sensitivity 和 owner revision 的 memory candidate。NarrativeSave/WorldSave 或 UserCharacterRelationship owner 决定是否接受；不同角色、room、save、branch 和 companion relationship 默认隔离。

### 12. 公共入口和迁移顺序

未来 producer 是 Chara 与 World/Game package-owned contract/application service，consumer 是 Agent adapter、Desktop Host adapter 和 Webview projection。Desktop Main 只保留 Electron/OS target authorization、session composition、typed IPC 和资源释放，不能拥有房间规则、角色调度或游戏完成判断。

实施顺序是：先建立 package-owned contract/codec 和失败测试，再实现 Chara room/application orchestration 与 Game Activity port，再接 Agent/Host adapter，最后增加 Desktop/Webview 产品入口和真实游戏资格验证。现有 CharacterDialogueSession/EmbodyCharacterSession 保持单角色 canonical path，不增加 compatibility fallback；新 room route 在完整 composition 前保持 unavailable。

本设计不修改现有用户数据。未来持久格式必须使用新 versioned room/game contract；当前 `NpcTranscriptArtifact` 不迁移为多人房间记录。

## Risks / Trade-offs

- [多角色模型成本和延迟随参与者数量增长] → coordinator 只调度 eligible participant，限制每轮回复数，inactive participant 不接收完整视觉 observation。
- [多个 Agent 产生冲突动作或发言] → provisional intent 与 expected revision 提交，公共 timeline 和 per-seat action 串行化。
- [角色看到不应知道的密聊或隐藏游戏信息] → observation 由 Room/Game owner 先做硬过滤，并携带 owner revision 与 visibility receipt。
- [代打误操作、焦点漂移或用户争夺输入] → 精确 target binding、exclusive lease、用户输入检测、有限 step budget 和始终可见的 Take over。
- [模型切换破坏角色一致性] → 当前 turn 冻结精确模型；配置变更只影响后续 turn 并记录 revision/model receipt。
- [实时动作游戏的感知和控制延迟超出预算] → VLA/本地 control policy 承担短时闭环，LLM 只在低频决策边界参与；无法满足延迟时保持 coach/assisted。
- [新游戏规则、UI 或动作空间与既有经验不一致] → profile/version/fingerprint 失配使经验失效，先在安全 checkpoint 重新校准，不复用陈旧 action demonstration。
- [快速学习被实现为不可审计的在线权重更新] → v1 只允许检索、in-context demonstration、episode memory 和可删除的派生 playbook，不修改基础模型权重。
- [四种预设被实现成四套 controller] → contract tests 断言共享 participant/timeline/AgentSession/Activity path，variant 只改变合法组合与 owner policy。

## Migration Plan

1. 先合入本 OpenSpec 和稳定架构文档，所有运行路线保持 unavailable。
2. 后续变更建立 versioned participant、room event、model role、Context Materializer、GameCapabilityProfile、episode experience、ActivitySession 和 control lease contract，并明确拒绝旧单角色 artifact 作为多人格式。
3. 先用结构化回合制 fixture 验证 LLM planner 与快速适应，再用低延迟动作 fixture 验证 VLA action chunk，最后接入多人 seat/visibility；依次接入 Chara、World/Game、Agent、Desktop Host 与 Webview。
4. 使用合成游戏 fixture、真实 Electron 和逐平台 qualified target 验证后才暴露对应 Play-use capability。

若取消该方向，删除未实现的新 contract/route 和文档即可；由于本变更不迁移或写入用户数据，不需要数据回滚。

## Open Questions

- 首个 Game Activity owner 是未来 `neko-world` 的一个 application surface，还是在出现第二类游戏消费者后拆成独立一级 Game package？
- 首个真实纵向用例选择具备官方结构化 API/遥测的游戏，还是选择一个仅支持 qualified visible UI 的离线 fixture 游戏？
- 多角色 Play-use v1 是否只允许一个可写席位，还是同时支持多个已验证的独立 controller seat？
- 视觉观察由 primary multimodal model 直接消费，还是在首个 adapter 中使用独立 `image.understand` snapshot，需要结合目标游戏延迟评估决定。
- 首个 VLA provider/runtime 的 observation、action-chunk、latency、cancellation 和 deterministic replay contract 如何落入现有 flat purpose model policy？
- Game experience/playbook v1 保存到用户级 SQLite 还是 workspace/game-profile scope，需要在首个跨 session 用例中确定 owner 与删除语义。
