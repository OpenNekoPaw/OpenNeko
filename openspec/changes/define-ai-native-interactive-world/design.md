## Context

`@neko/world` 当前不存在。稳定架构只声明 `WorldProject -> WorldVersion -> WorldRun -> WorldSave/Replay` 及 World 对世界事实、规则、事件、存档、分支和回放的 owner 责任；Desktop 明确把 World 保持为 unavailable。活跃变更 `define-character-chatroom-play-use` 进一步讨论多角色 Play、外部游戏、VLA、seat lease 与 Computer Use，但没有定义一个可发布、可进入、可持续互动的 World 作品，且其 Game Activity 假设不应成为 World core。

本设计把 Neko World 定位为 AI-native 互动世界：Story 提供主题、冲突和情节机会，World 提供共同事实、规则与状态，Character 提供稳定身份、知识与行为策略，User 以显式 stance 观察、参与、扮演或导演。与“AI 只辅助创作、用户消费时不再推理”的传统作品不同，WorldExperienceVersion 是一套由 AI 在消费期持续实时执行的约束式世界生成规范；World application service 仍是唯一状态和事件提交权威。

真实运行边界包括 World host-neutral domain/application、Chara、Entity、Content/Assets、唯一 Pi/AgentSession、Desktop Main/preload/renderer、Node 项目文件 adapter 和未来可选的生成式表现 provider。当前没有需要兼容的 World 用户数据或旧生产 route。

### 五层分析

| 层   | 结论                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | World 拥有互动世界定义、Experience composition、运行状态、事件、观察、存档与分支；Chara 拥有角色 canon/CharacterRun；Agent 拥有模型会话；表现 owner 只渲染 WorldView。       |
| 依赖 | World core 只依赖稳定 ref/domain value；application 通过窄 Chara、Agent、Content/Asset、AI capability 与 repository port 组合，不导入 Electron、React、Node 或具体模型 SDK。 |
| 接口 | public contract 分 authoring、publication、runtime、persistence 和 projection；所有 mutation 携带显式 project/version/run/branch/actor identity 与 expected revision。       |
| 扩展 | 新 Story 类型、AI role、表现方式或模型 provider 通过注册的 schema/policy/port 扩展；不通过游戏名称、Renderer 类型或 Provider 名称分支。                                      |
| 测试 | domain fixture 验证发布、状态转换、知识过滤、分支/回放和 AI 越界拒绝；Node fixture 验证项目文件；Desktop/Webview 接入后使用隔离工作区和真实 Electron。                       |

## Goals / Non-Goals

**Goals:**

- 建立 Story、World、Character、User 的组合模型与唯一事实所有权。
- 使创作者能够从内容/IP形成 WorldProject，发布 WorldVersion 和可安装 WorldExperienceVersion。
- 允许用户以明确 stance 进入世界，通过自然语言和声明式 affordance 与角色、场景和故事互动。
- 要求每个 WorldExperienceVersion 声明非空实时 AI contract，并只在当前 Host/model/presentation binding 通过启动资格后创建 Run。
- 使用 versioned Intent/Event/State/View contract 保证并发、知识、权限、存档、分支和回放正确性。
- 允许 AI-native 动态角色、导演、规则推演和多模态表现以实时流参与消费，同时保证模型输出不能越权提交事实或越过延迟边界迟到写入当前世界。
- 以流式文字、2D角色/场景组合、流式语音作为首个实时表现，并为未来通过资格的 image/video/spatial provider 保留窄边界。
- 保持 Desktop 为薄组合根，保持 World project facts 与本机 SQLite projection 分离。

**Non-Goals:**

- 不实现游戏引擎、ECS、物理、碰撞、导航、帧循环、键鼠/手柄控制或多人网络同步。
- 不实现外部游戏代打、VLA、seat control lease、Computer Use 或任意桌面控制。
- 不要求生成式视频/3D World Model 承担世界事实、存档或运行正确性。
- 不把无 AI 的确定性互动作品、预渲染分支作品或普通异步 GenerationJob 归类为 Neko World。
- 不允许图片、视频或其他耗时生成任务在 World Run 的关键路径中延迟完成后再替换当前世界；此类产出必须在传统 authoring/Generation 流程中完成并以发布素材进入 World。
- 不把 World 简化为线性视觉小说、聊天 transcript、Canvas Storyline、知识图谱浏览器或单次内容生成任务。
- 不建立 World-specific Agent runtime、模型选择器、Memory infrastructure、Asset catalog 或 Desktop manager bag。
- 不在本变更中选择具体 `.nk*` 扩展名、远端 marketplace 或云同步协议。

## Decisions

### 1. World 是互动世界 bounded context，不是游戏或表现 runtime

World core 保存语义事实、关系、时间/空间拓扑、规则、Story opportunity、交互定义和运行状态。Scene 是语义场景，能够被文字、2D、Live2D、音频或未来空间表现消费；相机、viewport、像素坐标、物理 handle 和 Renderer session 不进入 World facts。

未采用以 Game Engine 为中心的设计，因为当前产品价值是 AI-native 的开放互动、角色一致性、世界持续性和创作回流，而不是低延迟物理控制。未采用纯聊天设计，因为 transcript 无法拥有共同状态、知识可见性、分支和可审计后果。

### 2. 定义、运行状态和表现形成单向权威链

```text
WorldProject -> immutable WorldVersion
  -> WorldExperienceVersion -> WorldExperienceRun
  -> WorldActionIntent -> WorldEvent -> WorldState revision
  -> participant-scoped WorldView -> Presentation
```

Definition 是类型和初始约束，State 是某个 branch 中的实例，Presentation 是按参与者过滤的视图。Renderer 只能把输入转换成绑定当前 run/participant/revision 的 intent，不能直接写 WorldState。

### 3. WorldProject 引用 IP owner，不复制 Character 或 Entity 事实

`WorldProject` 拥有 `WorldDefinition`、`SceneDefinition`、`StoryScenarioDefinition`、`WorldCharacterBinding`、`InteractionDefinition`、`WorldRule` 和 presentation hints。角色本身由不可变 CharacterVersion 表达，地点/组织/物件/风格等稳定语义身份引用 Project Entity/Entity Asset；ContentLocator 与 Asset package 保存表现资源。

`WorldCharacterBinding` 只保存世界角色、初始位置、Scenario role、world-specific knowledge、参与策略和稳定版本 ref。运行中的位置、伤势、关系、秘密和目标属于 WorldSave，不回写 CharacterVersion。

### 4. Story 是方向与机会，WorldEvent 才是已经发生的事实

`StoryScenarioDefinition` 保存 premise、主题、tension、possible beat、trigger、clue、escalation、结局与 hard/soft constraint。Planned beat、AI建议和作者意图都不是 WorldEvent。World Director 可以提出符合当前状态的 story opportunity，但只有 World runtime 接受并提交后才成为 branch history。

原始小说、剧本和设定文档仍由 Content owner 保存；只有显式接受进 WorldProject 的互动 Story definition 成为 WorldVersion 的一部分。

### 5. WorldExperienceVersion 是用户成品，WorldVersion 是可复用底座

`WorldExperienceVersion` 是面向用户的 AI 可执行生成规范，而不是最终渲染内容。它冻结：

- 精确 WorldVersion；
- Story Scenario；
- CharacterVersion/Entity/Asset dependency；
- entry point 与 participant stance；
- interaction、director 与 narration policy；
- primary/optional presentation profile；
- 非空 required realtime AI capability、可选 realtime presentation capability 与对应 latency/stream/interruption qualification；
- schema、compatibility、integrity、provenance 和 license metadata。

发布时外部可变 project ref 必须变为不可变版本 ref、package member 或显式锁定 dependency；故事、图片、视频、声音、角色卡和其他素材只作为经审阅的 canon/constraint 来源、runtime grounding 或表现 reference，不作为固定播放顺序。Secret、模型凭据、本机路径和用户状态不得进入包。安装只注册不可变作品，不自动创建 WorldSave；启动时才创建 run/save。

### 6. Participant stance 与 controller identity 是显式运行事实

首版支持 `observer | participant | embodied-character | director`。Stance 在 Run 创建时绑定：

- observer 只读；
- participant 以用户世界身份提出行动；
- embodied-character 绑定一个允许用户控制的 WorldActorInstance，不再启动隐藏的角色 Agent；
- director 只能在作者允许的范围创建候选、分支或受控导演事件。

AI 不得从自然语言自行升级 stance。participant、controller、run、branch、actor identity 由 Host/application binding 提供，模型输出同名字段不具有授权效力。

### 7. World runtime 是唯一 commit authority

所有用户、角色、Director 与系统行为先成为 `WorldActionIntent`，携带 source identity、target、action kind、arguments、observation revision 和 expected state revision。World application service 严格 decode 后依次验证 identity、stance、visibility、registered action、precondition、rule、permission、revision 和 approval，成功时原子提交一个或多个有序 WorldEvent 和新 revision，失败时返回 typed rejection。

未知 action、陈旧 revision、缺失 identity、不可见 target 和未注册 resolver 均 fail-visible；不得把自由文本输出、聊天完成或空 effect 当作成功事件。

### 8. AI 只能消费授权 WorldView 并产生不可信 proposal

每个 AI role 使用独立 scope：

| Role                    | 输入                                                         | 允许输出                                                                |
| ----------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Intent Interpreter      | 用户输入、stance、当前 interaction schema 与用户 WorldView   | typed user intent candidate                                             |
| Character Agent         | CharacterVersion、角色 memory view、角色专属 WorldView       | utterance/action intent                                                 |
| World Director          | Scenario、允许的全局导演投影与 policy                        | participant scheduling、story/event candidate                           |
| Rule Evaluator          | 单个 action、相关规则和裁剪状态                              | resolution evidence/candidate                                           |
| Narrator                | 已提交事件和目标参与者 WorldView                             | 叙述表现                                                                |
| Generative Presentation | WorldView、presentation profile、经审阅 grounding 与授权资源 | 满足实时 contract 的流式 image/audio/video/spatial projection candidate |

Character utterance 只是 speech event，不会自动成为 WorldFact。Director proposal、Rule output、Narration 和生成媒体也不直接修改 State。Prompt injection、模型伪造身份或模型遗漏字段都被 strict codec、Host binding 和 owner validation 隔离。

### 9. 消费期必须依赖 AI capability，但不依赖具体模型或 Provider

每个 WorldExperienceVersion 必须声明非空 required realtime capability，至少覆盖 intent understanding、Character/world generation 和用户可消费的实时 narration/presentation。Host 解析用户配置并在 Run/turn boundary 冻结确切 provider/model/parameters receipt；credential 不进入 World package、prompt、日志或存档。不存在不调用 AI 即可继续生成新互动的 World 模式；无 AI 的固定分支或确定性互动作品属于传统作品。

缺失 required realtime capability 或当前 binding 未通过该作品的资格时，Experience 明确 unavailable。作者可以发布多个分别完整、实时且可启动的 presentation profile，用户在 Run 前显式选择；运行中不得静默切换模型、purpose、profile 或成功路径。Provider 不存在时 World package、save 和 committed replay 仍可读取，但不能启动或继续生成新的互动。

### 10. 实时 contract 是 World 的产品准入条件

World 的“实时”是持续会话式 soft real-time，而不是 Game Engine 帧循环。作品需要声明并由真实目标环境验证：输入确认预算、首个有效流式响应预算、连续输出/心跳要求、可打断和取消语义、状态提交 deadline、presentation 更新预算、最大并发角色/流，以及 latency miss 的失败行为。具体数值由实现阶段基于首个 qualified 本地/外部模型和目标硬件冻结，不能由 Provider manifest 自证。

Runtime 固定为：

```text
user input
  -> immediate bound acknowledgement
  -> streaming intent/Character/Director inference
  -> validated WorldEvent commit
  -> continuous WorldView/presentation stream
```

模型或表现 provider 超过当前 deadline、失去 stream、无法响应 interruption 或返回陈旧 revision 时，World 必须取消/拒绝对应 proposal，暂停受影响的实时能力并返回 diagnostic；迟到结果不得提交、不得替换当前 Scene，也不得通过异步 fallback 伪装实时成功。Retry/resume 只能重新绑定当前 revision 并遵守同一 profile。

普通 GenerationJob、离线图片生成、异步视频生成和高质量导出属于传统 authoring/output path。它们可以在发布前产生 grounding/reference asset，或在 WorldSave/Replay 之后导出传统作品，但不能成为 active World Run 的必需或增强成功路径。只有在真实持续测试中满足 latency、stream、cancellation、identity consistency 和 resource budget 的生成式 image/video/spatial provider，才能注册为 realtime presentation profile。

### 11. Save 使用版本基线、事件流和周期 checkpoint

`WorldSave` 绑定 base WorldExperienceVersion、run/branch identity、parent branch/checkpoint、ordered committed events、周期 checkpoint、current revision 和 participant/actor binding。事件流解释发生了什么，checkpoint 加速恢复；UI/search/summary projection 可重建，不是权威。

恢复固定为 `base version + compatible checkpoint + subsequent events -> WorldState`。Replay 读取已提交事件，不重新调用模型生成过去。模型 receipt 可以记录 purpose、binding revision、输入 world revision 和 proposal/event identity，但不保存 secret 或把隐藏模型 state 当作恢复依赖。

从旧 checkpoint 继续必须创建新 branch，不能改写历史。WorldExperienceVersion 更新不得静默迁移旧 save；兼容迁移需要显式 versioned migration 和用户可见 diagnostic。

### 12. 首个表现是实时文字流加 2D 多模态组合

首个 presentation profile 使用流式文字输入/叙述、已发布或实时组合的2D场景、角色立绘或未来 Live2D、流式语音/环境音、人物/世界/事件投影。互动入口可包含自然语言与由当前 affordance 投影的建议操作，但 UI action 仍转换为相同 intent contract，表现更新不得等待普通 GenerationJob。

预生成互动影像只能作为发布素材按已提交状态选择；新生成的非实时图片/视频不进入 active Run。生成式空间 World Model 只有通过实时资格时才能产生 WorldView projection，且仍不拥有世界事实。当前不建立 3D/Game runtime。每个作品声明一个或多个各自完整的实时 presentation profile，Host 不自行猜测或静默降级。

### 13. World Library 是 Desktop projection，不是 Game Hub 或事实 owner

Desktop Home 首先提供轻量 World Library：已安装/创作 WorldExperienceVersion、最近 Run、存档/分支、作品详情、capability status、继续/新体验。启动配置只包含 entry point、stance、可选 embodied character、save/branch 和作者允许的 presentation profile。

系统级模型、凭据、语言、隐私、无障碍和默认表现设置继续由 Desktop/owning settings service 管理；World Studio 拥有作者配置。普通用户设置不得直接修改 Story、Character policy、WorldRule 或 CharacterVersion。

### 14. Package 与 runtime 边界按真实依赖闭包演进

首个实现可以使用单一 host-neutral `@neko/world` package，以显式 `./contracts`、`./core`、`./application`、`./testing` subpath 隔离职责。若 L0 contract 被 Webview/其他 contracts 消费而 application 引入更重依赖，或 Node/Webview 形成独立构建闭包，再迁移为 `packages/world/domain|node|webview` 与 `@neko/world-domain|node|webview`，不得为了目录对称预建空包。

Canonical producer 是 World package public authoring/publication/runtime service；consumer 是 Chara/Agent adapter、Node repository、World Webview port 和 Desktop composition。Desktop 只保留 Electron sender/path/trust boundary、typed IPC、View/Window lifecycle、native dialog、public port wiring 与 disposal，因为这些逻辑真实依赖 Application 层；所有可脱离 Electron 的规则、事务、codec、projection 和恢复编排留在 World owning package。

World product entry 只有在 package owner 可用后才通过 `unify-agent-launch-and-domain-bindings` 的 typed World binding/context port 向 Agent 贡献 exact WorldExperienceVersion 或 WorldRun、participant、stance、branch 和 participant-scoped WorldView。Agent 只拥有 Draft/Conversation/Turn 与 AI role session，不得从文本或 active Scene 推断 World identity，也不得提交 WorldEvent/WorldState。World provider 未组合时，Agent Entry 和 Desktop 都必须保留 owner-qualified unavailable。

### 15. 项目事实、本地状态和表现资源保持分离

WorldProject 与 portable WorldSave 使用稳定的 owning-domain 文件结构；WorldVersion 和 WorldExperienceVersion 是用户可发布、选择和绑定的不可变业务版本身份。具体 workspace-relative canonical path 和扩展名由实现 OpenSpec 冻结。用户级 SQLite 只保存 installed catalog、recent run、恢复索引、attention 和可重建 Search projection。素材由 Generation/Content/Asset owner 在 authoring 时提供 durable ContentLocator，并在发布后作为 grounding/reference 被实时 Context Materializer裁剪使用；普通 Generation runtime、cache、opaque URL 和 runtime token 不进入 World Run 或 facts。

## Risks / Trade-offs

- [World 同时涉及 Story、Character、AI、状态和表现，容易形成万能 domain] → World 只拥有组合、共同状态、事件和 observation；IP、模型会话、媒体、资源与 Host 能力继续由各自 owner 提供窄 port。
- [开放自然语言导致任意状态变化] → AI 只产生 registered typed intent，未知 action 和未注册 resolver fail-visible。
- [角色泄露隐藏信息] → save owner 先按 branch/time/location/knowledge/visibility materialize immutable Character WorldView，模型永不接收未授权事实。
- [World Director 为推进故事强行改写世界] → Story beat 是 opportunity；Director 只能提交 candidate，World rules 和 revision commit 仍是权威。
- [不同模型产生不同结果，难以回放] → 保存 committed event 与 execution receipt，Replay 不重新调用模型。
- [外部模型和网络抖动破坏实时体验] → 发布包声明实时 contract，启动前做目标环境 qualification，运行中按 deadline/stream/cancel fail-visible，迟到结果永不写入当前 revision。
- [把等待图片或视频包装成实时互动] → 普通 GenerationJob 完全移出 World Run；只有通过持续实时资格的 provider 才可注册 presentation profile。
- [2D 产品外观被误解为视觉小说或聊天] → 产品和 contract 同时展示世界状态、自由行动、多人 observation、事件、save 和 branch，Story 不拥有线性执行权。
- [生成媒体被误当成世界事实] → presentation output 绑定 source WorldView/event revision，只能通过独立 authoring review 产生新 fact candidate。
- [作品更新破坏旧存档] → 发布包不可变，save 锁定 base version；迁移必须显式、可测试、可拒绝。
- [初期包拆分过度] → 从单一 host-neutral owner 与明确 subpath 开始，只按运行时/依赖闭包真实分裂。
- [外部游戏 Play-use 再次侵入 World core] → Game/VLA/Computer Use 由独立 Activity/Host OpenSpec 处理，architecture tests 禁止相应依赖进入 World core/application。

## Migration Plan

1. 先合入本 OpenSpec，不改变 Desktop unavailable 状态，不创建生产空包或用户数据。
2. 协调 `define-character-chatroom-play-use`，将 World core 描述收敛到 participant、observation、intent、event、state、save 与 branch；外部游戏/VLA/Computer Use 留在独立 Activity 方向。
3. 建立 World package-owned contract/codec、architecture tests 和合成 fixture，再实现 authoring/publication、runtime/state 和 persistence service。
4. 接入 CharacterVersion/CharacterRun、Entity/Asset/Content 与 AgentSession adapter，使用路径断言证明没有第二套 Agent 或 app-owned World workflow。
5. 实现文字+2D World Webview、Desktop World Library、typed IPC 和隔离 fixture workspace；完成真实 Electron 入口、reload、切换、关闭与资源释放验收后才将 surface 标为 ready。
6. 后续独立变更增加通过实时资格的 Voice/Live2D、image/video/spatial presentation provider；非实时动态 Generation 继续留在传统 authoring 和 Replay 导出路径。

取消本方向时可删除尚未进入生产组合的 World contracts/package和Desktop route。若已经产生 WorldProject、WorldExperienceVersion 或 WorldSave，必须保留读取/导出或提供显式迁移，不能按 cache 删除。

## Open Questions

- 首个持久格式采用单文件还是 project/package directory，以及 WorldProject、发布包和 Save 的具体扩展名。
- StoryScenarioDefinition 首版由 World owner 直接拥有，还是在出现第二个独立 Story authoring consumer 后提取 Story package。
- WorldExperienceVersion 的 dependency 是全部内嵌以保证离线可移植，还是允许锁定已安装 immutable Asset package；需与 Asset publication 格式共同确定。
- 首个 World Director 的触发、轮次预算、闲置角色调度和用户可控程度。
- 首个默认 2D presentation 对场景图、立绘、Live2D、Voice 的 required/optional 划分。
- 首个实时 contract 的输入确认、首响应、连续 stream、状态提交、表现更新、interrupt/cancel 和 latency-miss 预算，以及用于资格验证的目标硬件与 Provider 矩阵。
- portable WorldSave 是否属于作品目录内可同步文档，还是同时支持用户私有 save repository；隐私、分享和导出需要独立产品决策。
