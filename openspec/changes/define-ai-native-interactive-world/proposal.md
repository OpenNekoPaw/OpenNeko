## Why

OpenNeko 当前只把 `@neko/world` 记录为拟议 owner，并在 Character Play-use 设计中混合了互动世界、外部游戏、VLA 和 Computer Use 语义，尚未定义用户能够真正进入、互动、存档和分支的 AI-native 世界作品。传统作品只在创作期使用 AI、发布后无需推理；Neko World 则发布一套必须由 AI 在消费期实时执行的世界生成规范，因此需要独立的创作、实时运行、状态和表现契约，避免用聊天记录、Renderer 状态、游戏引擎或异步媒体生成代替互动世界。

## What Changes

- 将 `neko-world` 定位为组合 Story、World、Character 与 User 的 AI-native 互动世界，而不是游戏引擎、3D Runtime、线性叙事生成器或多角色聊天包装。
- 明确产品边界：非实时 AI 创作结果属于 Content、Canvas、Cut、Generation 等传统作品；WorldExperience 启动和继续必须依赖通过资格验证的实时 AI 能力，不能提供无 AI 的确定性消费模式。
- 定义可变 `WorldProject`、不可变 `WorldVersion`、语义 `SceneDefinition`、`StoryScenarioDefinition`、`WorldCharacterBinding`、`InteractionDefinition` 与 `WorldRule`。
- 定义 `WorldExperienceVersion` 作为面向用户发布的不可变、AI 可执行的世界生成规范；它锁定 World、Story、Character、交互、入口、表现档案、非空实时 AI capability requirements 与依赖 digest，而不是预渲染的最终内容。
- 定义故事、图片、视频、声音、角色卡和其他素材为 World authoring evidence、runtime grounding 与表现 reference；运行时只物化当前 WorldView 所需的经审阅知识和授权资源，不把原始素材、检索摘要或生成媒体升级为世界事实。
- 定义 `WorldExperienceRun`、participant/controller/stance、`WorldActionIntent`、`WorldEvent`、revisioned `WorldState` 和 participant-scoped `WorldView` 的唯一运行路径。
- 定义 `WorldSave`、branch、checkpoint、event replay 和版本兼容边界；存档与用户关系状态不进入发布包或 CharacterVersion。
- 定义 AI 为不可信 proposal producer：Intent Interpreter、Character Agent、World Director、Rule Evaluator、Narrator 和生成式表现能力只能消费显式授权视图并提交 typed candidate，只有 World owner 可以校验和提交事件。
- 定义实时消费契约：用户输入可立即确认、AI 响应可流式产生、交互可打断/取消、状态与表现持续更新，所有必需模型和表现 provider 必须在启动前通过作品声明的延迟与连续性资格。
- 定义文字流、2D 场景组合、角色表现、流式语音和环境音为首个实时体验；异步图片/视频生成只能发生在传统 authoring/Generation 流程并作为发布素材进入 World，只有通过实时资格的 image/video/spatial provider 才能成为 World presentation profile。
- 定义 Desktop Home 中的轻量 World Library、作品详情、继续/新体验、入口/身份选择、存档分支和 capability diagnostic；不建立传统 Game Hub。
- **BREAKING**：后续 World 实现不得采用现有 Character Play-use 设计中的 Game/VLA/seat control 作为 `@neko/world` 核心职责；这些能力若继续推进，必须由独立 Activity/Host 边界拥有。

## Capabilities

### New Capabilities

- `interactive-world-authoring`: WorldProject、WorldVersion、Scene、Story Scenario、Character binding、Interaction 和 Rule 的创作、校验与发布前语义。
- `interactive-world-experience-publication`: 面向用户的 WorldExperienceVersion、入口、表现档案、AI capability requirements、不可变依赖和发布/实例化边界。
- `interactive-world-runtime`: participant、stance、Run、Intent、Event、State、WorldView、AI role 和 commit authority 的运行契约。
- `interactive-world-realtime-generation`: 消费期必需 AI、实时能力声明、启动资格、流式响应、打断/取消、延迟违约和非实时 Generation 隔离。
- `interactive-world-persistence`: WorldSave、event log、checkpoint、branch、replay、恢复和版本兼容语义。
- `interactive-world-product-surface`: World Library、作品详情、启动配置、体验投影、表现设置与 unavailable diagnostic。

### Modified Capabilities

无。

## Impact

- Owning responsibility：未来 `@neko/world` 拥有 World authoring、Experience composition、运行状态、事件、存档、分支和 participant-scoped observation；`@neko/chara` 继续拥有 CharacterVersion、角色策略与 CharacterRun；Agent runtime 继续拥有唯一 AgentSession；Entity、Assets、Content 和表现 runtime 继续拥有各自身份、资源与执行。
- Package roles：目标首先建立 host-neutral World contracts/domain/application/testing 闭包；出现独立 Node 持久化和 Webview 依赖闭包后再按 package taxonomy 拆为 `@neko/world-domain`、`@neko/world-node`、`@neko/world-webview`，不得预先创建空包。
- Desktop：`apps/neko-desktop` 只负责 World public port wiring、sender-bound IPC、窗口/View 生命周期、Host 授权、World Library composition 和真实 Electron 验收，不拥有 World 规则、状态机、存档事务或 AI 编排。
- Data：新增 versioned WorldProject、WorldVersion、WorldExperienceVersion 和 WorldSave 格式；项目事实进入 workspace `neko/` 下 owning-domain 文件，用户级 SQLite 只保存 catalog、恢复索引和可重建 projection。
- AI：复用现有 Pi/AgentSession、Tool Call、purpose-model binding、流式 event、Approval、打断和取消；不建立 World-specific Agent runtime。每个作品必须声明非空、provider-neutral 的实时 AI contract，Host 只允许通过资格的 binding 启动 Run。
- Presentation：复用 ContentLocator、Entity/Asset representation、共享 UI、Preview/Media 与实时表现 public contracts；Renderer/Webview 只消费 WorldView 和短生命周期表现 descriptor。普通 GenerationJob 只服务 World authoring 和传统作品输出，不进入实时 World Run 的成功路径。
- Related design：需要在实施前协调 `define-character-chatroom-play-use`，将外部游戏、VLA、seat lease 与 Computer Use 从 World core 的目标职责中移出；当前 Desktop World surface 继续保持 unavailable。
