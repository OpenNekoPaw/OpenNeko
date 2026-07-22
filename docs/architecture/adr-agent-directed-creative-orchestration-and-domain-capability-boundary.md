# ADR: Agent 驱动创作编排与影视动画领域能力边界

- 状态：Accepted
- 日期：2026-07-14
- 范围：`neko-agent`、Skill、Canvas、Cut、Assets/Entity、Preview、Content、Quality、Export、Engine 与媒体 Provider。
- 实施变更：[`../../openspec/changes/retire-idc-and-align-agent-creative-planning/`](../../openspec/changes/retire-idc-and-align-agent-creative-planning/)、[`../../openspec/changes/enable-agent-capability-aware-creative-orchestration/`](../../openspec/changes/enable-agent-capability-aware-creative-orchestration/)

## 实现状态（2026-07-15）

固定 IDC stage/run/persona、Plan card runtime、独立 `promptMode`、Plan-to-Apply 路径和 TUI Plan 执行菜单已从 canonical production path 删除。`executionMode: auto | ask | plan` 是唯一模式事实；`plan.md` 是普通 Markdown，TODO 是从 work item/Task 派生的可丢弃投影，执行继续走普通 Agent ReAct、当前 Tool resolution、Task、通用 ApprovalEngine、validation 和 owning output。Creator review 只表达用户审阅当前内容，不是未来 Tool 调用的授权令牌；缺失的漫画分格/OCR、角色参考、Animatic、Audio、Quality 或 Export 能力必须以 blocked/partial diagnostic 暴露，不得由 Agent runtime 伪造。

2026-07-15 的后续审计确认，仓库仍残留 `MediaProductionWorkflowRunState`、fixed-stage media orchestrator、Task-backed workflow state store/recovery 以及创作专用 `ApprovalBinding`/replan classifier。这些无生产调用方的 scaffold 与本 ADR 冲突，必须在预发布清理中删除；架构测试不得通过白名单继续允许旧成功路径。

当前剩余重点是完善中英文核心 Prompt 的自主执行纪律、生成 Prompt 的语言分离、参考图启发的新内容生成、多视图角色参考准备、真实生成结果复查、角色 revision 绑定以及后期/导出证据闭环。这些能力继续复用现有 Agent、Skill、Tool、Task、`neko/generated/` 和 owning domain，不新增 Provider 专用 Pipeline、Locale Workflow 或角色卡状态机。

极简内核审计进一步确认：Agent/Platform 只保留 memory、conversation、context、Plan Mode、Approval、Task、MCP、subagent、Skill、Tool、Provider adapter 与普通执行循环。creation profile/guidance、创作专用 summarizer、硬编码影视 Skill 路由、Storyboard validator、媒体 task/result projector 等即使不是 Workflow，也属于领域能力回流，必须删除、通用化或迁到 Skill、Tool、subagent/owning package。

本文补充 [`adr-agent-native-creation-capability-boundary.md`](adr-agent-native-creation-capability-boundary.md)、[`adr-agent-autonomous-filmmaking-creation-boundary.md`](adr-agent-autonomous-filmmaking-creation-boundary.md)、[`adr-agent-prompt-skill-validator-boundary.md`](adr-agent-prompt-skill-validator-boundary.md) 与 [`headless-project-authoring.md`](headless-project-authoring.md)。既有 ADR 已确定 Agent session/turn 是创作推理和下一步选择的唯一智能循环，Tool/Task/Approval/validation 与领域 owner 分别拥有确定性执行边界；本文进一步确定：影视化、动画化应复用这些原生能力，通过领域 Skill 和原子 Tool 补齐专业创作闭环，不再创造一套创作 Workflow runtime。

## 背景与真实缺口

Neko Agent 已经具备：

- 基础对话、内容分析、上下文查询和 Skill 激活；
- `Read`、`ReadDocument`、`ReadImage` 与工作区文件读写；
- 普通 Tool 发现、schema 注入、调用、校验和结果回传；
- 图片、视频和音频生成；
- `ResourceRef`、异步 Task、审批、diagnostic 和基础质量能力；
- 生成文件写入 `neko/generated/<kind>/`，并返回 digest、ResourceRef 和 lineage；
- Canvas、Cut 等部分 headless authoring 能力。

因此，缺口不是基础 Agent、文件读取、通用规划或新的操作入口，而是 Agent 尚不能稳定地自主完成影视化、动画化的专业判断和连续执行。例如，面对漫画到动画的请求，Agent 需要根据实际输入和已有素材决定是否分格、OCR、补全、上色、建立角色参考、制作分镜、选择镜头技术、生成或编辑镜头、制作 Animatic、配音混音、质量检查和导出，并在异步任务、能力不可用或质量失败后继续原对话中的下一步。

这个问题不能通过总结性方案解决，也不能通过对所有来源和目标都相同的固定流水线解决。

## 决策

### 0. Agent 与 Platform 是领域无关的极简内核

核心只负责通用智能和扩展机制：session/conversation、memory/context、Prompt 与 Plan Mode、Approval/Policy、Task、MCP、subagent、Skill lifecycle、Tool lifecycle、Provider adapter、模型调用和结果续作。它不拥有漫画、角色、分镜、镜头、动画技术、后期或交付语义。

创作方法由 Skill 提供；需要独立上下文、并行研究或专业角色时使用普通 subagent；真实分析、生成、编辑、项目 mutation、Quality 和 Export 由 owning Tool/capability 执行。核心不能为某个影视场景新增 CreativeAgent、MediaPlanner、creation profile/guidance、领域 summarizer、硬编码词表、领域 validator/projector 或专用状态。

通用 matcher、summarizer、validator 和 projector 只有在由注册元数据或注入 adapter 驱动、且不枚举任何领域对象和格式时才可保留。能力不足时修正扩展描述或 owning diagnostic，不在核心增加场景分支。

Agent core 也不拥有创作结果的目的地：不保存默认/活动 Canvas、会话 Board binding、Board index/scope resolver、delivery runtime、generated draft Group、活动 Cut 项目或 `.nkv` target state。核心只观察通用 Tool/Task/result、diagnostic 和 Approval 结果，并决定下一次普通 Tool 调用。生成文件的持久化由 generated-output owner 管理；Workspace Board 投影由 Canvas capability 管理；Cut mutation 由 Cut authoring capability 管理。Host composition 可以把 typed result 交给这些 owner，但不得把目的地状态回流成 Agent session 或 Agent core contract。

审批同样复用 Agent 原生 Tool approval 与 owning capability policy。Canvas 投影、Cut authoring、导出或高成本生成可以按真实副作用声明风险，但不新增创作专用审批状态、Board 审批 token 或 Delivery Runtime。

### 1. 现有 Agent ReAct 是唯一创作编排器

影视化和动画化复用现有 Agent session、turn、Tool call、task、approval 和 validation 链路：

```text
用户目标与文件
  -> Agent 读取和分析当前内容
  -> Agent 结合 Skill 判断下一步
  -> Agent 从当前可用 Tool 中选择原子能力
  -> 既有 runtime 校验、审批并执行
  -> Tool/Task 返回文件、ResourceRef、项目 revision 或 diagnostic
  -> Agent 在同一对话中观察结果并继续判断
  -> 产出用户可直接使用的文件或领域项目
```

Agent 可以采用、跳过、重排、重复、并行或回退创作步骤。下一步由模型结合用户目标、当前文件、Tool 结果和 diagnostic 决定；确定性边界继续负责 schema、权限、成本、revision、项目写入和质量校验。

不得新增或保留 `MediaProductionWorkflowRunState`、`WorkflowRuntime`、`WorkflowRun`、`WorkflowNode`、DAG scheduler、固定 stage executor/state store/recovery、Creative Observation Store、独立 Plan Manager 或平行 Creation 状态机。旧 fixed media workflow 即使当前无调用方也必须删除 public export 和实现，不能以兼容、测试白名单或“未来可能使用”为由保留。也不增加单独的“开始编排”按钮或编排页面：用户通过现有对话提出目标、补充信息、审批和继续下一步。

异步 Task 可以拥有单次执行所需的排队、轮询、取消、恢复和进度状态，但不拥有整个创作过程的阶段顺序或项目事实。

### 2. 能力感知优先复用现有 Tool 与上下文能力

Agent 已经能够获得注入的 Tool definition、description、input schema 和调用结果，也可以通过现有上下文查询能力了解 Skill 与 Tool 分类。影视动画编排首先应修正和补齐这些 canonical Tool/capability contribution，使 Agent 能理解：

- 该能力解决什么领域问题；
- 接受什么文件、ResourceRef 或项目输入；
- 产生文件、素材还是 `.nk*` 项目 mutation；
- 属于确定性、感知、生成式还是混合操作；
- 当前是否真实可执行，以及失败 diagnostic 和关键限制。

Capability registration 和 Tool registry 仍是能力存在与可执行 schema 的唯一事实来源。不得维护平行 `CreativeToolCatalog`、Provider-purpose allowlist、重复 support matrix 或另一套创作 Tool registry。

紧凑领域索引、purpose 查询或渐进 schema 投影不是 Agent 编排成立的前置架构。只有真实 Agent evaluation 证明现有 Tool 上下文过大、能力遗漏或技术误选，且不能通过改进 Tool schema、description、Skill 或既有 `GetContext` 解决时，才可以从同一 registry 派生只读、按需、可丢弃的能力视图。该视图只是上下文优化，不能拥有 executor、运行状态、Provider handle 或项目事实。

### 3. Skill 提供影视动画专业判断，Tool 提供原子执行

创作能力不是一个大 Skill，也不是“来源 × 目标”的 Skill 笛卡尔积。Skill 应按稳定专业方法保持少量、可组合，例如：

- 来源理解与影视改编；
- 角色、视觉设定、导演和分镜方法；
- 图片准备、图片编辑和单镜头生产；
- 逐帧、Puppet、2D/2.5D、3D 和生成视频等动画技术选择；
- Animatic、剪辑、声音、后期和质量审查。

“漫画到 TV 动画”“小说到电影”“插画到动态影像”由 Agent 根据来源、目标、现有素材和真实 Tool 能力组合上述方法，不复制成独立固定流程。

Skill 正文负责条件判断、创作语义、选择标准、交接条件、恢复策略和质量要求。具体工具名、参数表、轮询协议、Webview/路径协议和包内 authoring schema 留在机器可读 Tool/capability 边界。

Skill 方法仍可被 Agent 跳过、重排和重复，但不形成 checkpoint 状态或 Workflow DSL。Agent 可以在普通对话中解释理由，Evaluation 直接观察当前 Tool call/result 和文件证据；本能力不要求 `started`、`checkpoint`、`skipped`、`reordered`、`completed` observation。其他通用 Skill lifecycle 若暂时保留 telemetry，也不能参与执行、恢复、审批或完成判断。

### 4. Agent 先分析来源，再生成创作者可审批的文档

普通创作请求直接由 Agent 在对话中分析并调用 Tool。涉及内容改编、角色、视觉/声音方向、镜头策略、核心制作技术、成本或交付范围时，Agent 应先基于实际文档、图片、音视频、ResourceRef 或项目文件区分：

1. 从来源中观察到的事实；
2. Agent 基于证据作出的解释与置信度；
3. 需要创作者选择或批准的创作决策；
4. 批准后可以交给 Tool 执行的操作。

创作者审批的对象是具体内容和领域产物，而不是抽象的 Draft/Plan stage。按任务需要，可以生成或修订 treatment、角色/风格/配色参考、Storyboard、镜头设计、声音方向等 owning-domain 文档；已有有效文档应直接复用，不为满足固定过程而复制。`brief.md` 可以承载目标、来源证据、解释、候选方向、未决问题和审批摘要，但不是所有项目必需。

用户通过同一对话阅读、修改和批准这些文档；不增加 IDC、Plan 或编排按钮。Creator review 通过现有 ApprovalEngine 的通用 request/user-prompt 路径完成，Host 可以把当前文档 identity/digest 放入通用 request context 供展示和审计。Agent core 不定义创作专用 approval binding、scope DTO 或 replan taxonomy；每个真实高成本、外部、mutation、export 或 delivery Tool call 仍独立通过当前 Tool/owner policy 授权。

### 5. `plan.md` 是可选 living execution plan，TODO 只是进度投影

复杂、长周期、高成本或跨会话的创作可以生成 `plan.md`。它必须从已批准创作决策形成逐项可操作的工作单元，而不是只列“分析、分镜、生成、后期、导出”等总体阶段。每个适用工作单元至少包含：

- 页、格、场景、角色、镜头、音轨或项目等工作对象；
- 触发条件与可跳过条件；
- 当前文件、ResourceRef、角色参考或项目输入；
- 人类可读的能力意图与制作技术；
- 保留内容、尺寸、时长、连续性、风格和成本约束；
- 期望文件、素材或 `.nk*` 项目输出；
- 验收证据、失败分支、依赖和审批要求。

`plan.md` 是用户可编辑的普通 Markdown，可以持续记录进度、发现、决策和最终交付，但不是 executable state。它不得持久化 resolved executor、完整 Tool schema、Provider/Task handle、cache/Webview identity、Workflow node/transition 或隐藏 retry state。简单、低风险、输入明确的操作不创建计划文件。

TODO 复用现有 conversation/task progress surface，只投影少量近期 `pending`、`in_progress`、`completed` 或 `blocked` 工作，并保持每个执行任务至多一个 `in_progress`。TODO 修改不调用 Tool，`completed` 不证明文件或项目完成，删除或重建 TODO 不影响任何创作事实；大批镜头或项目进度继续由 Storyboard、Cut、generated files、Task result 和 owning project 管理。

用户批准并要求执行时，Agent 重新读取当前对话、`plan.md` 和实际文件，在当前 turn 发出普通 typed Tool call；不得把 Markdown 编译成 DAG，不得重放计划生成时捕获的 executor/schema，也不新增 Plan Manager、TodoManager、`CapabilityIntent` graph 或 Plan runtime。

若用户显式审阅一份高成本或高风险方案，该 creator-review decision 只证明用户看过当前内容；它不能替代后续 Tool 的成本、权限、mutation 或交付审批。普通对话计划、TODO 和分析文档不需要全局 revision 管理。

### 6. 文件和 owning project 是创作事实，不建立全局 current revision

“稳定产物”不定义为新的抽象存储。创作结果按现有文件和领域契约管理：

| 对象                                      | 身份与并发规则                                                                                 | 是否需要全局 current revision     |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------- |
| 来源文件、漫画、剧本、小说、PDF、插画     | `ResourceRef`、路径授权、fingerprint 或 content digest                                         | 否                                |
| `neko/generated/<kind>/` 生成文件         | 实际文件 + `ResourceRef` + content digest + lineage                                            | 否；新结果通常是新文件            |
| `.nk*` 可变领域项目                       | owning package 的 project revision/content digest；mutation 使用 `baseRevision` 或等价前置条件 | 仅该项目 mutation 需要            |
| QualityEvidence / preflight               | 绑定被检查文件 digest 或项目 revision                                                          | 按 owning Quality/Export 契约需要 |
| 已审阅的 `plan.md`                        | 普通文件 identity/digest 可进入通用 Approval context；不授权未来 Tool                          | 不形成项目 revision               |
| 对话、TODO、分析 Markdown、Skill 方法说明 | 临时上下文、说明或审阅记录                                                                     | 否                                |

生成结果是 generated-output owner 管理的可直接使用文件，不需要晋升成另一种 catalog identity。用户需要整理时可以显式复制到 Media Library；需要语义关联时直接绑定 Creative Entity representation。

Agent 不维护全局 current revision，也不递归扫描历史消息寻找“最新 revision”。普通文本优先使用 VS Code `TextDocument.version`、外部修改检测、文件 digest 或精确 patch 冲突；generated 输出使用 ResourceRef/digest/lineage。只有依赖先前 read、异步结果、审批或 resume 的 stale-risk project mutation 才由 owning runtime 在写入前校验其 owner-specific base revision/digest；新建项目和同步 live-document 原子操作不强制 Agent 提供 revision。

### 7. 领域能力拥有真实操作和项目权威

Agent 负责选择和组合，领域包负责执行：

| 领域                        | 主要职责与权威结果                                                                |
| --------------------------- | --------------------------------------------------------------------------------- |
| Content / Perception        | 文档解析、页/格/场景/对白证据、影视改编和叙事结构                                 |
| Assets / Entity / Character | 角色身份、关系、正式资源、外观/服装/配色/声音参考                                 |
| Canvas / Storyboard         | scene、shot、分镜表、参考关系和分镜项目                                           |
| Image capability / Provider | 图片准备、确定性处理和生成式编辑；当前没有独立 Sketch 项目 owner                  |
| Preview                     | 授权只读的模型/3D 参考预览与 staging evidence；不拥有 Model/Scene 编辑项目        |
| Media Provider              | 图片、视频、语音和音乐模型执行，不拥有项目事实                                    |
| Cut                         | Animatic、clip/track、剪辑、字幕、效果和 final timeline                           |
| Cut / Engine media audio    | 对白、拟音、音乐、混音与音频媒体处理；当前没有独立 Audio 项目 owner               |
| Engine                      | 媒体分析、解码、编码、渲染、导出和本地计算；不提供 Scene/Puppet/Live 产品 runtime |
| Quality / Export            | 对当前文件或项目的质量证据、preflight、导出和交付验证                             |

领域包通过共享 contract、Tool contribution、ResourceRef 和项目 authoring result 协作，不直接导入另一个功能包的内部实现。需要多个低级 mutation 才能保证一致性的操作，由 owning package 提供小型事务性 headless Tool，并返回 exact project revision；Agent 不直接拼装 `.nk*` 私有格式，也不依赖 active Webview 猜测目标。当前 Agent change 只消费已经存在的 owning Tool/result/diagnostic，缺失能力必须进入对应 owning-package OpenSpec，不能以 Agent facade、orchestrator 或共享 workflow DTO 补齐。

### 8. 漫画、剧本、小说和插画到动画是动态纵向路径

系统需要支持以下可执行纵向能力，但它们是 Agent 可条件选择的里程碑，不是固定 stage：

```text
读取来源
  -> 页/格/场景/角色/对白分析
  -> 必要的分格、OCR、裁切、补全、上色或分层
  -> 改编稿、角色/风格参考和分镜表
  -> 按镜头选择实际制作技术并生成或编辑镜头
  -> Animatic / Cut / Audio / 字幕 / 后期
  -> 当前结果的质量检查与修复
  -> 导出可直接使用的成品文件
```

Agent 必须根据已有产物跳过不需要的步骤。例如已有可用分镜时直接进入镜头制作；黑白目标不自动上色；适合 Puppet 或分层动画的插画不默认改走视频生成；用户只要求 Animatic 时不生成最终镜头。

漫画切分、补全、上色和角色管理都在编排范围内：

- 分格、阅读顺序和 OCR 提供结构证据；
- 裁切、尺寸、旋转、mask 和像素合成应使用确定性操作；
- 人物/背景分割、pose、depth、lineart 等属于感知操作；
- inpaint、outpaint、遮挡补全、上色和重绘属于生成式操作；
- 文字移除后背景补全、人物分层后局部生成等是多个显式 Tool call 的混合策略。

图片编辑领域契约不得直接依赖生成图片模型。几何、像素和图层操作不得为了统一入口而调用生成模型；需要创造缺失像素或改变内容语义时才选择生成式 adapter，并保留 source、mask、未修改区域、ResourceRef 和 lineage。

角色身份与正式参考由 Entity/Asset/Character owner 管理。镜头引用适用的角色和外观版本；角色参考改变后，相关项目或质量检查是否需要重做由 owning dependency/validator 契约判断，Agent 不保存第二份角色状态。

### 9. Agent 按镜头选择真实制作技术

Agent 不得把“动画化”默认等同于生成视频。它应比较当前实际注册并可执行的技术：

- 文/图生视频和首尾关键帧视频；
- Puppet/Live2D；
- 逐帧动画；
- 2D 分层与 2.5D；
- 3D scene/camera/actor；
- compositing/VFX；
- 上述方式的镜头级混合。

选择依据包括来源类型、动作和运镜、时长、角色与场景连续性、成本、Provider 限制、用户目标和质量要求。Provider 不支持尾帧、参考视频、时长、运镜或其他控制项时必须在 dispatch 前返回明确 diagnostic；Agent 再换 Provider、准备兼容输入、选择另一技术或请求用户调整范围，不能静默丢字段后声称成功。

### 10. 异步结果必须回到原对话并驱动下一步

媒体 Task 完成后应：

1. 返回实际生成文件、ResourceRef、digest、lineage 和结构化 diagnostic；
2. 唤醒发起任务的原 conversation/session；
3. 由该 Agent 进入普通 ReAct 下一轮，读取当前需要的文件或项目事实；
4. 继续创作、修复、询问用户或交付结果。

该路径不得依赖 active Webview、当前选中的对话或额外“继续”按钮，也不能只输出任务完成总结。Task result、trace 和 observation 是结果通知与评估证据，不是新的 Workflow 状态。

### 11. 完成由直接交付物和 owning validator 证明

系统不建立中央 target-completion evaluator。Agent 根据用户目标检查实际输出，并复用 owning domain 已有的 validator、Quality 和 Export 契约：

- 生成图片、视频、音频或中间素材：交付实际文件及其 ResourceRef/digest；
- Storyboard 或 Animatic：交付对应 Markdown/领域项目及 owning validation 结果；
- 可继续编辑的项目：交付 `.nk*` 文件和当前 project revision；
- 最终动画/TV/电影交付：交付最终媒体文件，并在已有能力支持时附带当前 timeline/audio、preflight、export lineage 和验证结果。

聊天总结、TODO、prompt-chain checkpoint 或 trace 不能代替实际文件。若缺少完成目标所需的领域 Tool，Agent 必须明确报告缺口和当前可交付的最小结果，不得在 Agent runtime 中伪造领域项目或声称成品完成。

### 12. IDC staged-creation 过程删除，不再作为可选 profile

固定 `Draft -> Plan -> Apply`、`IdcStage`、stage planner/registry/tracker/guardian、stage persona 自动切换、IDC run identity 和把 Draft/ExecutionPlan/Task 当作必经执行状态的路径均应删除。即使作为“可选 profile”保留，它仍会要求 Agent、Skill lifecycle、Approval、Task、UI 和 artifact 同时兼容两套事实来源，因此不再保留成功执行语义。

`auto`、`ask`、`plan` execution modes 保留：Plan Mode 负责只读分析和审阅前计划，通用 ApprovalEngine/Tool policy 负责当前请求的用户决定与副作用授权，领域 Skill 负责专业方法，普通 Agent ReAct 负责下一步判断和执行。通用 Approval、preferences、logging、autoheal、validation、document IO、Task 和异步续作必须从 `stageTracking` 解耦，不能随 IDC 删除而丢失；创作专用 `ApprovalBinding` 和 deterministic replan classifier 则应删除。

旧 runtime-only IDC run/stage/persona/checkpoint state 可以在预发布清理中拒绝、丢弃或重建并返回明确 diagnostic；用户 Markdown、Skill 文件、生成素材、`.nk*` 项目、设置和 trust state 必须保留。

### 13. 核心 Prompt 与生成 Prompt 必须分离语言职责

影视化、动画化的国际化至少包含四个不同责任：

| 语言责任       | 含义与权威                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `uiLocale`     | UI、菜单、状态和用户可见诊断，由 Host 展示设置拥有                                                          |
| `promptLocale` | System Prompt、Skill content 和 model-facing Tool description 的指导语言                                    |
| 创作者内容语言 | treatment、剧本、Storyboard、对白、字幕、角色说明和目标市场语言，由用户目标与来源决定                       |
| 单次生成语义   | Provider 执行指令语言，以及独立的画面文字、对白、歌词、字幕和专有名词约束，由当前 capability 与目标共同决定 |

中英文核心 Prompt 和 builtin Skill 必须保持同一套观察、行动、结果验证、审批、恢复和 fail-visible 语义，但不要求逐字翻译。`promptLocale` 不得覆盖创作者内容语言；Provider 偏好英文执行指令时，也不得翻译或丢弃需要原样保留的中文角色名、地名、对白、字幕或画面文字。

Host 必须显式声明支持的 Prompt/Skill locale；当前 builtin 基线为 `en` 与 `zh-cn`。未来增加繁体中文等语言时应提供独立本地化内容和真实路径验证，不得将所有 `zh-*` 静默映射为 `zh-cn` 后宣称支持完整中文国际化。

生成 Provider 对指令语言、目标内容语言和嵌入文字的支持或限制属于 owning capability truth。若当前模型不能可靠满足目标语言或精确文字，应在 dispatch 前返回 degraded/unavailable diagnostic，或显式改用字幕、确定性文字合成等已批准的后期策略。不得通过静默翻译、删词或假定 Provider 支持来返回成功。

第一版不增加全局 locale store、Prompt 翻译 Workflow 或持久 generation-language plan。Agent 从当前目标、创作者文档和 Provider 能力为每次调用派生执行指令语言；实际执行请求、受保护字符串、参考输入和输出 lineage 在 owning task/result contract 需要时记录。

### 14. 参考图 Remix 与多视图角色卡属于领域方法和真实模型能力

参考图 Remix 的稳定创作语义是：读取授权参考图，识别用户希望保留的形式/构图、风格/色彩/质感和氛围/光影/叙事特征，明确需要替换的新内容，再选择当前真实可用的图片能力生成和复查实际结果。“形/韵/意”等框架可以作为 Skill 方法，但来源模型视觉指纹、Provider 工具映射、固定 Phase、默认多模型批次、私有 `.image-remix` 目录和万能降级不得进入 canonical Skill。

Agent 不根据猜测的原图生成模型选择 executor。Provider/model 选择只依据当前 capability registration、参考输入支持、质量、成本、权限和 diagnostics；文生图也不能被表述为零版权风险。生成后 Agent 必须读取实际图片，对保留特征、新内容、禁止项和技术要求进行检查，再决定接受、局部修复、换策略或阻塞。

多视图角色设定卡是角色视觉参考准备的一种能力用途。当前模型明确支持单张多视图时，Agent 可以一次生成正面、侧面、背面、近景、服装、道具或动作视图；拆分生成只在实际结果缺视图、裁脚、身份/服装/配色/道具漂移或出现禁用文字时作为修复策略，不固化为必经流程。

`character-visual-reference` 可以作为聚焦 Skill 候选，但不是模型支持多视图后的必然新增 builtin。只有真实 Agent evaluation 证明它相对现有 `image` 和 `media-production` 显著改善触发、角色身份不变量、结果复查或下游绑定，且不会造成 Skill 冲突和上下文浪费时才接受。生成角色卡首先是 `generated/` 中可直接使用的文件；需要正式实体绑定、跨镜头 revision 依赖或跨项目复用时，再由 Entity/Asset/Character owner 审批并登记。

### 15. 创作语义不绑定模型，执行支持绑定当前有效模型

Agent 编排必须区分三类事实：

| 层级               | 典型内容                                                                                                                                        | 权威来源                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 模型无关创作语义   | 主体、角色身份不变量、镜头/布局、参考用途、内容语言、精确文字、禁止项和验收条件                                                                 | 用户目标、领域文档、Skill 方法                                       |
| 模型绑定执行支持   | 输入模态/数量/格式、参考控制、多视图/跨图/嵌入文字可靠性、Prompt 方言、尺寸/时长、成本、并发、安全和 support/limits                             | owning Provider/model/version/profile capability 与当前 session 配置 |
| 实际执行与完成证据 | requested/effective model identity、实际请求或 digest、输入参考、Task terminal result、输出 ResourceRef/lineage、diagnostic 和 Quality evidence | Task/result、生成文件与 owning validator                             |

例如，“角色卡需要正面、侧面、背面并保持服装一致”不绑定模型；“当前模型能否一次生成这些视图”绑定当前 Provider/model/version/profile；“本次角色卡是否完成”只由实际文件和视图/一致性检查证明。参考图的 identity、appearance、costume、prop、style、composition、structure-only、first-frame、last-frame 和 product-preservation 等语义角色不绑定模型，但 adapter 是否接受、怎样传递和能否遵守这些角色属于模型绑定事实。

Capability registration/contribution 和 session effective configuration 是执行支持的唯一事实来源。Agent、Skill 和共享层不得维护手写全局模型能力表；营销描述、模型名称推断、社区样例、历史成功输出或旧 Prompt 不能把 unknown/degraded 支持提升为 supported。Provider、model、version、profile、权限或配置改变后，Agent 必须在当前 turn 重新 resolve/validate，并使旧支持假设、Prompt 方言和相关审批前提失效。

### 16. Prompt 示例库只作为可选参考或 Evaluation 语料

社区 Prompt 图库可以展示复杂布局、多视图、多分镜、精确文字、参考图转换和模板变量，但它不是 Agent Skill、Provider capability、执行 catalog 或质量权威。缺少精确 model/version/profile、输入参考、实际请求 digest、参数、失败样本、输出绑定和验证证据的成功图片，只能作为创作灵感或研究样本，不能注册成可靠支持。

默认不把大型 Prompt 语料注入 System Prompt、builtin Skill 或 Tool context。需要时可以通过现有 External Research 或其他明确授权的来源按需读取少量、带作者/来源/许可的样例，或者作为隔离 Evaluation fixture；检索结果只能帮助形成当前 capability-neutral intent，不能选择 executor、启动 Task、解除 Approval/Quality Gate 或证明完成。

第三方模板占位符可以映射为现有 Semantic Prompt Document 的人类可编辑字段，但不能成为 Neko 执行协议。如果未来产品化 Prompt-example retrieval，必须先用 holdout ablation 证明质量收益，并验证没有 Tool 误选、上下文成本失控、provenance 丢失或 fallback；否则保持研究和 Evaluation 用途。

## 实施重点

本 ADR 下的实施优先级是：

1. 收敛 Agent/Platform 为领域无关内核，删除或迁出 creation profile/guidance、创作 summarizer、硬编码领域路由、Storyboard validator 和媒体专用投影；
2. 删除 fixed MediaProduction Workflow shared DTO、Agent stage orchestrator/state store/recovery/public exports/tests，并取消 legacy 测试白名单；
3. 删除 Agent core 的创作专用 Approval binding/replan classifier，保留并验证通用 ApprovalEngine、Tool policy 和用户提示路径；
4. 把 Plan Mode 保持为领域无关、只读但具体的原生模式，`brief.md`/`plan.md` 只是普通 Markdown 约定；
5. 复用现有 conversation/task surface 提供轻量 TODO 投影和 Task 结果续作，不创建新的进度或恢复 owner；
6. 改造影视动画 Skill，使其指导来源证据分析、条件判断、技术选择、执行工作单元、跳过/重排和恢复，而不是固定步骤或总结模板；
7. 只修正真实 Agent evaluation 暴露的现有 Tool description/schema/result 缺口，领域 authoring/Quality/Export 缺口转入 owning-package OpenSpec；
8. 补齐中英文核心 Prompt/Skill、参考图 Remix、多视图角色卡和生成语言约束，并用真实 Agent evaluation 证明 canonical Tool/Task/Approval 路径不依赖旧 Workflow；
9. 仅把带 provenance 的 Prompt 样例作为按需研究或 Evaluation 语料，只有实证需要时才优化现有 Tool context，不新增 Prompt Manager 或 planning runtime。

## 禁止路径

- 禁止建立漫画到动画、小说到电影等固定隐藏 Pipeline 或 Workflow DAG。
- 禁止在 Agent/Platform core 加入 creation profile/guidance、创作 summarizer、影视关键词路由、Storyboard/media validator/projector、CreativeAgent、MediaPlanner 或其他领域专用分支。
- 禁止用“通用能力”命名包装实际枚举漫画、角色、分镜、镜头、动画、后期或交付语义的核心服务；这些能力必须通过 Skill、Tool、subagent 或 owning package 扩展。
- 禁止新增或保留与现有 Agent 平行的 IDC/stage、fixed MediaProduction Workflow、创作 runtime、Plan Manager、TodoManager、Observation Store 或操作入口。
- 禁止在 Agent core 定义创作专用 Approval binding、creative scope schema、replan taxonomy、PlanApprovalStore 或把 creator review 当成未来 Tool 授权。
- 禁止把每种“来源 × 目标”组合复制成独立大 Skill。
- 禁止维护平行 Tool catalog、support matrix 或 Provider-purpose allowlist。
- 禁止让 Skill、Agent、IDC、Markdown 或 Webview 成为剧本、角色、分镜、timeline 或导出状态的第二事实来源。
- 禁止把所有图片编辑统一等同于图片生成，把所有动画统一等同于视频生成。
- 禁止用旧 adapter、active editor fallback、未知 Provider 能力、静默字段丢弃或默认空结果伪装成功。
- 禁止用 prompt-chain、聊天总结、TODO、trace 或任务状态声明实际文件或项目已经完成。
- 禁止为普通生成文件增加全局 current revision、稳定 Artifact 晋升或资产入库前置要求。
- 禁止让 Plan Mode、Markdown 或 TODO 变成执行 DSL/状态机，或让批准过的旧 schema/executor 被直接重放。
- 禁止把 `uiLocale` 或 `promptLocale` 当作创作者内容、对白、字幕、画面文字或专有名词的唯一语言事实。
- 禁止在 Skill 正文中硬编码 Provider 工具名、Prompt 方言表、来源模型指纹到 executor 的映射、固定 Remix Phase、私有输出目录或万能 fallback。
- 禁止仅因 Provider 声称支持多视图就认为角色卡合格；必须读取实际结果并检查视图完整性与跨视图一致性。
- 禁止在 Agent、Skill 或共享规划层维护全局模型能力表，或用营销文案、社区样例、历史成功结果和模型名称推断当前 support。
- 禁止把 Prompt 示例库、动态模板占位符或检索结果变成 executor selector、Tool catalog、执行 DSL、运行状态或完成证据。

## 影响与风险

### 正面影响

- 复用现有 Agent、Tool、Task、ResourceRef 和文件系统能力，避免重新实现一套创作平台。
- 创作路径可以根据真实内容和结果动态变化，同时保持领域写入、revision 和质量边界确定。
- 用户通过同一对话完成分析、审批、修正和继续，不需要理解 Workflow 概念。
- 新增创作技术只需提供正确的 Skill 判断或 owning Tool，即可参与 Agent 组合。

### 代价与风险

- Agent 自主选择存在模型不稳定性，必须用真实 Agent evaluation 验证，而不能只验证总结文本。
- 当前部分 Tool 只有 UI 写回或最终仍调用通用生成模型，不能据此宣称存在独立 production capability。
- 漫画到完整动画成品仍依赖多个 owning package 补齐原子能力；Agent 编排不能替代缺失的分格、角色、Animatic、Audio、Quality 或 Export 实现。
- 若现有 Tool 上下文无法让模型可靠选择技术，可能需要增加从同一 registry 派生的紧凑查询；该决定必须由 token 测量和 Agent evaluation 驱动。
- 中英文 Prompt/Skill 可能发生行为语义漂移，生成指令翻译也可能破坏目标语言或专有名词；需要跨语言真实路径 evaluation，而不是只做字符串存在测试。
- 参考图 Remix 的来源模型判断缺乏可靠权威，角色多视图输出也存在身份和构图随机性；两者必须依赖当前 capability 与实际结果复查，不能由 Prompt 自报成功。
- 领域创作意图若绑定某个模型参数结构，会在模型/profile 切换时失效；需要保持 intent capability-neutral，并由当前 adapter 投影执行请求。
- 大型社区 Prompt 语料可能污染上下文、携带不可验证声明或许可风险；默认不导入，只使用带 provenance 的小规模研究/Evaluation 样本。

## 验证要求

相关实现必须同时验证结果和 canonical 执行路径：

1. Agent 使用现有 session/turn 和 Tool lifecycle 连续执行，不命中 IDC run/stage/persona、Workflow run/node/transition 或固定 stage 路径；
2. Skill 提供创作判断但不包含工具协议，prompt-chain observation 不解除任何 validator 或 Quality Gate；
3. 漫画分格、OCR、裁切等确定性/感知步骤不调用通用图片生成，生成式编辑保留 source/mask/lineage；
4. 插画或漫画镜头只在当前注册的图片、视频、Canvas、Cut 与 Preview 能力间选择，并对未提供的骨骼动画、分层绘画或 3D 场景编辑返回 unavailable/degraded diagnostic；
5. 异步 Task 完成后唤醒原对话，Agent 根据结构化结果继续，而不依赖 active Webview 或只输出总结；
6. 生成结果实际存在于 `neko/generated/<kind>/` 并返回 ResourceRef/digest，用户无需先晋升资产即可使用；
7. `.nk*` mutation 使用 owning revision/baseRevision，普通来源和生成文件不被强制套用全局 current revision；
8. Plan Mode 可以读取真实内容并生成可操作工作单元，但不创建媒体 Task、项目 mutation、导出、IDC 或 persona；
9. Markdown 计划和 TODO 更新不触发副作用、不证明完成，用户要求执行时仍走当前 Tool resolve、validation、approval 和 runtime；
10. 漫画/剧本/小说/插画到 Storyboard、Animatic、样片或成品的真实 Agent/provider evaluation 产生创作者审批文档、具体 work units、实际文件并记录关键 diagnostic 与恢复行为；
11. legacy IDC/stage/persona、Workflow、平行 catalog、Observation Store 和 active-editor fallback 在聚焦测试中被 poison，命中即失败。
12. 英文 `promptLocale` + 中文内容、中文 `promptLocale` + 英文目标市场，以及 Provider 英文指令 + 中文受保护字符串都走等价 canonical 路径，且不发生静默翻译或内容语言漂移；
13. 参考图 Remix 从实际参考证据和当前 capability 生成真实文件，生成后由 Agent 复查，且不使用来源模型指纹路由或通用 fallback；
14. 多视图角色卡在 Provider 支持时可以单次生成，但完成必须由实际视图覆盖、全身裁切、身份/服装/配色/道具一致性和禁用文字检查证明；独立角色视觉参考 Skill 需要额外 activation/quality ablation。
15. Provider/model/version/profile 改变后，模型无关创作目标保持稳定，但旧支持快照、Prompt 方言和审批前提失效；执行和报告记录 requested/effective model identity；
16. identity/style/composition/first-frame/last-frame 等参考角色保留在 intent 与 lineage 中，adapter 不支持时 dispatch 前失败；
17. Prompt 示例 fixture 保留来源、许可、语言和 digest，已知约束不匹配样本必须由实际结果 validator 识别；外部样例检索没有 holdout 收益时不得进入 runtime。
18. 移除全部创作核心特化后，conversation、memory/context、Plan Mode、Approval、Task、MCP、subagent、Skill 和 Tool lifecycle 仍独立可用；影视任务只因 owning Skill/Tool 缺失而 fail-visible。

## 后续实施

IDC 清理、Plan Mode、创作者审批文档、creative execution plan 和 TODO 投影由 [`retire-idc-and-align-agent-creative-planning`](../../openspec/changes/retire-idc-and-align-agent-creative-planning/) 实施。Agent 自主编排、Skill 收敛、Tool 结果与异步续作由 [`enable-agent-capability-aware-creative-orchestration`](../../openspec/changes/enable-agent-capability-aware-creative-orchestration/) 实施；后者依赖前者提供的无 IDC canonical path。审计确认缺失的漫画理解、角色/Style/Color 参考、分镜、Animatic、多镜头依赖、音频后期和最终导出能力，应由对应 owning package 的 OpenSpec 承接；不得把这些领域实现堆入 Agent runtime。
