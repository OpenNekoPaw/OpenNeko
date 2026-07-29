## Context

P1.1/P1.2 已建立 Electron AppHost、sender-bound preload bridge、Content Project、
Window/View identity、Shell projection 与 fail-visible domain slot。Agent 侧已经拥有：

- `@neko/agent` 中的 Pi conversation runtime、Pi Session、conversation catalog/lease、
  Product Turn Bridge、permission、Tool/Skill 和 authoritative Timeline projection；
- `@neko-agent/types` 中 52 条 Webview-to-Host route 与 projection attachment contract；
- `AgentWebviewRoot` 和可注入的 `AgentHostRuntimeAdapter`；
- VS Code Extension 中生产可用但混合 `vscode.Webview`、command、URI、workspace、
  credential interaction 和 Agent orchestration 的 `ChatViewProvider`/router；
- TUI 中第二个真实 Node Host composition，可用于识别应提升到 owning package 的共同逻辑。

本变更不是把 `ChatViewProvider` 移到 Desktop，也不是实现第二套 Agent runtime。它把已经存在
的多宿主变化点收敛到 Agent-owned controller/effect boundary，再让 VS Code 与 Electron
组合同一个 canonical path。

## Goals / Non-Goals

**Goals:**

- 让全部 Agent wire route 拥有显式 Electron support classification 和 fail-visible 行为。
- 让 `@neko/agent` 拥有唯一 host-neutral route/controller 与 conversation composition。
- 让 VS Code 和 Electron 只拥有各自的 UI、IO、credential interaction、external/content
  effect 与生命周期 adapter。
- 在 Desktop 中完成 Conversation 创建/恢复、Pi turn、Tool confirmation、Skill、
  Timeline/Tab、Home Activity/Attention 和 renderer reload 恢复。
- 保持 conversation、branch、Pi session、turn、run、tool call、Window、View identity
  独立，并保留单写者 lease。
- 证明 Desktop 没有命中 VS Code、legacy `AgentSession`、active-object、mock/demo 或
  generic Task fallback。

**Non-Goals:**

- 不实现 P1.4 的 Canvas authoring/Workspace Board、P1.6 的 Character/Quality/Generation
  composition 或 Phase 3 plugin/MCP UI。
- 不创建 Desktop-owned transcript、JobStore、Skill registry、provider registry、
  permission policy 或全局 Agent store。
- 不把 `NekoHostPorts` 扩成万能 Agent adapter，也不把所有 route 塞进一个 manager bag。
- 不改变 Pi 的 Agent loop、prompt、Skill read、Tool scheduling 或 Session JSONL authority。
- 不在 renderer 暴露绝对路径、credential、SQLite handle、runtime handle 或 Host object。

## Five-Layer Analysis

| 层   | 决策                                                                                                                                                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | `@neko-agent/types` 拥有 wire/route classification；`@neko/agent` 拥有 controller、Pi conversation composition 与 projection；Host adapter 拥有 IO/trust/credential/UI effects；Desktop Shell 只组合 surface 与摘要。 |
| 依赖 | Webview → agent-types；Desktop renderer → Webview Root + fixed preload bridge；Desktop main/VS Code → Agent runtime + Host effects；Agent core 不依赖 Electron、VS Code、React 或具体领域实现。                       |
| 接口 | 使用显式 connection/owner identity、typed Host message、按职责 effect ports、route support record、projection attachment、command/revision 和 typed diagnostic。                                                      |
| 扩展 | 新 route 先加入 canonical union 和所有 Host exhaustive classification；新领域行为仍由 owning package port 注入，不能在 router 中硬编码扩展发现。                                                                      |
| 测试 | 编译期 route completeness、producer/consumer、identity/revision、legacy poison、multi-window/reload/disposal、key-free evaluation、真实 provider case 与 Electron functional scenario 分层验证。                      |

## Decisions

### 1. Wire contract 使用 Host 语义并一次迁移所有消费者

`WebviewToExtensionMessage` 与 `ExtensionToWebviewMessage` 改为
`AgentWebviewToHostMessage` 与 `AgentHostToWebviewMessage`。parser、builder、handler、
VS Code、Webview 和测试在同一边界迁移；不保留 deprecated alias 或 Electron 专属 union。

wire parser 必须返回 typed diagnostic 或拒绝 unknown schema/type。Main 在 parser 之前只把
payload 当作 `unknown`，并根据真实 `WebContents`/frame registry 绑定 application、Window、
View、workspace 与 renderer epoch；renderer 自报 identity 只作相关性校验，不授予权限。

路径型 route 必须迁移到 Host 已投影的 `DocumentLocator`、`ContentLocator`、`ResourceRef`
或 capability-scoped opaque content identity。现有 `filePath`/`resolvedPath` 只能存在于
VS Code Host effect 内部，不能成为 Desktop renderer 输入或授权依据。

**替代方案：** 保留 Extension 命名并给 Electron 做 type alias。否决，因为它把错误 owner
固化为公共契约并允许两套 parser/route 继续漂移。

### 2. Electron route coverage 是完整、静态且可运行时验证的契约

Electron support record 使用
`Record<AgentWebviewToHostMessage['type'], AgentHostRouteSupport>`，不能是 `Partial`。
启动时仍运行 coverage diagnostic，防止动态 composition 缺失 handler。

P1.3 route matrix：

| Support             | Routes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `implemented`       | `sendMessage`, `searchProjectFiles`, `confirmTool`, `activateConversation`, `clearHistory`, `cancelMessage`, `getContextTokenCount`, `compressContext`, `getMessageQueue`, `promoteQueuedMessage`, `cancelQueuedMessage`, `editQueuedMessage`, `deleteConversation`, `newConversation`, `clearAllConversations`, `getConversations`, `getActiveConversation`, `getAgentStates`, `getSettings`, `getConversationSnapshot`, `getConfig`, `refreshConfigSnapshot`, `getSkills`, `openUserConfigFile`, `openConfigFile`, `getTabState`, `updateSettings`, `updateTabState`, `openFile`, `revealDocumentLocator`, `revealFile`, `openUrl`, `mermaidError`, `downloadSvg`, `invokeSlashCommand`, `invokeSkill`, `revealContextSource`, `projectionEndpointDiscover`, `projectionAttach`, `projectionSnapshotAck`, `projectionDetach` |
| `unsupported`       | `sendToPlugin`, `invokeAgentCapabilityLifecycle`, `requestCanvasAuthoringHandoff`, `invokePluginSlashCommand`, `startCharacterDialogueFromSlash`, `confirmRoleplayCandidate`, `exitCharacterDialogueSession`, `exitEmbodyCharacterSession`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `host-inapplicable` | `dnd:start`, `webviewKeyboardFocus`, `webviewKeyboardEditable`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

`unsupported` route 若被调用必须返回 `agent-host-route-unsupported`，包含 route 和 owning
future slice，不伪装成功。`host-inapplicable` route 由 Electron `AgentWebviewRoot` 的
foundation/effect policy 禁止发送；若越界到达 Main，则返回
`agent-host-route-inapplicable`，不能 no-op。

**替代方案：** 只对当前 UI 会触发的 route 做 handler。否决，因为新增按钮或恢复状态会把
未审计 route 静默带入 Desktop。

### 3. Controller 按稳定职责组合，不建立万能 HostAdapter

`@neko/agent/runtime` 提供一个连接级 `AgentHostMessageController`，但具体 handler 按责任
拆分并通过直接组合注册：

```text
AgentHostMessageController
  -> conversation/turn/queue routes
  -> config/settings routes
  -> skill/context routes
  -> content/external routes
  -> projection attachment routes
```

controller 依赖小型 port：

- `AgentHostConnection`：post typed message、connection identity、locale、dispose；
- conversation runtime/catalog/lease 与 projection owner；
- config/settings snapshot port；
- Skill/Context/Tool confirmation ports；
- content reveal/search/write 与 external-open effects；
- Host interaction effects，例如 credential prompt 和 approval prompt。

route handler 不接收 `vscode.Webview`、Electron `WebContents`、active editor、active
workspace 或任意 command executor。VS Code adapter 把现有 command/URI effects 注入；
Electron adapter 只使用 `NekoHostPorts`、Desktop workspace registry 和固定 UI interaction。

**替代方案：** 直接参数化 `ChatViewProvider`。否决，因为该类同时拥有 Webview HTML、
VS Code lifecycle、commands、storage 与 Agent orchestration，不是稳定多宿主边界。

### 4. Desktop AppHost 拥有 composition，runtime 状态按 conversation 隔离

Desktop `AgentHostComposition` 由 `DesktopAppHost` 创建和释放，使用已有：

- Node Pi conversation authority 与用户级 SQLite conversation catalog/lease；
- Pi Session JSONL root；
- `OpenNekoCredentialStore` 加基于 `HostSecretPort` 的 persistence/interaction；
- Desktop workspace registry 与 Host content/file ports；
- Agent permission/approval、Tool/Skill、projection 与 logger/diagnostic。

每个 conversation 独立拥有 Pi Agent、active Pi Session、queue、abort state、immutable
turn snapshot、projection 和 lease。Window/View 只拥有 attachment 和展示状态。active Tab
不能切换共享 singleton 来模拟多个 conversation。

Desktop 使用与 TUI/VS Code 相同的用户级 storage layout 和 application-neutral facts；
不复制 transcript、conversation row、credential 或 trust state。未知 schema 与 fenced
lease mismatch fail-visible。

### 5. Preload bridge 固定为 Agent namespace，renderer adapter 不拥有事实

preload 增加 versioned `agent` namespace：

```text
agent.send(message)
agent.subscribe(listener)
agent.getBootstrap(projectId, viewId, viewEpoch)
```

不暴露 raw `ipcRenderer`、任意 channel 或 raw Host object。Main 根据 sender registry 补全
Window/View/workspace owner。`AgentHostRuntimeAdapter.getState/setState` 只访问 renderer
内按 `ViewId + ViewEpoch` 隔离的可恢复 presentation state，不经过 Main，也不保存
Conversation/Run/Tool/Job fact。

### 6. Home 与 Content Project 消费 owner projection，不复制 Agent store

Content Project 渲染 package-owned `AgentWebviewRoot`。Home 使用窄的
`DesktopAgentHomeProjection`，只包含 conversation summary、last activity、attention status
和 stable navigation identity；完整 Timeline 继续由 Conversation projection attachment
拥有。

Desktop Shell capability union 扩展为 `ready | unavailable`。只有 Agent 在本变更变为
`ready`，其他 P1.4–P1.6 surface 继续 fail-visible unavailable。Shell 的 Attention 数字由
AppHost 聚合 Agent Work Item/Tool confirmation/active run projection，不成为第二套
Activity authority。

已有 GenerationJob link/status 可以作为 Agent Timeline/Activity 中的 immutable owning
Job reference 被显示；Desktop 不在 P1.3 注入具体 GenerationJob port。缺失 P1.6
composition 时 Job command 返回明确 unsupported diagnostic。

### 6.1 Desktop presentation 复用共享 theme/i18n，默认浅色

Electron 不会像 VS Code Webview 自动注入 theme/locale 属性，因此 Desktop renderer 增加窄的
Host presentation bootstrap：

- 从 `@neko/shared/theme` 应用 `nekoDesignTokens.light`，并设置
  `data-vscode-theme-kind="vscode-light"`，让 package-owned `AgentWebviewRoot` 与 `@neko/ui`
  沿用同一浅色语义；Desktop CSS 只消费共享 semantic token，不建立第二套 design system。
- 从浏览器 Host locale 读取并通过 `normalizeLocale` 收敛到 `en | zh-cn`，使用
  `@neko/shared/i18n/webview` 和 `@neko/shared/i18n/react` 注册、投影和响应 locale；
  Desktop 只拥有 Shell 域的完整双语 bundle。
- 将同一 normalized locale 显式传给 `AgentWebviewRoot`，日期使用对应 locale 的
  `Intl.DateTimeFormat`，静态文案、Tooltip、ARIA 和 presentation status 不再硬编码英文。

默认浅色只定义当前无设置入口时的 canonical behavior；P1.6 若新增用户偏好，必须更新
Shell settings contract 并继续使用同一 shared token，不可在组件内读取 OS dark mode 或
维护并行 palette。Host/runtime diagnostic 的 machine code 保持稳定，动态外部错误内容不伪造
翻译。

### 6.2 Home 与 Content Project 使用 creator-first Workbench 信息架构

参考交互收敛为两种稳定壳：

- Home：左侧固定 product navigation、最近 Project/Conversation 与注意项；主区保留单一
  开始创作焦点、最近工作和可用 profile。P1.3 不在 Home 复制完整 Agent conversation store；
  未绑定 workspace 时不伪造可发送 prompt，开始动作进入真实 `projects.openContent()`。
- Content Project：复用 `@neko/ui` 的 Workbench primitives，一级侧边栏可折叠为稳定图标
  轨道；package-owned Agent Root 只进入 Chat dock/workspace region，不再被 Desktop
  `agent-workspace` header 或主创作区包裹；中央 Main 只承载当前创作领域 workspace，资源
  dock 组合 Files/Media/Entity projection。Content Project 不增加全局 Header 或统一工作区
  Tab 行；Conversation Tab 继续由 Agent Root 自己渲染，布局与设置入口进入一级侧边栏。
  Project catalog、Window Tab、
  Agent 与未来 domain facts 仍由各 owner 提供，布局只选择和展示。

Agent Root 在 Desktop 由 Host 统一提供配置与 credential interaction，因此不得自动弹出
Agent-owned onboarding，也不得显示连接 AI、打开配置文件或 provider account 菜单；VS Code
仍可通过同一 Root 的 host-owned configuration presentation 保留现有入口。当前 P1.3 只有
Agent composition；Canvas/Assets 属于 P1.4。因此中央 Canvas 和右侧 Assets
区域只显示 owning slice + typed unavailable diagnostic，不渲染可交互画布、假素材或成功按钮。
该壳为后续 domain Root 保留稳定 slot，但不提前实现 registry、domain fallback 或 renderer
owned facts。

### 6.3 UX 优化只调整展示态，不削弱基础能力

Home 将 Project 与 Agent conversation 的 owner-derived summary 都加入持久最近工作导航，
主区保持唯一真实 `projects.openContent()` 起点；Project/Conversation 入口继续使用稳定 identity
调用既有 Shell mutation，不读取路径或复制 owner state。Conversation 入口保存一次性 renderer
navigation intent，先激活匹配 Project View，再把显式 conversation identity 传给 package-owned
Agent Root；Agent Root 只有在 conversation catalog 与 Tab state 均已水合后才激活目标，不允许
使用 active conversation fallback。Content Project 保留共享 Workbench、真实 Project Tab 动作，
并把当前唯一 ready 的 Agent Root 作为中央主 workspace；左右面板只承担 capability 状态与 Context。

未 ready 时只显示 capability owner、阶段与 typed diagnostic。不得保留仿 Agent composer、
仿 Canvas toolbar、仿 Assets search/filter 等视觉控件；这些元素即使没有 click handler，也会
制造能力已接入的错误预期。Agent ready 时仍挂载完整 `AgentWebviewRoot`，UX 层不得替换其输入、
Conversation、Tool approval 或 projection 行为。React 回归测试同时断言真实 bridge 动作仍被
调用、ready Root 仍挂载、unavailable slot 不含模拟控件。

Shell 持久化中的 workspace path/locator 继续仅属于 Main。恢复后的 Project View 首次请求 Agent
bootstrap 时，AppHost 若尚未持有对应 workspace runtime，则通过 Shell 的 Host-only locator
重新 resolve 并 attach；resolved workspace identity 必须与持久化 identity 一致，否则 fail-visible。

### 6.4 可调整面板只在拖拽结束时提交 Host-owned layout

`ControlledWorkbenchShell` 复用 `@neko/ui` 已有的 `useResizable` 与 `ResizeHandle`，为一级侧边栏、
左右 dock 和底部 Timeline 提供可访问的 separator。拖动过程由共享 Workbench 壳持有临时尺寸并
实时更新 CSS grid；pointer up、cancel 或 capture loss 时，resize primitive 只发出一次最终尺寸。

Desktop renderer 将最终尺寸映射回 Host-owned `DesktopWorkbenchLayoutProjection`：

- 一级侧边栏更新 `primarySidebar.width`；
- 左右 dock 按其中实际挂载的 Agent/资源 owner 更新对应 `agent.width` 或
  `resourceDock.width`；同侧同时堆叠时共享显示宽度并同步两个 owner；
- Timeline 更新 `timeline.height`。

边界值只来自 `DESKTOP_WORKBENCH_LIMITS`，不得在 Shell 或组件内复制常量。Host mutation 只在
拖拽结束时执行一次，避免 pointer move 逐帧使用同一个 expected revision 造成 stale mutation；
Host 投影返回后再同步临时显示尺寸。隐藏面板不渲染 resize handle，overlay 与 docked presentation
使用同一 owner 尺寸和提交路径。

### 7. 生命周期按 connection、View、conversation 和 AppHost 分层

- renderer reload：旧 connection/View epoch detach；conversation/Pi runtime 不重建；
  新 connection snapshot-first attach。
- 同一 renderer/View epoch 的重复 bootstrap：幂等复用 exact connection，并刷新同一 sender
  的 event publisher；不得创建第二套 controller effects 或淘汰已挂载 Root 正在使用的连接。
- durable catalog 中尚未打开 Pi runtime 的 conversation：历史与 token count 等只读查询从
  authority 的 active branch 构建持久化 context；不得为了 presentation 查询创建 model、
  lease 或 process-local conversation owner。只有 turn、context mutation 和 compact 等写操作
  才要求显式打开对应 runtime。
- Host 创建、激活、删除或清空 ordinary conversation 时，先发布带新 revision 的 canonical
  Tab state，再发布 active conversation snapshot。Webview 必须先建立稳定 Tab render/projection
  binding，禁止由 active snapshot 临时生成 timestamp Tab 后再被 Host Tab identity 替换。
- Project Tab close：释放 View attachment 和 presentation state；不删除 conversation。
- Window close：释放该 Window connection、subscription、prompt/approval interaction；
  不取消其他 owner 的 recoverable work。
- explicit cancel：携带 conversation/turn/run/toolCall identity，取消准确 owner。
- app quit：阻止新 turn，取消 AppHost-owned foreground run，flush terminal checkpoint，
  释放 lease、subscription、timer、file/process handle；超时返回 diagnostic。
- stale message/response：renderer epoch、View epoch、owner、sequence 或 revision 不匹配时
  拒绝并重新 snapshot，不回退 active conversation。

### 8. 现有 VS Code consumer 同步迁移并保留真实验收

VS Code `ChatViewProvider` 退化为 UI/lifecycle composition，复用同一 controller 和 wire
contract。其 TreeView/command/URI/keyboard/drag effects 保留在 VS Code adapter。被替代的
router 和 direct `vscode` route 实现删除或 poison；不能让 Desktop import Extension 包。

需要行为证据的 Agent route 使用 `neko-agent-evaluation` 规划：

- key-free case 证明 canonical controller、Pi runtime、Tool confirmation、projection、
  unsupported/no-fallback facts；
- 有 credential 且获得成本授权时运行一个聚焦真实 case；
- Electron functional fixture 证明 UI、reload、multi-window 和 disposal；
- VS Code Extension Development Host 回归证明现有 Host 未退化。

`2.2`–`2.6` 的 Host message 选择、turn/config/Skill/content/projection request 投影、显式
conversation identity 拒绝、effect 错误传播和 VS Code composition path 属于确定性路由
契约，authoring disposition 为 `excluded`；由 shared-controller 单元测试、VS Code
producer/consumer 与 architecture guard、per-turn immutable config snapshot 测试、严格
typecheck 和 boundary guard 验证。它不改变 Pi prompt、model、Tool schema、Skill content
或 Agent loop，TUI Evaluation 也不会经过图形 Host controller，因此现有
`agent-runtime.workflow-controller`/`skill-runtime` case 不能伪装成该路由的真实验收。

整体 P1.3 的 Pi conversation、队列、Tool confirmation、projection 与 no-fallback 行为仍必须在
`6.1` 建立聚焦 evidence contract，并在 Desktop composition 接通后提供 shared-controller
path fact；若届时 Evaluation runner 仍只能驱动 TUI，则该 case 以 missing observability 阻塞，
由 Electron functional scenario 提供图形 Host path evidence，不得用最终文本或 mock 替代。

`3.1` 的 authoring disposition 为 `create`：owner 是 `6.1` 新建的
Desktop Agent/Home 聚焦 suite，覆盖 Desktop Product Turn Bridge → Pi conversation runtime →
Pi Session checkpoint → authoritative Timeline projection，并禁止 Extension manager、legacy
`AgentSession`、active-conversation 与 mock/demo fallback。`3.1` 当前使用真实
`NodePiConversationAuthority`、`PiConversationRuntime`、Skill/Tool snapshot 和 projection 的
deterministic fake-provider 测试作为实现门禁，但不将其描述为真实 Agent 行为验收。真实 case
当前被 `3.2` credential/model composition 和 `3.4` sender-bound IPC 尚未接通阻塞；在
`6.2`/`6.5` 解除阻塞并记录 provider、model、cost、path fact 和报告位置。

`3.2` 沿用该 suite 的 `create` disposition，增加 HostSecret-backed credential persistence、
protected native auth interaction、requested/effective provider identity 和 secret non-disclosure
evidence。deterministic 门禁覆盖 Electron safeStorage 加密文件、credential codec/status、
Host-only prompt、Pi SQLite/Session 排除和 renderer/IPC 静态边界；它们不能替代 provider-backed
登录与 turn。真实 OAuth/API-key case 需要 `6.2` 的 provider/model/cost 授权，并在 `3.4`
sender-bound IPC 完成后证明 renderer projection、日志和报告均不含 credential。

`3.3` 的 authoring disposition 为 `excluded`：它只实现 Desktop Host content effect adapter，
不改变 Pi prompt、Tool schema、Skill content、provider/model 选择或 Agent loop。确定性门禁覆盖
sender-bound workspace grant、稳定 `ContentLocator` projection、`.gitignore`/managed-directory
搜索排除、symlink 读写逃逸、Host access policy、external protocol、精确
`DocumentLocator` interaction 转交、Host 选择的 SVG write target 与 renderer 绝对路径排除。
`3.4` 负责把该 adapter 接入 sender-derived connection identity；完整 Desktop Agent canonical
path、unsupported/no-fallback 与真实 provider 行为仍由 `6.1`/`6.2`/`6.5` 统一验收，不能用
3.3 单元测试替代。

`3.4` 的 authoring disposition 为 `extend`：继续扩展 `6.1` 所属的 Desktop Agent/Home
聚焦 suite，增加 fixed preload namespace、sender-derived Window/View/workspace/renderer
identity、shared controller 命中、typed unsupported/inapplicable 以及旧 connection/active-owner
fallback 未参与的 path facts。当前 producer/consumer、Main bridge、View/renderer epoch 与
renderer-only presentation-state 测试只作为确定性实现门禁；在 `6.1` suite 和 `6.5` Electron
functional scenario 落地前，不把 IPC 最终返回或 mock effect 调用描述为 Agent 行为验收。

`3.5` 的 authoring disposition 同为 `extend`：同一 suite 增加 startup route coverage 完整、
缺任一 Pi runtime/effect requirement 时 capability 明确 unavailable、且未注册 partial
controller 的事实。该启动门禁不改变 prompt、provider/model 或 Agent loop，但决定 capability
routing，因此不能以普通单元测试替代 `6.1` 的 canonical-path/no-fallback evaluation evidence。

`4.1` 的 authoring disposition 为 `extend`：同一 suite 增加只有完整 startup audit 可将
Agent/P1.3 capability 投影为 ready、缺失 effect 时保持 unavailable、以及 P1.4–P1.6
surface 不能伪造 ready 的 facts。该投影属于 capability routing，不改变 Agent loop；当前
contract/Shell/AppHost 测试是确定性门禁，最终 ready 仍受 `6.1`/`6.3`–`6.6` 全部验收约束。

`4.2` 的 authoring disposition 为 `extend`：沿用 `6.1` suite，增加 Content Project 的
Project/View/ViewEpoch bootstrap、Electron runtime adapter identity 与 package-owned
`AgentWebviewRoot` 命中事实，并禁止 renderer-owned Conversation/Run/Tool/Job hydration。
确定性 React 测试验证 exact View bootstrap、unavailable gate、Root mount 和
ViewId+ViewEpoch presentation state 隔离；真实 Electron UI、Pi turn 与 reload 恢复仍由
`6.5` 验收。

`4.3` 的 authoring disposition 为 `extend`：`DesktopAgentHomeProjection` 由 AppHost-owned
Pi conversation catalog、conversation projection owner 与 active-run owner 同步派生，只保留
title、updatedAt、stable Project/Workspace/Conversation navigation identity、last-activity
kind/identity 和 attention status。Shell 仅组合该 immutable summary 与聚合 Attention，
不保存或重放 Timeline item payload、Pi transcript、Tool result、Job state 或 renderer
presentation state；composition、Shell contract 与 React tests 证明 owner-derived path、
运行态 Attention、无路径泄漏和无 Timeline payload 复制。

`4.4` 的 authoring disposition 为 `extend`：Desktop 复用 package-owned Agent Root 的
Conversation/Tab、Tool Call/confirmation、Skill 与 projection attachment consumer；AppHost
composition 提供 Pi Skill snapshot、Tool confirmation Timeline state 和 stable
Conversation navigation。Home 只从 owning Tool item 投影 immutable GenerationJob
`jobId/revision/phase`，不注册 `Submit/Cancel/Retry/ReconcileGenerationJob` 或第二个 Job
store；Tool/Skill canonical tests、Desktop owner-projector tests 与 Electron unsupported
route diagnostics 共同作为确定性门禁。

`4.5` 的 authoring disposition 为 `extend`：沿用 package-owned Webview 的
Conversation create/activate/delete、Tool confirmation 和 projection sequence/base mismatch
React/runtime tests，并增加 Desktop Home stable-identity navigation、Activity/GenerationJob
render、needs-input Attention 与未来 domain typed unavailable tests。它们验证 consumer 与
projection contract，不替代 `6.5` 的 Electron sender-bound functional scenario。

`4.9` 的 Home navigation 以 Project/Workspace/Conversation identity 为一个不可拆分的目标；
若 Project Tab 仍存在则激活 exact View，若已关闭则由 Main 使用 Host-only persisted locator
重新解析同一 Workspace、验证 identity、创建新 View 并重新附着 Agent workspace。renderer
不能提交路径，重开失败不能回退到当前 Project 或 active conversation；Agent Root 仍需等待
conversation catalog 与 Tab state hydration 后才激活目标 Conversation。

`5.1` 的 authoring disposition 为 `extend`：renderer epoch 变化会先释放旧 Window
connection effects，并在 Shell projection 中推进对应 View epoch；新 Agent Root 继续使用
projection attachment client 的 snapshot-before-patch protocol。View presentation state 仍
只按 `ViewId+ViewEpoch` 保存在 renderer session storage，detach 不触碰 workspace-owned Pi
runtime、Conversation authority 或 durable checkpoint。

`5.2` 的 authoring disposition 为 `extend`：Project Tab close 释放 exact View connection，
Window close/reload 释放该 Window connections，explicit cancel 由
`conversationId+turnId+runId` 精确校验。AppHost quit 采用两阶段 workspace shutdown：先取消并
等待 Pi terminal checkpoint/runtime stop，再等待公开 `executeTurn` 完成 durability/snapshot
投影，最后销毁 projection 与 authority；失败聚合返回，不报告部分成功。

`5.3` 的 authoring disposition 为 `extend`：composition、Shell 与 bridge tests 共同覆盖
同 workspace 多 conversation owner、跨 Window View/connection 隔离、fenced concurrent Host
拒绝、renderer/View stale identity 拒绝以及无 active-conversation fallback。

`5.4` 的 authoring disposition 为 `extend`：Desktop restart test 证明同一 catalog
conversation 与 Pi Session id 被恢复、旧 turn 只在 provider context 出现一次，新 Host 可在
旧 lease 释放后继续执行。Tool/GenerationJob 的 idempotency 继续由 Pi checkpoint 与 owning
GenerationJob tests 约束；P1.3 未注入任何 GenerationJob submission/command owner，因此
restart 不存在 Desktop Job resubmission path。

### 9. 6.x 验收处置与剩余阻塞（2026-07-28）

- `6.1` 保持未完成。现有外部 Evaluation runner 只驱动 canonical TUI，没有
  shared-controller、Electron sender identity、unsupported route 或 legacy-fallback path
  facts；因此按本设计记录为 missing observability blocker。现有 TUI workflow/stream
  cases 只能作为相邻 Pi 行为证据，不能冒充 Desktop controller 验收，也不新增 mock
  Desktop evaluation。
- `6.2` 已记录精确外部阻塞：当前没有用户授予的 provider、model 与成本授权，因此未执行
  provider 登录或真实模型调用。剩余风险是 credential 交换、provider context、真实 Tool
  confirmation 和输出投影尚未经过外部 provider 行为验证。
- `6.3` 的确定性门禁已完成并在 UX 收口后复验：Desktop 26 files / 113 tests、Webview
  95 files / 727 tests；Desktop/Webview typecheck、Desktop lint、
  Desktop Forge production package、Webview build、`pnpm test:agent:eval`（仅 harness
  40 files / 282 tests、24 suites / 53 dry-run cases）、agent/application boundaries、
  legacy debt、unused-code 和 strict OpenSpec validation 全部通过。
- `6.4` 保持未完成。仓库标准隔离 fixture 与 `Debug Dev (All)` launch configuration
  存在，但本轮没有可用的 Extension Development Host/CDP 运行态，且最后一次 Host UI
  复验受 macOS 锁屏阻塞。因此没有 no-regression/no-old-router 运行态证据。
- `6.5` 保持未完成。生产 Electron 已注入完整 Agent AppHost 与
  `DesktopAgentControllerComposition`；conversation/config/Skill/content/projection
  requirements 均通过 startup audit。production package 已真实启动 Home 与 package-owned
  Agent Root；验收过程中依次暴露并修复了 Vite module identity 分裂、Electron 不适用的
  VS Code keyboard route，以及 durable catalog 中未打开 conversation 被错误要求存在于
  process-local runtime 的问题。后两项均有修复前失败的回归测试，最新 production package
  已生成；但最终的无成本“新建对话 → Home 最近对话 → 精确恢复”复验受 macOS 锁屏阻塞，
  provider-backed Pi turn → Tool approval → Activity → reload 又受 `6.2` 授权阻塞，因此
  完整 canonical-path 与 cleanup evidence 仍未具备。
- `6.6` 的根门禁已完成：`pnpm build`、`pnpm test`、`pnpm check` 和
  `pnpm check:quality` 均通过；Desktop/Agent 当前能力文档已同步。`git diff --check` 在
  文档最终修改后执行，其结果记录在 checklist 状态中。

## Risks / Trade-offs

- **[现有 Extension router 责任过宽]** → 先按五个已存在的职责组迁移，逐组 poison 旧入口，
  不一次重写 Pi runtime 或 Webview UI。
- **[wire rename 影响面大]** → 同一提交边界迁移全部 producer/consumer，使用编译期
  `AssertNever` 和 `rg` debt gate 证明旧命名归零。
- **[Desktop credential interaction 可能扩大 secret 暴露]** → persistence 只依赖
  `HostSecretPort`，interaction 返回 secret 给 CredentialStore，不进入 renderer projection、
  logs、SQLite 或 Pi transcript。
- **[Home Activity 可能变成第二事实源]** → 只保存 owner identity 和 immutable summary，
  detail navigation 回到 Conversation/Tool/Job owner。
- **[P1.4/P1.6 route 暂不可用]** → 静态 `unsupported` 分类、typed diagnostic 和 future
  owner slice；不增加 mock Canvas/Character/Generation implementation。
- **[多窗口抢占 conversation writer]** → 复用 fenced execution lease，旧 epoch 的 turn、
  checkpoint 和 projection mutation全部失败。

## Migration Plan

1. 冻结 Host-named wire types、route support record、diagnostics 和 producer/consumer tests。
2. 提取五组 host-neutral handler/controller，逐组让 VS Code consumer 迁移并 poison 原 route。
3. 建立 Electron Agent composition、fixed preload namespace 与 sender-bound IPC。
4. 接入 `AgentWebviewRoot`、Conversation/Tab、Home Activity/Attention 和 lifecycle。
5. 运行 package、architecture、evaluation、VS Code Extension Host 与 Electron functional
   gates；全部通过后才把 P1.3 capability 标记 ready。

预发布回退方式是保持 Agent surface fail-visible unavailable 并回退本变更代码，不保留
Desktop demo/legacy success path或双写数据。已有 conversation/Pi Session/credential 数据不需要
迁移或删除。

## Open Questions

无。P1.4/P1.6/Phase 3 route 的 owner 和当前 unavailable 行为已由 program contract 冻结；
后续 child change 必须显式更新 support matrix 才能启用。
