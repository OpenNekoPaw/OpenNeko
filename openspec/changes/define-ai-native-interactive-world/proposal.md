> Current-production clarification (2026-08-12): completion of this design change does not promote World
> Story, Gameplay or Experience into the first production closure. Their availability is governed by
> [`simplify-resource-entity-character-world-boundaries`](../simplify-resource-entity-character-world-boundaries/)
> and requires real producer, consumer, persistence and UI evidence.

## Why

OpenNeko 已有 `@neko/world` / `@neko/world-node` Foundation，能够表达 `WorldProject -> WorldVersion -> WorldRun -> WorldSave/branch` 的最小事实链，但尚未把用户的创作意图以及剧本、角色、场景、素材和玩法说明编译成可审核、可发布、可运行并可在运行中继续改造的互动世界。现有设计还没有把 Content-to-Experience 编译、能力缺口诊断、持续世界改造与 World Story、World Gameplay、Experience composition 的独立生命周期讲清楚，容易继续要求作者围绕代码或某个引擎实现具体体验，或让 Agent、Renderer、游戏引擎和世界模型成为第二事实来源。

路线图仍将 Interactive World 定义为实验方向，并要求真实用户、重复行为和真实闭环证据后才能晋级。当前 Foundation/transformation 实现只有 package 与隔离 UI 证据，不满足晋级条件；它必须保留为实验原型，生产 Desktop World 入口则恢复为 fail-visible unavailable。

## What Changes

### 当前交付切片：World Foundation

本轮只启用现有 World Foundation 的完整用户路径：用户可以创建和编辑 `WorldProject`，审核并发布不可变 `WorldVersion`，从精确版本创建确定性预览 `WorldRun` / `WorldSave`，提交 Foundation 事实事件，并检查、分支、切换和回放已提交历史。该表面必须明确标记为“基础预览”，只用于验证世界定义、状态、事件、存档和分支，不得命名或投影为完整 `WorldExperience`。

本轮不创建 `WorldStoryProject`、`WorldGameplayDefinition`、`WorldExperienceProject` 或任何消费期 AI 路径；不接入 Character Runtime、Agent Play、游戏引擎、World Model、实时图像/视频或其他表现 profile。完整 World Experience 继续保持 owner-qualified unavailable，直到本变更后续任务中的独立 Story、Experience、实时 AI 资格和表现 producer/consumer 全部完成。

本变更不再承担完整 World 产品的长期实施。Foundation/transformation 之后的工作拆分到五个独立 follow-up changes；每个 change 在自身边界内设计、实现和验收，且任何工程切片完成都不能替代路线图晋级证据。

- 将 `neko-world` 定位为顶层产品能力族，内部包含 World Definition、World Story、World Gameplay、World Experience、World Runtime 与 World Presentation；这些能力通过精确 contract 组合，但不得压进一个万能聚合、服务或 UI store。
- 将 Content-to-Experience 设为 World 创作主路径：用户创作意图和 Text/Screenplay、Character、Canvas、Cut、Assets、Generation 等 owner 的 durable 内容先产生 owner-qualified World、Story、Character binding、Scene、Quest、Gameplay、Interaction 与 Presentation 候选，再经过能力解析、语义 diff、作者接受和发布形成可运行 Experience；原始工具产物和检索摘要不得直接成为 World 事实。
- 将世界创作和世界运行分离：创作侧管理定义、故事、玩法、场景、互动与发布组合；运行侧绑定精确发布版本，管理角色、用户、世界、故事和可选玩法共同互动产生的独立 Run、Save、Branch、Session 与 View。
- 明确产品边界：生成媒体和创作工具文档继续归其 Content/Canvas/Cut/Generation owner；经作者接受的结构化世界、故事、任务、玩法与互动语义归对应 World 子能力。WorldExperience 只要求其发布版本声明的 required capabilities 可用，不强制消费期 AI、Web、游戏引擎、World Model 或自定义代码成为所有作品的共同依赖。
- 定义可变 `WorldProject`、不可变 `WorldVersion`、语义 `SceneDefinition`、`WorldActorBinding`、`InteractionDefinition` 与 `WorldRule`。WorldActorBinding 只能引用精确不可变 CharacterVersion；World Studio 不创建或编辑 CharacterProject/CharacterVersion。
- 定义独立的 `WorldStoryProject -> WorldStoryVersion -> WorldStoryRun`，拥有世界级前提、冲突、章节、beat opportunity、结局与发展进度；Chara 独立拥有 `CharacterStorylineVersion -> CharacterStorylineRun`，两条故事线可以关联但不能共用可变进度记录。
- 定义可选的 `WorldGameplayDefinition -> WorldGameSession`，拥有 World 内创作玩法的席位、动作空间、局内状态、规则、胜负和结果验证；Agent Play 只负责理解、规划、行动 proposal 与经授权控制，不拥有玩法事实。外部游戏继续由外部 Activity/Game authority 拥有。
- 定义 `WorldExperienceProject` / `WorldExperienceVersion` 作为创作期组合与发布产物，锁定 World、World Story、Character/Character Story、可选 World Gameplay、交互、入口、required/optional capability requirements、执行/表现档案与依赖 digest，而不是复制各 owner 的定义或预渲染最终内容。
- 定义故事、图片、视频、声音、角色卡和其他素材为 World authoring evidence、runtime grounding 与表现 reference；运行时只物化当前 WorldView 所需的经审阅知识和授权资源，不把原始素材、检索摘要或生成媒体升级为世界事实。
- 定义 `WorldExperienceRun` 为运行期组合与参与绑定：它关联精确 `WorldRun`、`WorldStoryRun`、`CharacterRun` / `CharacterStorylineRun`、用户 participant，以及可选 `WorldGameSession` 和表现绑定，但不接管这些运行实例的事实或生命周期。
- 定义 participant/controller/stance、`WorldActionIntent`、`WorldEvent`、revisioned `WorldState` 和 participant-scoped `WorldView` 的唯一世界事实路径；World Story 与 World Gameplay 分别校验和提交自己的进度与局内状态，跨 owner 影响通过 typed candidate/event 协作。
- 定义 `WorldSave`、branch、checkpoint、event replay 和精确不可变 Experience baseline；存档与用户关系状态不进入发布包或 CharacterVersion，升级必须是保留原 Save 的显式用户业务操作，不引入兼容读取或内部格式迁移。
- 定义 AI 为不可信 proposal producer：authoring compiler、Intent Interpreter、Character Agent、World Director、Rule Evaluator、Narrator 和生成式表现能力只能消费显式授权输入并提交 typed candidate，只有对应 domain owner 可以接受语义或提交事件。
- 定义运行中持续改造：用户的新想法先被分类为 World state、World structure、Story/Quest、Gameplay/Interaction 或 Presentation 变化，形成精确 change candidate、capability gap 与语义 diff；合法的当前运行变化提交为 owner-qualified event，结构性创作结果可显式提升为新的用户管理版本，旧 Run/Save/branch 不得被静默重定向。
- 为作品实际声明为 required 的实时 AI 或表现能力定义消费契约：用户输入确认、流式响应、打断/取消、状态与表现更新以及延迟违约；未声明对应能力的确定性或内容编译型 Experience 不得被 Host 强制绑定模型或 Provider。
- 定义文字/对话、Web/2D、Game Engine、generative World Model、Voice 和其他界面为显式选择的 interaction/execution/presentation profile；作品只需至少一个可消费 WorldView 并提交 typed intent 的 Interaction Surface，它们都消费同一语义 contract，不拥有或替换 World、Story、Gameplay 与 Character 的 authoritative facts。
- 定义 Desktop Home 中的轻量 World Library、作品详情、继续/新体验、入口/身份选择、存档分支和 capability diagnostic；World Gameplay 是作品能力而非默认 Game Hub 信息架构。
- 将 World Studio 与 World Runtime 建模为独立于 Character Studio/Runtime 的场景。角色与世界只在运行时通过 `WorldActorBinding -> WorldActorInstance -> CharacterRun` 组合；Character detail 只显示 World-owned 摘要和精确跳转。
- 将 World 内创作并随 WorldExperience 发布的玩法归入 World Gameplay 子能力，同时保持独立 aggregate/runtime owner；外部游戏仍由外部 Activity/Game owner 管理。两类玩法都通过同一 Agent Play 能力参与，World/Chara/Renderer 均不得吸收控制策略或玩法状态。
- **BREAKING**：后续 World 实现不得把 Agent Play、VLA、Computer Use 或 seat control policy 作为 `@neko/world` 事实职责；World Gameplay 只拥有作品内玩法定义、Session、规则与验证，宿主输入和智能控制继续由 Agent/Host 的独立边界拥有。

## Capabilities

### New Capabilities

- `interactive-world-authoring`: WorldProject、WorldVersion、Scene、Character binding、Interaction 和 Rule 的创作、校验与发布前语义，以及与 Canvas/Cut/Text/Assets/Generation/Preview 的工具边界。
- `interactive-world-transformation`: 运行中创作意图的分类、owner-qualified change candidate、能力缺口、语义 diff、事件提交、分支隔离与显式版本提升。
- `interactive-world-story`: World Story 的创作版本、运行进度、与 Character Story 的组合和独立生命周期。
- `interactive-world-gameplay`: World 内创作玩法的定义、席位、动作空间、Session、状态、胜负与验证，以及与 Agent Play、外部 Game authority 的边界。
- `interactive-world-experience-publication`: 面向用户的 WorldExperienceVersion、入口、表现档案、AI capability requirements、不可变依赖和发布/实例化边界。
- `interactive-world-runtime`: participant、stance、Run、Intent、Event、State、WorldView、AI role 和 commit authority 的运行契约。
- `interactive-world-realtime-generation`: 作品可选声明的消费期 AI/生成表现能力、启动资格、流式响应、打断/取消、延迟违约和非实时 Generation 隔离。
- `interactive-world-persistence`: WorldSave、event log、checkpoint、branch、replay、恢复和版本兼容语义。
- `interactive-world-product-surface`: World Library、作品详情、启动配置、体验投影、表现设置与 unavailable diagnostic。

### Modified Capabilities

无。

## Impact

- Owning responsibility：World 是产品能力族而不是单一 aggregate。World Definition/Runtime 拥有世界事实、事件、Save、Branch 和 WorldView；World Story 拥有世界级剧情定义与进度；World Gameplay 拥有作品内玩法定义、Session、规则与结果；World Experience 只拥有创作组合、发布产物和运行绑定。`@neko/chara` 独立拥有 CharacterProject/Version、Character Story、角色策略与 CharacterRun；Agent 拥有 Play 规划/控制和唯一 AgentSession；外部 Activity/Game、Entity、Assets、Content 与表现 runtime 继续拥有各自身份、资源与执行。
- Package roles：在现有 host-neutral `@neko/world` contracts/application/testing 与 `@neko/world-node` repository adapter 上扩展；World Story、World Gameplay 与 World Experience 先以独立 public subpath/aggregate 保持边界，只有出现真实独立依赖闭包时才按 package taxonomy 拆包，不得为能力清单预建空包。
- Desktop：`apps/neko-desktop` 只负责相互独立的 World Studio/Runtime scene、World public port wiring、sender-bound IPC、窗口/View 生命周期、Host 授权、World Library composition 和真实 Electron 验收，不拥有 World 规则、状态机、存档事务、Character authoring 或 AI 编排。
- Product qualification：生产 Host 在晋级前拒绝 `open-world-management`，旧持久化 World presentation 仅局部重置为 Agent Entry；World package、Foundation records 和 isolated fixtures 继续保留。
- Follow-up ownership：后续工作分别由 `define-world-topology-and-data-contracts`、`build-deterministic-world-experience-runtime`、`add-world-interaction-surface-and-desktop-loop`、`qualify-world-agent-and-realtime-capabilities`、`add-world-gameplay-and-agent-play-composition` 约束。
- Data：新增 revision-controlled WorldProject/WorldStoryProject/WorldExperienceProject、用户可管理的不可变 WorldVersion/WorldStoryVersion/WorldExperienceVersion，以及独立 WorldSave、WorldStoryRun 和 WorldGameSession canonical records；项目事实进入 workspace `neko/` 下 owning-domain 文件，用户级 SQLite 只保存 catalog、恢复索引和可重建 projection，不增加内部 schema/format generation。
- AI：复用现有 Pi/AgentSession、Tool Call、purpose-model binding、流式 event、Approval、打断和取消；不建立 World-specific Agent runtime。作品按能力逐项声明 required/optional AI contract，Host 只为 required AI 能力解析并验证精确 binding；没有消费期 AI requirement 的 Experience 仍可通过确定性或其他已满足的 Interaction/Execution capability 启动。
- Presentation：复用 ContentLocator、Entity/Asset representation、共享 UI、Preview/Media 与实时表现 public contracts；Renderer/Webview 只消费 WorldView 和短生命周期表现 descriptor。普通 GenerationJob 只服务 World authoring 和传统作品输出，不进入实时 World Run 的成功路径。
- Related design：`define-character-dialogue-chatroom-world-foundation` 已建立 Character Chatroom 使用的 WorldBook、WorldVersion、WorldRun、WorldEvent、WorldState、WorldView 与叙事 save/branch Foundation；本变更在同一事实链上扩展完整 AI-native World。Browser Use、Computer Use、Agent Play、外部游戏、VLA 与宿主 seat control 由各自独立边界拥有，当前 Desktop 完整 WorldExperience surface 在生产组合完成前保持 unavailable。
