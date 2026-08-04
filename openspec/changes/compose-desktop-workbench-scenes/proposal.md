## Why

Desktop 当前把 Home、项目工作区、管理入口和 Settings 实现为不同的顶层页面结构。Home 拥有独立 Agent composer 和侧栏布局，项目才挂载完整的 package-owned Agent 与受控 Workbench，Settings 又切换到另一套顶层 Surface。这造成 Agent 能力分叉、PrimarySidebar 多实例、resize/显隐状态耦合，以及从入口跳转页面而不是在统一工作台内切换和组装能力的问题。

产品需要取消 Home 与工作区的顶层区别：一个窗口始终只有一个一级侧栏和一个 Workbench，一级侧栏选择场景，场景把 owner-qualified Surface 组装进固定 slots。统一的是 Workbench 组件、视觉和 slot 语义，不是固定显示相同数量的栏位。入口 Agent 必须直接复用完整工作区 Agent，按显式 assistant 或目录 workspace scope 提供模型、命令、Skill、文件引用、执行/审批和语音等同一能力面。资源中心与扩展中心的管理 Root 必须占据 Main，详情或授权 Preview 只能作为按选择出现的 Secondary Main。

当前入口仍在创建时隐式绑定 AssistantSpace，并复用稳定 Scene/View identity；从已有会话点击“开始创作”时，package-owned controller 也可能保留旧 Tab、transcript 和输入状态。这不满足“每次开始创作都是新的未会话入口”。此外 Asset Center renderer runtime 的 effect cleanup 与实例 dispose 混在一起，React StrictMode 的开发期 remount 会复用已 dispose 实例并让整个 Desktop 白屏。两者都属于 instance identity 与资源所有权契约缺失，不能通过 active Project、默认 Assistant 或 no-op dispose 兜底。

## What Changes

- 建立唯一的窗口级 `ApplicationPrimarySidebar` 与 `ControlledWorkbenchShell`；Agent、目录工作区、资源中心、扩展/Skill、项目管理和 Settings 都是同一个 Workbench 内的 scene，不再存在 Home/Project/Settings 顶层页面分支。
- PrimarySidebar 保留应用导航、最近项目、最近 Agent 会话和底部状态/设置；删除 Home 页面不得删除这些窗口级导航投影。
- 定义 closed、versioned、slot-specific Workbench scene projection。Scene authority 只投影 owner-qualified Surface identity；Desktop renderer 只将公开 Roots 放入 Interaction、Main、Secondary Main、Manager、Timeline 和 Status slots。
- 定义可变形 Workbench：默认 draft 只显示 Agent；Assistant 激活后显示 Agent + Preview Main；Workspace 显示 Agent + creative Main + Workspace Resources；未来角色扮演/聊天室显示 Agent 对话或群聊 + Interactive Main + Character Manager。缺少真实 Character/Interactive owner 时必须 owner-qualified unavailable，不在 Desktop 伪造实现。
- 以现有 `AgentWebviewRoot` 作为入口、assistant session 和 workspace session 的唯一 Agent UI/controller/composer。未创建会话时只隐藏 session-only chrome，不复制 textarea、模型选择、命令、Skill、附件、审批或语音控件。
- “开始创作”改为创建带全新 `draftId` 的 `unbound` Entry Draft；它没有 conversation、AssistantSpace、Workspace 或角色 owner。用户直接输入并提交时自动绑定 Assistant 用户区并创建精确 session；选择目录/Project 时绑定 Workspace，选择未来 Character/Room 时绑定对应角色 owner。
- Agent Webview 以 `draftId` 作为 presentation instance identity；进入新 draft 时必须清除旧 conversation Tabs、active conversation、transcript、输入引用和瞬态错误，同时保留全局模型目录与用户设置。
- 将 Agent 的 presentation phase 与 authority scope 分离：draft/session 决定会话 chrome，`assistant | workspace` 决定可用目录、资源、Tool、Skill 和 scene composition。
- Assistant scope 使用 OpenNeko 管理的用户资源投影、用户显式授权文件和 conversation-scoped scratch；它不得获得整个用户 Home、配置、凭据、插件安装根或任意本地路径。
- 用户显式选择目录时由 Desktop Main 授权并返回 opaque directory grant；Host/Agent authority 建立精确 Workspace identity并激活原有 Agent + Canvas/Preview/Cut + Workspace Resources composition。选择目录不自动创建 conversation。
- Scene 或权限 scope 只由入口动作、已持久化 conversation context 和 owner capability facts 决定：未选择 owner 的普通直接提交确定性使用 Assistant，目录/Project 选择使用 Workspace，角色选择使用对应角色 owner。模型文本不得发明目录/Project identity 或扩大权限；需要 workspace 能力但尚未选择目录时返回明确的选择要求。
- 资源中心建立 Assets-owned `AssetCenterSession`，由同一 session 的 Management Root 在 Main 管理 catalog/filter/selection，并把选中资源通过授权 descriptor 投影给可选 Secondary Preview Root；Desktop 不拥有 Asset selection、资源事实或 preview 类型判断。
- 资产、项目与扩展的 Management 和 Preview/Detail 必须呈现为两个视觉、DOM 与 overflow 边界独立的共享 panel shell；两个 shell 各自拥有边框、圆角、背景并由带间距的 resize composition 连接，不能只在同一连续 Main 底板上画分隔线。
- 扩展/Skill、项目管理和 Settings 也通过明确 Surface slots 组合；缺失真实 owner/public Root 时显示 owner-qualified unavailable，而不是在 Desktop 复制临时业务实现。
- Conversation 创建本地原子提交 context、conversation、initial message 和 durable pending-turn intent；外部 provider turn 以 request identity 幂等启动和恢复，不宣称与本地事务原子。
- **BREAKING**：删除 `HomeStartCreating`、Home 独立 Agent composer、`agentInitialInput` handoff、Home/Project/Settings 顶层分支、场景级 sidebar frame、默认首个/最近/active Project fallback，以及模型意图决定可执行场景的路径；不保留成功 fallback。
- PrimarySidebar 将“最近会话”定义为恢复精确 interactive session，将“最近打开”定义为打开 Project/Character/Room 容器并进入新的 owner-bound draft；不得把容器选择当作旧会话恢复，也不得把内部角色 AgentSession 作为 Room 最近项暴露。
- Renderer view-scoped runtime 的 effect 只拥有 subscription；runtime instance 只在 identity 被替换或组件真正卸载时 dispose。StrictMode remount、renderer reload 和生产构建都必须保持可启动，并以真实 Electron exception/DOM 证据验收。
- 本变更定义 Character/Chatroom 的 Workbench 形态，但不实现尚不存在的 Character Manager、Interactive Main、World authoring/experience owner；未具备 owner/runtime/Surface 的显式导航请求返回 unavailable，active conversation 不允许原地 rebind。

## Capabilities

### New Capabilities

- `desktop-workbench-scene-composition`: 定义统一 Desktop Workbench、窗口级 PrimarySidebar、slot-specific scene composition、完整 Agent 的 assistant/workspace scope、显式目录授权、Assistant 用户区与 scratch，以及 Assets management + preview 资源中心。

### Modified Capabilities

<!-- None. Conflicting active changes are reconciled before implementation and are not stable baseline specs. -->

## Impact

- `@neko/host` 拥有 host-neutral、versioned window/scene/sidebar projection、scene transition CAS、精确 Window/View/Workspace/session identity，以及 directory grant 到 Workspace identity 的授权边界；不持有 Agent transcript、Asset selection 或领域文档事实。
- `@neko/ui` 继续拥有无领域状态的 `ControlledWorkbenchShell`、slots、resize 与可访问交互 primitive；不新增产品 scene registry 或领域判断。
- `@neko/agent-contracts`、`@neko/agent-runtime` 与 `@neko/agent-webview` 拥有唯一 Agent Root、draft/session presentation、`assistant | workspace` scope、launch-safe capability catalog、conversation context、Assistant user-space/scratch lifecycle 和幂等 initial turn。
- `@neko/assets-domain` 与 `@neko/assets-webview` 拥有 `AssetCenterSession`、management selection 和资源 Root；`@neko/preview-*` 消费 Host 授权的 exact resource descriptor，不接收本地路径。
- `@neko/canvas-*`、`@neko/cut-*`、`@neko/preview-*` 继续拥有 workspace creative Roots；scene composition 不复制其状态、业务逻辑或媒体 runtime。
- Agent extension management UI 必须通过 Agent package public Root/port 暴露；项目目录与 Settings 只保留 app-level placement，领域状态与操作继续委托 owning Host/package contract。
- `apps/neko-desktop` 只保留 Electron Window/View 生命周期、typed IPC/preload、目录/文件/麦克风授权 adapter 和将公开 Roots 放入已验证 slots 的 presentation composition。
- `@neko/host` 同时拥有 Entry Draft identity 与 `unbound -> owner-bound draft -> session` Scene transition fencing；`@neko/agent-webview` 拥有同一 Root 内 presentation reset，Desktop renderer 不推断或缓存 scope。
- 用户数据不删除、不复制、不静默迁移。现有 Project/Workspace conversation 保持；旧 sidebar 值一次性迁移到独立窗口 presentation aggregate。Assistant scratch 在 conversation 存续期间可恢复，只有删除 conversation 或显式清理时回收；接受的产物必须先发布到资源中心或 workspace。
