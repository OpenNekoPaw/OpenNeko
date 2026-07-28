# ADR: Neko Desktop 组合根与开源参考复用边界

状态：Accepted
日期：2026-07-19
更新日期：2026-07-27
范围：实施中的 `apps/neko-desktop`、现有领域子包、Desktop Host bridge、本地媒体运行时、专业工具 handoff/MCP/Computer Use，以及 OpenCode、Zed、Craft Agents、Goose、Kun、Cindy、MiniMax Hub 等外部参考的采用边界。

媒体边界更新（2026-07-27）：Rust Engine 与旧 TypeScript client 已退役。VS Code 当前使用共享 `@neko/media`、Node/FFmpeg、tokenized loopback Range/PCM 与浏览器媒体客户端；拟议 Desktop 必须复用相同 host-neutral ports，并由 [`media-runtime.md`](media-runtime.md)、[`adr-cut-mse-node-ffmpeg-media-runtime-boundary.md`](adr-cut-mse-node-ffmpeg-media-runtime-boundary.md) 与 [`adr-neko-desktop-media-capability-and-security-boundary.md`](adr-neko-desktop-media-capability-and-security-boundary.md) 约束。Desktop 可以替换 VS Code 特有的资源 transport 和 CSP envelope，但不能从 Electron 推断 10-bit/HDR 或广格式 direct playback；不得从历史 ADR 恢复 Rust Engine、NKV、双 adapter 或自动 fallback。

## 背景

OpenNeko 当前发布产品仍只有 `apps/neko-vscode` 和 `apps/neko-tui`；
`apps/neko-desktop` 已按 `bootstrap-neko-desktop-foundation` 开始 Phase 1 实施，但尚未
完成领域接入或发布资格。此前的 Desktop、Workbench Core 与 Market Core 已被删除；
[`adr-neko-desktop-apphost-resource-viewport-boundary.md`](adr-neko-desktop-apphost-resource-viewport-boundary.md)
因此保持 `Superseded`，不得作为恢复旧实现的依据。

新的产品方向希望提供类似 MiniMax Hub 的本地创作客户端：以 Agent 为入口，组合素材、Canvas、Cut、Preview、生成任务、质量检查和导出。Agent 客户端提供了互补经验：OpenCode 展示 Electron、本地 sidecar/server、Server Session 与 window Tab 的生命周期分离；Zed 展示 Project 下并行 Thread 及内置/ACP/Terminal backend adapter 的统一投影；Craft Agents 展示多会话工作区、来源、权限和结果交付 UX；Goose 展示 Electron 客户端通过 ACP 连接 Rust Agent backend；Kun 展示 Renderer 与唯一 `kun serve` HTTP/SSE runtime 分层、需求/设计/计划/实现连续工作流和稳定 Extension API；Cindy 展示多 harness 任务连续性、Desktop/Mobile 控制端分工、插件独立 Electron 沙箱与 capability slot。它们共同证明产品 Shell、会话/Thread、运行时和外部 backend 必须分层，而不是由 active Tab 或一个共享 UI Root 承担全部状态。

Desktop 的内置 Canvas、Cut、Preview、Assets、Character/World surface 只承担 AI 原生的快速生成、组织、预览、轻编辑和审阅。高级剪辑/调色、分层图像、Live2D、3D、游戏工程和复杂节点 workflow 通过稳定导出、直接打开专业工具，以及受控 MCP/API/Computer Use 自动化完成；边界由 [`adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md`](adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md) 定义。不得为了减少 handoff 在 Neko 内复制 DaVinci Resolve、剪映/CapCut、Photoshop、Live2D Cubism、Blender、Unity 或 ComfyUI 的完整功能。

目标 Desktop 的 Home 管理中心、Project Tabs、多会话与 Activity/Attention 投影，以及内容创作、角色 IP、互动世界三类 Project Profile 的 UX 边界由 [`adr-neko-desktop-home-project-profile-ux-boundary.md`](adr-neko-desktop-home-project-profile-ux-boundary.md) 定义。本文不把 MiniMax Hub 的单一 Canvas 形态提升为 OpenNeko 的通用项目模型。

这项工作会跨应用宿主、多个领域包、公共契约与本地媒体运行时边界。若直接复制旧 Desktop、为每个领域新增一套 Desktop 实现，或把任一外部 Agent 客户端当作新运行时基础，都会形成第二套事实来源和长期双路径。竞品事实、来源和不确定性单独记录在 [`../research/desktop-agent-client-architecture-reference-2026-07-22.md`](../research/desktop-agent-client-architecture-reference-2026-07-22.md)。

## 决策

### 1. 在当前 monorepo 新增应用，不新增独立仓库

新增 `apps/neko-desktop` 作为第三个明确的 composition root，使用 Electron 承载 MVP。
它与 VS Code、TUI 并列，不取代现有应用，也不恢复已经删除的 `neko-home`、Workbench
Core 或旧 Desktop 源码。

不新增独立仓库，原因是 Desktop 需要与现有类型、领域包、媒体 ports 和质量门禁原子演进。拆仓会过早引入跨仓版本发布、契约同步和集成测试成本，并鼓励复制公共实现。

只有出现以下真实边界时，才重新评估拆仓：

- 独立团队和独立发布节奏已经成为持续约束；
- 许可证、供应链或发布权限要求物理隔离；
- Desktop 已形成稳定公共 SDK，且可以只依赖版本化契约而不依赖 monorepo 原子修改。

### 2. Desktop 只拥有宿主与组合职责

`apps/neko-desktop` 拥有：

- Electron main、preload、renderer 的启动与生命周期；
- 窗口、菜单、文件对话框、系统通知、深链、密钥链、更新和桌面打包；
- typed IPC、权限检查、workspace 打开流程和显式依赖组合；
- Desktop 导航、布局和跨领域展示投影。

它不得拥有 Agent、素材、实体、Canvas、Cut、Preview、搜索、Skill 或媒体领域真值，不得从功能包导入私有实现。领域能力继续由 owning package 提供 host-neutral contract、service 或 UI root；Desktop 只注入 Host ports 并组合公共入口。

推荐调用链为：

```text
Desktop renderer
  -> typed preload IPC
  -> Desktop AppHost / application services
  -> host-neutral domain service or media port
  -> package-owned fact / Node-FFmpeg media execution
```

renderer 不得直接访问 Node.js、Electron main API 或 VS Code API。preload 只暴露最小、版本化、可验证的能力；未知 channel、未知 schema/version、无效 sender 或 instance identity 必须 fail-visible。

### 3. 复用现有子包，不复制领域实现

Desktop 优先复用以下公共能力：

| 能力                               | Canonical owner                                                        | Desktop 复用方式                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Agent、会话、模型、Skill、工具编排 | `packages/neko-agent`                                                  | 复用 Pi runtime、`AgentHostRuntimeAdapter` 和公共 Web UI root；实现 Electron adapter                     |
| Canvas 项目事实与交互              | `packages/neko-canvas`                                                 | 保留 `.nkc` 与 Canvas domain 为真值；把完整 UI root 的 VS Code message 依赖改为注入式 host adapter       |
| Cut 时间线与编辑                   | `packages/neko-cut`                                                    | 以 `.otio`、Cut Core command 和派生执行计划为真值；通过 host-neutral authoring/runtime contract 接入     |
| 素材、实体与搜索                   | `packages/neko-assets`、`packages/neko-entity`、`packages/neko-search` | 复用 domain service 与 DTO；为 Desktop 组合 React 素材管理面，不复用 VS Code TreeView 宿主实现           |
| Preview                            | `packages/neko-preview`                                                | 保留只读投影职责；把完整 root 的宿主通信抽到 adapter                                                     |
| Host、UI 与基础能力                | `packages/neko-host`、`packages/neko-ui`、`packages/neko-types`        | 扩展现有公共 ports/primitives，不在 Desktop 建第二套 host framework、design system、i18n、日志或错误类型 |
| 媒体执行与跨层契约                 | `packages/neko-media`、领域窄 ports、`packages/neko-proto`             | 复用 Node/FFmpeg 与浏览器媒体客户端；Desktop 只新增 secure custom protocol transport 与 capability projection，不恢复旧 Engine/client |
| 专业工具 handoff、MCP 与 Computer Use | owning domain export、Desktop Host、`packages/neko-agent` Tool Call/MCP、现有 External Processor | 领域 owner 冻结 revision/导出，Desktop 发现并启动应用；Agent 复用唯一 Tool Call/MCP，Computer Use 由 Host 受控执行；GUI app 不冒充 External Processor |

当前复用成熟度不同：Agent Web UI 已存在 `AgentHostRuntimeAdapter` 与 `electron` host kind，可作为第一阶段入口；Canvas、Cut、Preview 的完整 UI root 仍有较强 VS Code `postMessage` 耦合；Assets 的主要宿主 UI 仍偏向 VS Code TreeView。后两类必须先完成宿主适配器和公共入口收敛，不能在 Desktop 中复制一套平行实现。

当前代码证据、耦合规模和逐包缺口记录在日期化状态快照 [`../status/2026-07-22-desktop-host-adapter-reuse-gap.md`](../status/2026-07-22-desktop-host-adapter-reuse-gap.md)，不在本 ADR 固化会随实现变化的文件数量或完成度。

`packages/neko-host/src/application.ts` 中残留的 `neko-home` application id 属于待审计的旧契约。Desktop 实施时应通过 OpenSpec 明确替换或删除策略，不得把它静默映射为 `neko-desktop`，也不得保留双别名 fallback。

#### 3.1 VS Code 与 Desktop 是同级宿主适配器

Desktop 不复用 VS Code Extension 实现；两种客户端通过各自 adapter 复用同一 host-neutral core、公共 UI root 和领域 contract：

```text
VS Code Webview ----VS Code UI transport----+
                                              -> domain host controller -> domain core / media port
Desktop renderer ---Electron UI transport---+

VS Code Extension ----VS Code Host ports----+
Desktop AppHost -------Electron Host ports--+
```

必须区分三类 adapter：

1. `NekoHostPorts` 一类宿主能力 port，拥有文件、路径、workspace、trust、secret、external 和 diagnostic；
2. Agent、Canvas、Cut、Preview、Assets 各自的 domain application adapter/controller，拥有领域 operation 编排和生命周期；
3. renderer/Webview 的 UI transport adapter，负责版本化消息、subscription 和可恢复展示状态。

不得用一个万能 `HostAdapter` 同时拥有宿主 IO、领域业务、UI transport 和运行时状态。现有 VS Code Extension 保持各领域的 VS Code adapter 与发布入口；`apps/neko-desktop` 只能依赖 package public entry，不得导入 Extension 私有实现。

完整 UI root 的目标契约是依赖注入：VS Code bootstrap 注入 VS Code transport/domain adapter，Desktop bootstrap 注入 Electron transport/domain adapter。Host-specific 副作用留在 adapter；Root、presenter、store 中的领域状态和 operation contract 保持唯一。现有 `CreativeHostAdapterSurface` 只可作为布局/投影 primitive，不得被当作 Canvas、Cut 或 Preview 已完成的功能 adapter。

### 4. OpenCode、Zed、Craft Agents 与 Goose 提供分层参考，不是代码基座

四者分别映射到不同边界，不合并成一套外部框架：

| 项目         | 采用层级                                     | OpenNeko 落点                                                                                                              | 明确排除                                                                                            |
| ------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| OpenCode     | 宿主、会话/Tab 生命周期与测试参考            | `apps/neko-desktop` 的 sidecar supervisor、health、退出清理、terminal transport、server session/window tab 分层和 timeline | OpenCode server、store、SolidJS UI 和内部 package 不成为依赖；目录/VCS 不成为 Neko Project identity |
| Zed          | Project/Thread 与 Agent backend adapter 参考 | Project 分组的 Conversation projection、并行 runtime 状态、统一 native/ACP/terminal backend slot                           | 不采用 Zed editor/worktree 产品骨架，不把 Thread 类型变成 Project Profile，不增加第二套内部 runtime |
| Craft Agents | 主要 Desktop Agent UX 参考                   | Home Inbox、workspace/source onboarding、权限模式、后台任务、结果/变更/预览审阅                                            | 不复制其 Agent runtime、credential、session/source store、remote control plane                      |
| Goose        | 协议与外部 backend 参考                      | ACP adapter 和 MCP App 的独立 spike 候选                                                                                   | Goose Rust Agent Core 不进入媒体运行时；ACP 不替换内部 contract                                     |

#### 4.1 OpenCode 提供 Desktop Host 与 Session/View 分层经验

采用其 sidecar spawn/readiness/stop/relaunch、loopback health、深链、窗口恢复、terminal transport、session timeline 增量投影和实例隔离测试经验；同时采用 Server Session、window-scoped SessionTab、session-internal result/file tab、child/fork/abort/delete operation 相互分离的设计原则。这些能力必须按 Neko typed IPC、Host ports、Logger、Errors 和生命周期 contract 实现；不直接依赖 `@opencode-ai/*`，不引入第二套 server、session store、provider 或插件 runtime。

OpenNeko 对应关系不是一一照搬：`ConversationId` 是持久讨论身份，Host-owned `ConversationRuntime` 是运行实例，`AgentRunId` 是一次执行，`ConversationViewId` 是窗口投影。关闭 view 只 detach；abort、archive、delete 和取消 owning-domain Job/Run 必须是不同 operation。OpenCode child session 只说明 delegation 需要 identity；OpenNeko subagent 默认保持父 Conversation 下的 child run，不自动创建用户顶层 Conversation 或 Project Tab。

#### 4.2 Zed 提供 Project/Thread/backend adapter 经验

采用其一个 Thread shell 可投影内置 Agent、ACP External Agent 和 Terminal CLI，同时每个 Thread 独立拥有 context、history、运行状态并按 Project 分组的设计经验。它说明产品级 Conversation 可以绑定不同 `AgentBackendPort` 实现，但 Project、Conversation catalog、权限投影和 UI lifecycle 仍由产品 Host 拥有。

OpenNeko MVP 继续以 Pi adapter 为唯一内部 canonical path。ACP 或 Terminal backend 只有通过独立 OpenSpec、兼容性和生命周期验证后才能成为可选 adapter；UI 能同时展示多个 backend 不构成复制多套 AgentSession、Skill、Tool、Task 或 transcript contract 的理由。Zed 的 editor、worktree 和 code-review 工作流只作 UX 参考，不进入 Desktop composition root。

#### 4.3 Craft Agents 只提供 Agent 工作台 UX 经验

采用其设计经验：

- 多会话 inbox 与可见的后台任务状态；
- workspace/source onboarding；
- Explore、Ask、Execute 等渐进权限模式；
- deep link、CLI/headless 入口与桌面会话联动；
- main/preload/renderer 的安全分层；
- Agent 会话作为跨创作能力的统一入口。

不采用其产品内部事实和运行时组合：

- 不引入 Claude Agent SDK 与 Pi 双运行时；OpenNeko 继续以 Pi 为唯一 Agent canonical path；
- 不复制其 JSON/JSONL、credential、source 或 session 存储模型；OpenNeko 继续使用自身的 SQLite、Pi Session、`ResourceRef` 与 `HostSecretPort` 边界；
- 不引入 Bun 或第二套 UI/design system；
- 不把会话展示状态升级为 Canvas、Cut、任务或项目事实；
- MVP 不引入远程 server/control plane 或 thin-client 架构。

Craft Agents 采用 Apache-2.0 并不意味着可以整体 fork。任何选择性代码复用仍必须逐文件审计许可证、NOTICE、依赖、安全边界和 owning responsibility；无法与 OpenNeko canonical path 对齐的实现只作设计参考。

#### 4.4 Goose 只提供 ACP 与 MCP App 边界参考

Goose 的 Electron/React 客户端启动 Rust CLI 并通过 ACP server 连接 runtime，证明 Agent backend 可以与产品 Shell 解耦。OpenNeko 可以在未来独立 OpenSpec 和 spike 中评估 `AgentBackendPort`/ACP adapter，使外部 Agent backend 作为可选实现接入；Pi adapter 仍是默认且唯一的内部 canonical path。

ACP 不替换以下契约：

- Desktop renderer 与 preload/main 之间的 typed IPC；
- `packages/neko-agent` 内部 session、workflow、Skill 和 capability contract；
- 媒体 ports、短生命周期 descriptor 和二进制数据路径；
- Content、Character、World 的项目事实、run 或 save contract。

Goose Rust Agent runtime 不得合入 `packages/neko-media`。MCP App 只能进入受控 conversation result、Context Dock 或明确 editor surface，并继续接受 Host trust、permission、CSP 和资源授权。

### 5. MiniMax Hub 是产品能力参考，不是架构模板

MiniMax Hub 用于校准用户体验：桌面创作指挥中心、多 Agent 创意流程、Canvas、Skill、本地素材、质量检查和导出闭环。它不提供 OpenNeko 内部契约的事实来源，也不构成引入云端控制面、多租户、私有协议或未知数据模型的理由。

OpenNeko 只采用其“Home 入口与管理、顶部项目工作集、项目内创作工作台”的宏观层级。内容创作、角色 IP 和互动世界分别拥有闭合 Project Profile；角色调试和世界体验不能作为 Canvas 节点类型或插件面板绕过自己的项目事实与运行生命周期。

Desktop MVP 仍遵守本地产品边界：workspace、本地文件、Host 权限、Pi runtime，以及各领域 ADR 明确要求的本地 Node/FFmpeg/Host runtime 组成 canonical path。用户已安装的专业工具可以通过版本化 integration contribution、durable exchange bundle 与 MCP/API/Computer Use adapter 进入，但不能成为 Neko 项目事实、隐式 active target、任意桌面控制或任意 shell 入口。商业云服务、团队协作、市场和远程同步若进入范围，应分别提出新变更。

### 6. 开源组件按“直接采用、协议参考、交互参考”分级

| 项目                       | 决策               | 边界                                                                                            |
| -------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| Electron Forge             | 优先直接采用       | 用于 Electron 打包、发布和 native module rebuild；最终选择仍需通过实施 OpenSpec 和平台 spike    |
| Electron Security Guidance | 必须落实           | `contextIsolation`、sandbox、CSP、最小 preload API、sender 校验和安全自定义协议是宿主基线       |
| Playwright Electron        | 评估后采用         | 用于 Desktop 运行态 E2E；其 Electron 支持状态要求同时保留 IPC/contract 测试，不能只靠 UI 自动化 |
| OpenTimelineIO             | Cut 工程协议       | Cut 以受限 OTIO profile 作为唯一项目真值；MVP 不要求嵌入其 Python/C++ runtime                   |
| Agent Skills               | 格式参考并保持兼容 | 用于开放 Skill 可移植格式；Neko overlay、trust 和 capability 仍由现有 Agent 边界拥有            |
| ComfyUI                    | 外部专业工作流集成 | 可通过 Launch、经验证 HTTP/MCP adapter 和 Generation/External Processor output ownership 接入；其 workflow/queue 不成为 Canvas 或项目事实 |
| React Flow                 | 技术 spike 候选    | 只评估图交互、可访问性与自动布局；未经 Canvas 架构和性能 spike 不替换现有 Canvas                |
| pi-mono                    | 上游模式参考       | 参考 session、subagent 与工具模式；OpenNeko 已有 Pi canonical path，不建立第二个 Agent runtime  |
| Kun                        | 架构/UX 参考       | 参考单本地 runtime、HTTP/SSE 投影、需求到验收连续性、project MCP digest trust 和 Extension Host/Broker；不采用 Code/Design/Write Profile、`.kunx`、Direct DOM、Kun runtime 或非商业许可代码 |
| Cindy                      | 架构/UX 参考       | 参考 harness-independent task continuity、插件进程/partition 隔离、capability slot、device allowlist 和结构化 Agent↔Plugin UI；不采用多主 Agent、未开源 backend 或未验证通用桌面控制 |
| Agent Client Protocol      | 技术 spike 候选    | 仅用于未来可选外部 Agent backend adapter；不替换内部 Agent、Desktop IPC 或媒体 ports            |
| MCP Apps                   | 技术 spike 候选    | 用于受控 inline result、Context Dock 或 editor surface；不得向 Shell 任意贡献 UI                |
| VS Code / Code OSS         | UX 参考            | 参考命令面板、快捷键和工作区体验；不 fork Code OSS 作为 Desktop 基座                            |

### 7. 每个 runtime instance 独立拥有状态

每个 Desktop window、Project Tab、Conversation、Conversation view、Agent run、Tool Call、Canvas document、Cut document、media session 和 owning-domain Job/Run 必须有显式 identity 与独立生命周期。active tab、active conversation 或当前 workspace 只选择展示投影，不得充当共享可变状态 owner，也不得通过全局单例切换参数模拟多实例。

Host runtime registry 默认按 `(projectId, conversationId)` 拥有一个 `ConversationRuntime`；同一 Window 内重复打开 Conversation 聚焦已有 view，跨 Window 的多个 view 订阅同一 runtime 与 transcript projection。renderer/view 只拥有滚动、选择、布局和临时输入等展示状态，关闭 view 不终止 runtime、Agent run 或 owning-domain Job/Run。多进程窗口若无法共享内存，必须通过单一 Host owner 和显式消息传递协调，不得按窗口复制 AgentSession。

Subagent/delegation 使用父 Conversation 下的 child `AgentRunId`；生成、导出、导入、角色互动和世界运行分别使用 Generation、Cut、Assets、Chara、World 等 owning domain 的 Job/Run identity。不存在通用 `BackgroundWorkId` 或跨领域 Task command router。任何执行都不得通过创建隐藏 Conversation 或复用 Tab identity 获得生命周期；只有显式“在新会话继续”或 needs-review promotion 才创建新的 Conversation identity。

跨实例 operation 和 event 必须携带 identity；缺失、陈旧或不匹配时直接返回 diagnostic。此约束同时适用于 Electron IPC、Agent adapter、domain authoring 和 media adapter。

### 8. Renderer 使用按 authority 分层的 store，不建立全局 Desktop 真值 store

React、Zustand 或其他状态库只解决订阅和更新，不自动解决所有权、消息乱序或异步竞态。
Desktop 前端必须先按 authority 和生命周期拆分状态，再选择具体 store：

| 状态层 | live owner | Renderer 中的形态 | 持久化与写入 |
| --- | --- | --- | --- |
| Project、Conversation、Agent Run、Tool Call、领域 Job/Run、文档事实 | AppHost / owning domain | 按 owner identity 建立的只读 replica | 只经 owning public port 写入；Renderer 不直接修改 |
| Project catalog、Activity/Attention、badge、权限与可用能力 | AppHost projection service | normalized projection cache | Host 生成带 revision 的摘要；Renderer 不从已打开页面反推 |
| Window layout、Project Tabs、dock 与打开的 view binding | Window application service | `WindowId` scoped replica + pending intent | Host 按 revision/CAS 持久化；每个 Window 独立 |
| 输入草稿、滚动、选择、viewport、临时展开状态 | `ConversationViewId` / `SurfaceViewId` | view-scoped store | Renderer live-owned；只持久化明确允许恢复的字段和 schema version |
| hover、popover、drag preview、composition 等瞬时交互 | React component | component-local state/ref | 不持久化，不进入跨窗口协议 |
| 插件私有 UI | 插件 sandbox process/Webview | 插件命名空间内的私有 store | 只能通过 capability/contribution bridge 提交 intent |

因此不得创建同时保存项目事实、运行状态、打开 Tab、当前文档、插件数据和媒体 session 的
`desktopStore`。`activeProjectTabId`、`activeConversationViewId` 只选择要读取的 replica；
异步 handler 在发起时捕获完整 target identity，`await` 后不得重新读取 active selection
并据此决定写入目标。

`WindowStore` 和 `ViewStore` 应使用 factory/context 按 identity 创建，而不是通过一个模块级
Zustand singleton 切换参数模拟多窗口。状态更新使用不可变 snapshot、纯 reducer 和精确
selector；React 通过 `useSyncExternalStore` 或等价一致性契约订阅。开发期 StrictMode 的
重复 mount/unmount 必须由幂等 `subscribe/dispose` 支持，不得因此重复 attach、提交 command
或启动后台执行。

### 9. Host projection 使用 snapshot-first attachment 和逐 owner 有序流

Desktop 不要求所有领域共享一个全局事件序列。每个 owner projection 独立有序，组合摘要由
Host 生成自己的 revision；跨领域 UI 不按“最后到达时间”拼出业务真值。

```text
Host owner / projection service
  -> attach(ownerRef, windowId, viewId, attachmentId, endpointEpoch)
  -> authoritative snapshot(sequence = 0, projectionRevision)
  <- snapshot acknowledgement
  -> patch(sequence = 1..n, baseRevision -> revision)

Renderer
  -> immutable replica keyed by ownerRef + attachment identity
  -> pure reducer
  -> selectors / UI
```

attachment 至少绑定 `endpointEpoch`、`attachmentId`、`WindowId`、`ViewId` 和准确
owner ref。snapshot 必须和后续事件缓冲建立原子边界，避免“先读 snapshot、后订阅”丢失
中间更新。Renderer 只接受当前 attachment：

- snapshot 之前收到 patch、sequence 跳号、base revision 不匹配、未知 schema/event 或
  owner identity 不匹配时，attachment 进入明确 fatal diagnostic 并重新获取 snapshot；
- 旧 endpoint/view epoch 的迟到 frame 被拒绝，不能写入新打开的同名 Tab；
- terminal state 和 revision 不得因 progress 节流丢失；高频媒体/Computer Use observation
  可以合并展示，但不能改变 owner 事件顺序；
- 关闭 view 只 detach subscription、销毁 view store 并失效其 epoch；是否取消执行仍由
  显式 Stop/Cancel 和 owning lifecycle 决定；
- Renderer reload/crash 从 Host snapshot 恢复，不把持久化 Zustand cache 当成 runtime 真值。

当前 Agent Webview 已有可复用的协议原型：`ProjectionAttachmentKey`、snapshot
acknowledgement、连续 frame sequence、`baseProjectionVersion`、endpoint replacement 和
fatal 后重附着；Conversation replica 还会拒绝 owner、turn/run/message 和 item revision
不匹配。Desktop 实施应先审计并提取其中 host-neutral 的 attachment/revision primitive，
再让 Agent、Activity 和领域 projection 各自定义 payload；不得复制一套语义相近但字段和
恢复策略不同的 Desktop event bridge，也不得把 Agent 私有 timeline schema 提升为所有领域
的统一事件模型。

### 10. Command 与异步 UI effect 使用显式目标、CAS 和 intent overlay

typed IPC 的公共 envelope 只负责 transport identity，不成为跨领域 command router。每个
command 仍由 owning application service 处理，但至少携带：

- 唯一 `commandId` / idempotency key；
- 发起它的 `WindowId`、`ViewId` 与 view/endpoint epoch；
- 准确 Project、Conversation、Run、Tool Call、Document、Job 或 external target ref；
- 对会改变事实的操作携带 `expectedRevision`，Computer Use 还携带 target binding epoch
  和 observation revision；
- 可观测的 accepted、committed 或 rejected diagnostic，不能只返回无上下文 boolean。

Renderer 不先改 authoritative replica。允许乐观显示时，使用按 `commandId` 隔离的
`pendingIntents` overlay；Host patch 到达后再确认或撤销。输入框、选中态和拖拽预览等纯
view-local 状态可以立即更新；项目保存、候选 accept、导出、WorldAction、专业工具
round-trip 和 Computer Use mutation 不得用前端 last-write-wins 伪造成功。

具体竞态处理如下：

| 竞态 | 必须行为 |
| --- | --- |
| 点击 A 后立即切到 B，A 的异步响应最后返回 | response 只匹配捕获的 owner/view epoch；不得写入当前 active B |
| 两个 Window 同时改可持久布局或项目事实 | Host 使用 expected revision/CAS；冲突返回 typed diagnostic，由 owner 决定 merge/reload |
| 自动保存期间继续输入 | 每个 view 保留 `baseRevision`，coalesce 为 single-flight latest intent；旧保存完成不能清除新 dirty state |
| 重复提交、IPC retry 或 outcome unknown | 以 command id/idempotency key 去重；没有稳定外部 identity 时不自动重提付费或有副作用操作 |
| component unmount 或 renderer abort fetch | 只取消本地等待；已经由 Host 接受的运行必须用精确 owner identity 显式取消 |
| view 关闭后迟到 callback/timer/worker message | view epoch 与 disposal token 失配后拒绝更新，并释放 listener、timer、object URL 与 media handle |

### 11. Attention、Computer Use 与插件遵守同一竞态边界

Project Tab badge 和 Home Activity 由 Host 维护独立摘要 projection，事件同时携带 owner ref
和 projection revision。前端不得遍历当前已加载的 Conversation/Job store 计算全局
running/needs-review 数量，否则关闭 Tab、分页、断线或跨窗口时必然出现漏计和闪烁。

Computer Use session 额外绑定 `toolCallId`、target app/process/window/document 与
`targetEpoch`。焦点目标变化、用户 Take over、应用重启或文档切换都会推进 target epoch；
旧 observation 上排队但尚未提交的动作必须被拒绝。Approval 绑定 action、target epoch 和
observation revision，执行前由 Host 再校验；截图、OCR 和鼠标位置只是 observation，不是
项目事实，也不能因前端仍显示旧画面而继续执行。

插件 panel 不得拿到 Shell store 引用或直接 dispatch 领域 reducer。插件进程/Webview 只能
通过版本化 contribution/capability bridge 读取最小 projection 并提交 intent；Main 根据
真实 `webContents`/partition 反查插件身份。插件卸载、崩溃或权限撤销时，Host 失效其
attachment/capability epoch，拒绝所有迟到消息并释放订阅。

## 五层分析

职责：Desktop 负责宿主和组合；领域包负责事实与操作；Node/FFmpeg 或 Host runtime 只负责各领域明确委托的媒体执行；公共包负责稳定跨层契约。Cut 的 OTIO、命令和执行计划不归媒体 adapter。

依赖：renderer 只能依赖浏览器安全的公共入口；preload 依赖 Electron 并暴露窄桥；main 依赖 Host/application service 但不依赖 React；功能包之间不直接导入私有实现。

接口：先定义 Desktop application id、Host ports、IPC schema/version、instance identity、domain adapter 和 lifecycle/error contract，再接具体 UI。媒体 descriptor 由 `@neko/media`/领域 ports 定义；Proto 只保留仍有真实跨层消费者的静态领域契约。

扩展：新领域通过公共 capability 或 domain adapter 接入；新宿主通过实现相同 ports 接入。只有出现第二个真实实现或稳定变化点时才新增 registry/factory，不预建插件平台。

测试：对生产者、消费者、IPC、实例隔离、资源释放和用户路径分层验证，并证明 Desktop 命中新的 canonical path、不会回退旧 `neko-home` 或 VS Code message 路径。

## 实施门槛与阶段

本 ADR 不授权直接开发。实施前必须创建新的 OpenSpec change，限定迁移范围、公共契约、旧数据处置、任务拆分和验收标准。

开发顺序固定为三个阶段，详细切片与完成门禁见
[`../../ROADMAP_CN.md`](../../ROADMAP_CN.md)：

1. **前端界面与现有子包接入**：定义 application/Window/Project/View contract、Electron
   安全模型、typed IPC 和 projection attachment；建立 `apps/neko-desktop`，依次接入
   Agent、Assets/Content/Media Library、Canvas、Cut、Preview/Media、Generation/Quality、
   Chara/Entity 与 Tools/Diagnostics 的真实公共路径。缺失 Character/World 能力保持
   unavailable，不允许 mock/no-op 页面冒充完成。
2. **跨平台资格验证**：在第一阶段唯一 canonical implementation 上分别验证
   `darwin-arm64`、`linux-x64` 和拟议 `win32-x64` 的打包、安装、签名/更新、Host adapter、
   native/FFmpeg、GPU/媒体与真实创作路径。Windows 当前仍 deferred，必须通过独立
   platform-contract OpenSpec 和真实 Windows 证据后才可加入发布闭集。
3. **MCP、插件与专业工具**：复用唯一 MCP Manager、Agent Tool Call/Approval 和 capability
   catalog，建立受控插件进程/Webview/contribution contract；按 ComfyUI、NLE、
   Blender、Unity、Photoshop、Live2D 等独立适配器交付 Discover/Launch、
   Export-and-Open、MCP/API、显式 Computer Use 和 round-trip capability。

商业云、Marketplace、团队协作、远程 server 和 native professional viewport 不随 Desktop shell 自动进入 MVP；每项需要独立的职责与契约决策。

## 验证要求

实施至少覆盖：

- Desktop main/preload/renderer 的 typecheck、build 和 package 测试；
- 架构测试阻止 renderer 导入 Node/Electron/VS Code 与包内部实现，阻止 main 导入 React；
- IPC schema/version、unknown channel、sender validation、取消、资源释放和 instance identity 测试；
- projection attachment 的 snapshot/ack、sequence gap、base revision、endpoint/view epoch、
  duplicate/stale frame、fatal reattach 与跨窗口同 owner 订阅测试；
- 异步 command 的 target capture、expected revision、idempotency、pending intent reconcile、
  autosave single-flight、Tab 快速切换/关闭后的迟到响应测试；
- React StrictMode 重复 mount/unmount 不产生双订阅、双 command 或后台执行；Project badge
  和 Home Activity 在分页、关闭 Tab、renderer reload 与多窗口下仍来自 Host 摘要 projection；
- 使用隔离 fixture 的 Playwright Electron 运行态场景：启动、workspace、Agent session、Canvas/Cut/Preview、media session lifecycle 与退出清理；
- Desktop 媒体按精确 Electron/Chromium、OS、架构、GPU、显示器和 FFmpeg 构建验证 custom protocol Range、direct/MSE/PCM、SDR baseline 与显式 proxy；HDR/10-bit 只能由真实输出链证据接受，不能由“可播放”或 screenshot 接受；
- CSP/security 场景证明 renderer 保持 sandbox、context isolation、`webSecurity`，custom scheme 不启用 `bypassCSP`，并拒绝 `file://`、任意路径、任意 localhost 与未知 token；
- 专业工具场景证明 frozen revision、durable exchange bundle、明确 target app/version、无 shell 注入、应用缺失/版本不兼容 diagnostic、MCP/Computer Use explicit document/session/window identity、mutation evidence 和显式 round-trip review；
- UI “Open in…” 与 Agent automation 必须命中同一 Professional Tool application service；Computer Use 复用唯一 Tool Call/Approval，支持 Pause/Stop/Take over，GUI app 不进入 External Processor runner，MCP 不创建第二套 manager；
- Agent prompt、Skill、provider、tool routing 或 AgentSession 行为变化的聚焦真实 evaluation；
- 生产者与消费者测试，以及仓库级 `pnpm build`、`pnpm test`、`pnpm check`；
- 第一阶段参考平台和第二阶段各资格平台的签名/打包、安装、更新与 native module 验证；
  当前发布闭集仍为 `darwin-arm64`、`linux-x64`，Windows 只有独立平台契约与真实 Windows
  证据通过后才能加入；
- 第三阶段分别验证插件 lifecycle、MCP trust/digest 和每个专业工具 adapter 声明的平台、
  软件版本、capability level、失败诊断与 round-trip，不以一个工具的成功替代整个 catalog。

UI E2E 不得读取真实用户 workspace、凭据或本机私有配置。Playwright Electron 不能替代 VS Code 特有功能的 Extension Development Host 验证，也不能替代 Node/FFmpeg 媒体集成测试。

## 后果

- Desktop 与现有应用共享同一领域模型和基础设施，公共契约可以原子演进。
- 初始工作量主要是宿主解耦与 composition，而不是重写领域能力。
- Agent 可较早接入；Canvas、Cut、Preview 和 Assets 需要明确的跨宿主改造，不能承诺零成本复用。
- Electron 带来更直接的桌面生态与测试路径，同时增加供应链、安全、签名、更新和多平台发布责任。
- OpenCode、Zed、Craft Agents、Goose、Kun、Cindy 与 MiniMax Hub 提供互补参考，但不会形成第二个 Agent runtime、存储模型、Desktop framework 或远程架构。

## 被拒绝的方案

- 新建独立仓库并复制现有子包：拒绝，因契约与版本漂移成本过高。
- 恢复旧 Desktop/Workbench Core/neko-home：拒绝，因其已被现行架构显式删除和取代。
- 直接 fork OpenCode、Zed、Craft Agents 或 Goose：拒绝，因 runtime、存储、UI 技术栈和产品事实边界不一致。
- 把 ACP 作为内部统一协议：拒绝，因 Desktop IPC、Neko Agent contract、媒体 ports 和项目格式拥有不同职责与错误模型。
- 把 Goose Rust Agent Core 合入媒体运行时：拒绝，因 Agent orchestration 与媒体计算不是同一 owning responsibility。
- 直接把 VS Code Webview 包进 Electron：拒绝，因它保留错误的宿主依赖并绕过 typed Desktop bridge。
- 同时引入 Claude SDK、LangGraph、CrewAI 或 AutoGen：拒绝，因 Pi 已是唯一 Agent canonical path。
- 复制 Kun 的 Code/Design/Write 顶级模式或 Cindy 的通用 workspace/plugin 容器：拒绝，
  因 OpenNeko 的产品事实必须由 Content、Character、World 与专业工具 handoff owner 管理。
- 为追求 Cindy 式 harness 切换建立多个内部主 Agent：拒绝，任务连续性可以由稳定
  Conversation/Tool Call/adapter 投影实现，不需要破坏 Pi single authority。
- MVP 先建远程 server/control plane：拒绝，因当前产品是本地客户端 + 本地 Node/FFmpeg 媒体运行时，没有真实分布式边界。

## 参考

仓库内：

- [`application-composition.md`](application-composition.md)
- [`client-targets.md`](client-targets.md)
- [`package-boundaries.md`](package-boundaries.md)
- [`adr-pi-agent-runtime.md`](adr-pi-agent-runtime.md)
- [`adr-agent-runtime-architecture-comparison-boundary.md`](adr-agent-runtime-architecture-comparison-boundary.md)
- [`adr-neko-desktop-home-project-profile-ux-boundary.md`](adr-neko-desktop-home-project-profile-ux-boundary.md)
- [`adr-neko-desktop-media-capability-and-security-boundary.md`](adr-neko-desktop-media-capability-and-security-boundary.md)
- [`adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md`](adr-neko-desktop-professional-tool-handoff-and-mcp-boundary.md)
- [`adr-neko-desktop-apphost-resource-viewport-boundary.md`](adr-neko-desktop-apphost-resource-viewport-boundary.md)（历史、已取代）
- [`../research/desktop-agent-client-architecture-reference-2026-07-22.md`](../research/desktop-agent-client-architecture-reference-2026-07-22.md)
- [`../status/2026-07-22-desktop-host-adapter-reuse-gap.md`](../status/2026-07-22-desktop-host-adapter-reuse-gap.md)

外部调研快照（OpenCode/Zed/Craft/Goose 核对日期为 2026-07-22；Kun/Cindy 核对日期为
2026-07-27；外部项目能力与许可可能变化，实施时需重新核验）：

- [OpenCode](https://github.com/anomalyco/opencode)
- [Zed Agents](https://zed.dev/docs/ai/agents) 与 [Parallel Agents](https://zed.dev/docs/ai/parallel-agents)
- [Craft Agents 文档](https://agents.craft.do/docs/getting-started/introduction) 与 [Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss)
- [Goose](https://github.com/aaif-goose/goose)
- [Kun](https://github.com/KunAgent/Kun)、[单运行时架构](https://github.com/KunAgent/Kun/blob/master/docs/kun-architecture.md) 与 [Extension v1](https://github.com/KunAgent/Kun/blob/master/docs/extensions/README.md)
- [Cindy](https://github.com/makecindy/cindy)、[核心产品原则](https://github.com/makecindy/cindy/blob/main/docs/product-rules/core-product-principles.md) 与 [插件安全](https://github.com/makecindy/cindy/blob/main/docs/dev-rules/plugin-security-and-authoring.md)
- [MiniMax Hub](https://hub.minimaxi.com/)
- [Electron Forge](https://github.com/electron/forge) 与 [Electron Security Guidance](https://www.electronjs.org/docs/latest/tutorial/security)
- [Playwright Electron](https://playwright.dev/docs/api/class-electron)
- [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO)
- [Agent Skills](https://github.com/agentskills/agentskills)
- [ComfyUI](https://github.com/comfy-org/comfyui)
- [React Flow](https://reactflow.dev/)
- [pi-mono](https://github.com/badlogic/pi-mono)
