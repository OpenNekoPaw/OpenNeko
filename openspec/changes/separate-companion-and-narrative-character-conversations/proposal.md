## Why

当前 Chara 将 `companion | narrative` 只作为运行标签，却让 Narrative 依赖外部 Composition、在运行时创建和推进 `CharacterStorylineRun`，同时把角色主观记忆绑定一次性 CharacterRun；这与已经收敛的产品语义冲突，也使故事线创作、日常长期记忆、叙事会话上下文和 Agent transcript 的 owner 模糊。现在需要在 Character 产品晋级前原子冻结两种会话模式，删除运行时故事线事实路径，并建立可验证的上下文、记忆和 Workbench 边界。

## What Changes

- **BREAKING**：将 Character Conversation 明确定义为 `companion` 日常模式或 `narrative` 叙事模式，模式在创建时冻结，现有会话不得原地切换或重解释。
- **BREAKING**：删除正式运行链中的 `CharacterStorylineRun`、运行时 Storyline observation/transition/revision、`CharacterRun.characterStorylineRunId` 及 Character memory 对 StorylineRun 的绑定；故事线只在 Character authoring 中编辑、审核和发布。
- **BREAKING**：新增稳定 `CharacterStoryline` identity、可变 draft、不可变用户管理的 `CharacterStorylineVersion` 和版本内 `StorylineNode`；运行时只消费精确 Storyline/Version/Node 引用，不写回故事线。
- **BREAKING**：移除 Narrative Character launch 对 Experience、World、Save、branch 或其他外部 Composition authority 的依赖。Narrative 是独立 Character Conversation，不创建外部记录，也不因 provider 缺失回退到日常模式。
- 日常模式只提供唯一 Character 对话通道，不提供“原生模型对话”选择。Character 作为 Neko Agent 的领域绑定与上下文 provider，复用同一 Agent Conversation、Turn、provider/model、Skill、Tool、Approval、权限和 transcript 链；日常角色可以在该参与者的标准 Agent 配置与授权策略下调用 Agent Skill/Tool，作为具有稳定身份的助手使用，不再开发 Character 专用模型执行路径。
- 日常角色通道通过稳定 companion continuity 读取已接受的 CharacterMemory 与 UserCharacterRelationship，并只把新对话或外部资料结果提交为带来源的候选；完整 transcript 继续由 AgentSession 唯一保存。
- 叙事模式冻结精确 CharacterVersion 与可选 StorylineVersion/Node，只注入该节点作者发布的情境、允许/禁止故事事实、叙事记忆、关系状态和知识边界；不得读取或写入日常长期记忆，不允许外部资料注入，并强制将该角色参与者的有效 Agent Skill/Tool 集合收敛为空。
- provider/model、Skill/Tool activation 与权限是每个 CharacterRun/Room participant 对应 Agent Conversation/Turn 的配置并由 Agent 冻结 receipt；Character Workbench 的角色/参与者管理器通过 Agent 公共配置端口管理精确参与者，并投影其结果。不同角色可以选择不同 provider/model，不使用所有 Character 会话共享的全局模型；叙事参与者只允许配置 provider/model 等无工具执行参数。切换模型不创建 CharacterVersion，修改角色设定必须发布新的 CharacterVersion。
- 删除已经出现的 `CharacterCompanionAssistantLane` 及 Character 专用 AgentWorkspace/turn 路由；外部资料使用 Agent 标准 reference/grant/context 路径，Chara 只提供模式验证、角色上下文和显式记忆/authoring candidate 操作。
- Workspace-bound Agent 可以发现并调用 Chara 提供的精确角色能力，用于基于 CharacterProject/Version 的角色使用、authoring preview 或角色验证；调用不得把 Workspace Conversation 静默改绑为 Character Conversation。自动验证由 Agent-owned Character role primitive ports 组合窄 Chara public operations，不把现有 testing runtime 提升为生产入口：角色响应者无 Skill/Tool，独立 Probe Agent 负责提问与评估，报告保存在项目内，任何角色事实修改仍需用户确认。
- 为 Character/Room Workbench 增加只读 Storyline Timeline、当前节点背景和多角色节点投影。用户可查看或基于另一节点新建会话，但 Timeline 不表达运行进度，也不触发节点推进。
- 将当前固定 Avatar Main 收敛为精确 owner-qualified Character Presentation Surface 组合点，允许 Avatar、Web、动态场景或 Gameplay 等 owning provider 的授权只读/运行投影；Chara 不吸收外部表现、Web 或 Gameplay 事实。
- 保持 Character 产品入口的 P0 promotion gate；本变更的包内实现、fixture 或 mock 证据不得自动开放生产 Character/Room 路径。

## Capabilities

### New Capabilities

- `character-conversation-modes`: Companion/Narrative 创建、模式冻结、统一 Neko Agent 执行、模式限定的 Agent 能力、精确参与者配置 receipt、Workspace 调用 Chara primitives、外部资料边界、单角色/Room 参与者隔离和无双路径启动语义。
- `character-companion-memory-continuity`: 日常跨会话角色主观记忆与用户关系记忆的稳定 owner、候选审核、版本来源和 Narrative 隔离。
- `character-storyline-authoring-context`: CharacterStoryline identity、draft/version/node、节点叙事上下文、精确选择和运行时只读消费。
- `character-interaction-context-workbench`: Character/Room 对话、owner-qualified Main、上下文管理、多角色投影和只读 Storyline/Room timelines 的 Workbench 组合。

### Modified Capabilities

- `desktop-creative-workbench-layout`: Character Interaction Scene 从固定 Avatar Main/Runtime summary 组合调整为精确 Presentation Main、Narrative Context Manager 与只读 Timeline 组合，同时保持 slot、Root 和 runtime 驻留边界。

## Impact

- Owning responsibility：`@neko/chara` 继续唯一拥有 CharacterProject/Version、CharacterStoryline authoring/version/node、companion continuity、Character/relationship memory、CharacterRun、Dialogue/Room、角色上下文投影和 Chara capability 的领域操作；`@neko/agent-runtime` 唯一拥有 Assistant/Workspace/Character Conversation、Turn、transcript、compaction、Skill、Tool、Approval、权限和每参与者 provider/model 配置/执行；外部资料 bytes 与授权由 Workspace/Content/Assets/Host owner 保持，外部 Presentation/Game/Web provider 保持各自事实和 runtime。
- Package roles：修改 `packages/chara` canonical contracts/application 与供 Agent capability 组合的 Character Dialogue/validation primitives、`packages/chara-node` 本地持久化 adapter、`packages/chara-webview` browser-only authoring/runtime surfaces、`packages/agent/contracts|runtime|webview` 的统一 Conversation/domain-binding/context/Skill/Tool/配置路径，以及 `packages/host` 的 Desktop Scene/Workbench public contract。
- Desktop role：`apps/neko-desktop` 只保留 sender-bound typed IPC、Window/Scene 生命周期、授权外部资料与 Presentation resource adapter、Chara/Agent public port wiring 和可见 Workbench composition；模式规则、记忆策略、故事线选择和上下文裁剪不得留在应用组合根。
- Replaced paths：现有 Narrative `external-composition-unavailable` 启动拒绝、runtime StorylineRun/transition/CAS、CharacterMemoryScope-to-StorylineRun binding、独立 Companion Assistant lane、`CharacterPrimaryAgentSessionAdapter` 直连 AgentWorkspace、Desktop Character/Room provider special branch、固定 `character-avatar` Main 要求和 Runtime Manager StorylineRun 统计被原子替换，不保留兼容 alias、dual read/write、fallback 或 test-only direct path。
- User data：现有 CharacterProject/Version、Conversation transcript、RelationshipMemory、CharacterMemory 和资源引用必须保留。旧 StorylineRun/observation/transition 记录不得静默转换为新故事线事实或长期记忆；owning catalog 保留其可见 diagnostic，并提供显式离线导出/清理或作者重建入口。已有 Conversation 继续绑定原精确身份，不得自动改为新模式、升级 StorylineVersion 或注入新的日常记忆。
- Dependencies：本变更是 `define-character-dialogue-chatroom-world-foundation` 的破坏性后续收敛，并与 `unify-domain-authoring-workspaces`、`unify-agent-launch-and-domain-bindings`、Desktop Workbench 和 Agent Evaluation artifacts 重叠；实施前必须先消除相互矛盾的 active requirements 和任务声明。
- Scope boundary：本变更复用普通 CharacterProject/CharacterVersion 表达最小角色设定，不实现“提示词/素材自动生成角色”。该 authoring convenience 需要后续独立 OpenSpec 与 authoring-only `character-creation` Skill；Skill 不进入正式角色对话运行时。
