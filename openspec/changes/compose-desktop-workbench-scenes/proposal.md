## Why

Desktop 当前把 Home、项目工作区、管理入口和 Settings 实现为不同的顶层页面结构。Home 拥有独立 Agent composer 和侧栏布局，项目才挂载完整的 package-owned Agent 与受控 Workbench，Settings 又切换到另一套顶层 Surface。这造成 Agent 能力分叉、PrimarySidebar 多实例、resize/显隐状态耦合，以及从入口跳转页面而不是在统一工作台内切换和组装能力的问题。

产品需要取消 Home 与工作区的顶层区别：一个窗口始终只有一个一级侧栏和一个 Workbench，一级侧栏选择场景，场景把 owner-qualified Surface 组装进固定 slots。统一的是 Workbench 组件、视觉和 slot 语义，不是固定显示相同数量的栏位。入口与会话必须挂载同一个 package-owned Agent Root；其 Draft binding、模型、命令、Skill、引用和首次提交语义由 `unify-agent-launch-and-domain-bindings` 的 Agent application capability 拥有，本变更只组合对应投影。资源中心与扩展中心的管理 Root 必须占据 Main，详情或授权 Preview 只能作为按选择出现的 Secondary Main。

当前入口仍在创建时隐式绑定 AssistantSpace，并复用稳定 Scene/View identity；从已有会话点击“开始创作”时，package-owned controller 也可能保留旧 Tab、transcript 和输入状态。这不满足“每次开始创作都是新的未会话入口”。此外 Asset Center renderer runtime 的 effect cleanup 与实例 dispose 混在一起，React StrictMode 的开发期 remount 会复用已 dispose 实例并让整个 Desktop 白屏。两者都属于 instance identity 与资源所有权契约缺失，不能通过 active Project、默认 Assistant 或 no-op dispose 兜底。

## What Changes

- 建立唯一的窗口级 `ApplicationPrimarySidebar` 与 `ControlledWorkbenchShell`；Agent、目录工作区、资源中心、扩展/Skill、项目管理和 Settings 都是同一个 Workbench 内的 scene，不再存在 Home/Project/Settings 顶层页面分支。
- PrimarySidebar 保留应用导航、最近项目、最近 Agent 会话和底部状态/设置；删除 Home 页面不得删除这些窗口级导航投影。
- 定义 closed、slot-specific Workbench scene projection。Scene authority 只投影 owner-qualified Surface identity；Desktop renderer 只将公开 Roots 放入 Interaction、Main、Secondary Main、Manager、Cut Panel 和 Status slots。Cut Panel 位于 Main 下方，其 active OTIO Root 内组合 Preview 与 Timeline，不投影 standalone Timeline Surface。
- 定义可变形 Workbench：默认 draft 只显示 Agent；Assistant 激活后显示 Agent + Preview Main；Workspace 显示 Agent + creative Main + Workspace Resources；未来角色扮演/聊天室显示 Agent 对话或群聊 + Interactive Main + Character Manager。缺少真实 Character/Interactive owner 时必须 owner-qualified unavailable，不在 Desktop 伪造实现。
- 以现有 `AgentWebviewRoot` 作为入口、assistant session 和 workspace session 的唯一 Agent UI/controller/composer。Workbench 只传入 exact Draft/Session presentation 并组合 Root，不拥有 input catalog、模型配置或执行路由。
- “开始创作”改为请求 Agent application 创建带全新 `draftId` 的 `unbound` Entry Draft；它没有 conversation 或领域 owner。Workspace/Assistant target 及未来 Character/Room target 的选择、可用性和 first submit 由 `unify-agent-launch-and-domain-bindings` 统一解析，owner provider 未组合时保持 unavailable。
- Agent Webview 以 `draftId` 作为 presentation instance identity；进入新 draft 时必须清除旧 conversation Tabs、active conversation、transcript、输入引用和瞬态错误，同时保留全局模型目录与用户设置。
- 将 Agent 的 presentation phase 与领域 binding 分离：本变更仅消费 phase/binding projection 决定 Workbench composition；目录、资源、Tool、Skill 和模型能力由 Agent launch capability 投影。
- Assistant scope 使用 OpenNeko 管理的用户资源投影、用户显式授权文件和 conversation-scoped scratch；它不得获得整个用户 Home、配置、凭据、插件安装根或任意本地路径。
- 用户显式选择已添加 Project 或系统目录时由 Desktop Main 授权并返回只属于当前 `draftId` 的 opaque Workspace target receipt；选择只更新 package-owned Entry Draft snapshot，不绑定 Scene、不激活 Workspace composition、不创建 conversation。
- Window Scene authority 只消费 Agent application 返回的 committed Conversation/owner projection；在 first submit 尚未完成 target、input、configuration、local commit 和 runtime materialization 前不得切换到 Assistant/Workspace/Character/Room Scene。
- Scene 只由 typed navigation intent、已提交 Conversation owner 和领域 capability facts 决定；模型文本、active/current/recent Project 和组件可用性不得发明 owner 或可执行 Scene。
- 资源中心建立 Assets-owned `AssetCenterSession`，由同一 session 的 Management Root 在 Main 管理 catalog/filter/selection，并把选中资源通过授权 descriptor 投影给可选 Secondary Preview Root；Desktop 不拥有 Asset selection、资源事实或 preview 类型判断。
- 资产、项目与扩展的 Management 和 Preview/Detail 必须呈现为两个视觉、DOM 与 overflow 边界独立的共享 panel shell；两个 shell 各自拥有边框、直角边界、背景并由带间距的 resize composition 连接，不能只在同一连续 Main 底板上画分隔线。
- 扩展/Skill、项目管理和 Settings 也通过明确 Surface slots 组合；缺失真实 owner/public Root 时显示 owner-qualified unavailable，而不是在 Desktop 复制临时业务实现。
- Conversation 创建本地原子提交 context、conversation、initial message 和 durable pending-turn intent，并在返回 session Scene 前把同一 identity 物化到精确 Assistant/Workspace Agent runtime；外部 provider turn 以 request identity 幂等启动和恢复，不宣称与本地事务原子。
- Entry Draft 首次提交完成一次 owner/session/endpoint 交接：lifecycle authority 已提交 initial message/pending intent、正确 scope 的 runtime conversation 可启动、session Scene 和新 projection endpoint 同时可附着；旧 launch attachment 只能经旧 endpoint 释放。崩溃重放可修复缺失的本地 session materialization，但不得重复 provider execution 或忽略 endpoint identity mismatch。
- **BREAKING**：删除 `HomeStartCreating`、Home 独立 Agent composer、`agentInitialInput` handoff、Home/Project/Settings 顶层分支、场景级 sidebar frame，以及通过首个/最近/active Project 或模型意图决定可执行场景的路径；只保留单一 canonical owner-qualified path。
- PrimarySidebar 将“最近会话”定义为恢复精确 interactive session，将“最近打开”定义为打开 Project/Character/Room 容器并进入新的 owner-bound draft；不得把容器选择当作旧会话恢复，也不得把内部角色 AgentSession 作为 Room 最近项暴露。
- Workspace 专属的 Agent、Main、管理面板与 Cut Panel 开关使用 VS Code 风格的紧凑独立图标，并浮置在现有 Workbench 顶部 chrome 右侧而不创建额外 header 行；一级侧栏开关留在自身品牌区，Main tab header 和领域 Surface 不再重复渲染布局按钮，资源管理标题不再提供重复的关闭按钮。Main 上半区域继续承载 Canvas、文件 Preview 或 Editor；每个 OTIO 文档作为 Main 下方 Cut Panel 内的精确 tab，active Cut Root 内组合 Preview 与 Timeline。Cut Panel 开关只修改该 panel 的 presentation，不替换 Main、不创建 standalone Timeline Surface。
- Window 级 Agent/Main/Manager panel 必须完整占用 Workbench 分配的 grid track，不使用装饰性外层 margin、padding 或顶层圆角缩减或露出 Canvas、Preview、Agent、管理 Root 或 Webview viewport。Workspace 顶部控件保持与 macOS 原生 title chrome 对齐并覆盖 full-bleed 直角 panel；页面内容留白继续由 owning package 内部 padding 拥有，Management/Preview 的 resize gutter 只作为真实兄弟 Surface 的功能性分隔。
- Workspace Main tab strip 与相邻资源管理标题栏使用同一个 `38px` panel chrome 高度；Desktop 只覆盖当前 Workbench composition 的共享 Tab 默认间距，不改变 `@neko/ui` 在其他消费者中的默认尺寸。
- Workspace 没有 Cut tab 时，Cut capability 可用的 Cut Panel 开关请求 Cut application 创建一个 exact 未命名内存草稿并打开空时间线；已有 Cut Panel 的 `+` 紧随最后一个 Cut tab，通过同一 Cut owner 追加并选中新的未命名草稿，而不占用标签栏远端或改变顶部显隐开关语义。草稿不提前写入或伪造 OTIO 文件。active Cut Root 的时间线工具栏保存图标与 `Cmd/Ctrl+S` 通过同一 Cut controller 命令保存当前文档；首次保存通过 Desktop 授权的保存位置选择绑定工作区内 canonical OTIO 文档，关闭 dirty 草稿由 Cut owner 请求放弃确认并只释放该草稿。Timeline 标尺在轨道区域纵向滚动时保持固定可见，并继续与轨道共享同一横向滚动坐标。
- 未命名 Cut 草稿的 document authority 只存在于当前应用进程；Workbench 可以在当前进程持有其轻量 View ref，但 Desktop 启动恢复必须逐项移除持久快照中无法恢复的 `cut-draft:*` View，返回 presentation-reset diagnostic，并保留所有真实 OTIO、其他 View、Project 与用户文件。失效 draft 不得按 Workspace 文件路径解析，也不得伪造一个新的空文档冒充原草稿。
- Renderer effect 只拥有自身 subscription；后台 task/runtime 由 package application owner 管理，不依赖
  React Root 是否挂载。StrictMode remount、renderer reload 和生产构建都必须保持可启动，并以真实
  Electron exception/DOM 证据验收。
- Window 只保留唯一 `ControlledWorkbenchShell`、当前 Scene/Workspace identity 和必要布局；Create 与
  Assets/Extensions/Projects/Settings 是当前导航场景，不创建长期 open Workbench instance。只有用户显式
  分屏时才允许第二个同时可见的业务 Surface。
- 每次应用启动或重新打开一个已释放的 Window 都创建新的 unbound Entry Draft 并显示入口界面；上次可见
  Workspace、conversation 或管理 Scene 只保留在各自 durable catalog/presentation snapshot 中，不作为启动
  目标。Renderer reload 仍恢复当前进程内的 exact Scene，不触发新的 Entry。删除 Application Settings 中
  “恢复上次工作区”的启动目标选项，保持一条 canonical startup path。
- Workspace、Conversation、Room、Project、Asset 和文档是可持久、可恢复且不设总量硬上限的业务记录，
  但 inactive UI 不常驻。Renderer 只挂载当前和显式分屏 package Root；切换前由 owning package 保存最小
  View snapshot，切回时从 durable facts 与 snapshot 重建。
- Agent transcript、turn、queue 和 approval 由 Agent runtime 独立持有。运行中、排队中或等待用户处理的
  Conversation 在隐藏后继续运行，但不要求隐藏 Agent Root/connection；不可见且空闲的 Conversation 与
  Workspace runtime 可释放并从本地 authority 恢复。
- Entry Draft 每个 Window 至多保存一个轻量未发送 snapshot，不为每个 draft 保留 Webview Root。管理页、
  资源 facet/page/detail/preview 也不得用隐藏 DOM 作为状态 owner；Canvas node selection 保持为
  package-owned 画布状态，不挂载独立 inspector/right dock。
- Host durable contract 不保存 `hot-retained`、`suspendable`、`ephemeral` 或其他 Renderer lifecycle policy；
  生命周期和并发预算由 `bound-desktop-ui-residency` 的 package-owned runtime/UI 约束负责。
- 核心编辑草稿和未提交修改由 owning package 的内存 model 与适用的本地 shadow persistence 保持；UI
  卸载和离线不得触发业务数据重新拉取、静默丢失或空白重建。
- 本变更定义 Character/Chatroom 的 Workbench 形态，但不实现尚不存在的 Character Manager、Interactive Main、World authoring/experience owner；未具备 owner/runtime/Surface 的显式导航请求返回 unavailable，active conversation 不允许原地 rebind。

## Capabilities

### New Capabilities

- `desktop-workbench-scene-composition`: 定义统一 Desktop Workbench、窗口级 PrimarySidebar、slot-specific scene composition、完整 Agent 的 assistant/workspace scope、显式目录授权、Assistant 用户区与 scratch，以及 Assets management + preview 资源中心。

### Modified Capabilities

<!-- None. Conflicting active changes are reconciled before implementation and are not stable baseline specs. -->

## Impact

- `@neko/host` 拥有 host-neutral window/scene/sidebar projection、每 Window owner 内串行化的 scene transition、精确 Window/Workbench/View/Workspace/session/request identity，以及 directory grant 到 Workspace identity 的授权边界；不持有 Agent transcript、Asset selection 或领域文档事实。
- `@neko/ui` 继续拥有无领域状态的 `ControlledWorkbenchShell`、slots、resize 与可访问交互 primitive；不新增产品 scene registry 或领域判断。
- `@neko/agent-contracts`、`@neko/agent-runtime` 与 `@neko/agent-webview` 拥有唯一 Agent Root、draft/session presentation、`assistant | workspace` scope、launch-safe capability catalog、conversation context、Assistant user-space/scratch lifecycle 和幂等 initial turn。
- `@neko/assets-domain` 与 `@neko/assets-webview` 拥有 `AssetCenterSession`、management selection 和资源 Root；`@neko/preview-*` 消费 Host 授权的 exact resource descriptor，不接收本地路径。
- `@neko/canvas-*`、`@neko/cut-*`、`@neko/preview-*` 继续拥有 workspace creative Roots；scene composition 不复制其状态、业务逻辑或媒体 runtime。
- Agent extension management UI 必须通过 Agent package public Root/port 暴露；项目目录与 Settings 只保留 app-level placement，领域状态与操作继续委托 owning Host/package contract。
- `apps/neko-desktop` 只保留 Electron Window/View 生命周期、typed IPC/preload、目录/文件/麦克风授权 adapter 和将公开 Roots 放入已验证 slots 的 presentation composition。
- `@neko/host` 同时拥有 Entry Draft identity 与 `unbound entry -> committed owner-qualified session` Scene transition fencing；`@neko/agent-webview` 拥有同一 Root 内 presentation reset 和未发送 target/configuration snapshot，Desktop renderer 不推断 scope 或以 Scene 表示 Draft target。
- `@neko/host` 的 Window claim 负责把已释放 Window 的可见 presentation 原子切换为 fresh Entry，同时保留
  Project tabs/catalog、conversation authority 和 package snapshots。Application Settings 不再拥有 startup
  destination；旧 Settings shape 由既有 strict recovery/quarantine 边界局部拒绝并重置该 settings record，
  不修改 Shell、Project、Conversation、Assets 或用户文件。
- `@neko/host` 拥有 Window 当前 Scene/Workspace/View identity 与布局，不拥有 Renderer residency policy；
  package runtime 继续拥有业务状态与后台任务，Desktop renderer 只挂载当前和显式分屏 Roots。
- 用户数据不删除、不复制，产品运行时不迁移、不兼容读取也不自动修复。持久记录必须长期保持单一稳定 shape；无法满足 canonical shape 的记录在其最小实例边界返回明确 diagnostic，其他 Window、Workbench、conversation 和 Project 继续可用。Assistant scratch 在 conversation 存续期间可恢复，只有删除 conversation 或显式清理时回收；接受的产物必须先发布到资源中心或 workspace。

本变更依赖 `remove-internal-versioning-and-product-migrations` 的 Host/Desktop contract、Agent connection 与 runtime ordering 切片。两项变更必须一次性更新本次边界内全部 producer、consumer、fixture 和测试，不建立版本判别、产品迁移、兼容 reader、双路径或内部代际别名。
