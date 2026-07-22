# ADR: Neko Desktop 组合根与开源参考复用边界

状态：Proposed
日期：2026-07-19
更新日期：2026-07-22
范围：拟议中的 `apps/neko-desktop`、现有领域子包、Desktop Host bridge、Rust Engine，以及 OpenCode、Zed、Craft Agents、Goose、MiniMax Hub 等外部参考的采用边界。

Cut 范围说明（2026-07-22）：当前 Cut 轻量化变更只处理 VS Code 的 OTIO 工程和 Engine adapter，不决定 Desktop Cut 的预览、音频或导出实现。Desktop Cut 媒体路径必须由后续独立 ADR/OpenSpec 定义，不得从 [`adr-cut-otio-vscode-media-runtime-boundary.md`](adr-cut-otio-vscode-media-runtime-boundary.md) 推断。本文其他 Desktop composition、Agent、项目壳和 host adapter 决策继续有效。

## 背景

OpenNeko 当前只有 `apps/neko-vscode` 和 `apps/neko-tui` 两个应用组合根，系统文档也只把 VS Code 与 TUI 描述为现行客户端。此前的 Desktop、Workbench Core 与 Market Core 已被删除；[`adr-neko-desktop-apphost-resource-viewport-boundary.md`](adr-neko-desktop-apphost-resource-viewport-boundary.md) 因此保持 `Superseded`，不得作为恢复旧实现的依据。

新的产品方向希望提供类似 MiniMax Hub 的本地创作客户端：以 Agent 为入口，组合素材、Canvas、Cut、Preview、生成任务、质量检查和导出。Agent 客户端提供了互补经验：OpenCode 展示 Electron、本地 sidecar/server、Server Session 与 window Tab 的生命周期分离；Zed 展示 Project 下并行 Thread 及内置/ACP/Terminal backend adapter 的统一投影；Craft Agents 展示多会话工作区、来源、权限和结果交付 UX；Goose 展示 Electron 客户端通过 ACP 连接 Rust Agent backend。它们共同证明产品 Shell、会话/Thread、运行时和 Agent backend 必须分层，而不是由 active Tab 或一个共享 UI Root 承担全部状态。

目标 Desktop 的 Home 管理中心、Project Tabs、多会话与任务投影，以及内容创作、角色 IP、互动世界三类 Project Profile 的 UX 边界由 [`adr-neko-desktop-home-project-profile-ux-boundary.md`](adr-neko-desktop-home-project-profile-ux-boundary.md) 定义。本文不把 MiniMax Hub 的单一 Canvas 形态提升为 OpenNeko 的通用项目模型。

这项工作会跨应用宿主、多个领域包、公共契约与 Engine 边界。若直接复制旧 Desktop、为每个领域新增一套 Desktop 实现，或把任一外部 Agent 客户端当作新运行时基础，都会形成第二套事实来源和长期双路径。竞品事实、来源和不确定性单独记录在 [`../research/desktop-agent-client-architecture-reference-2026-07-22.md`](../research/desktop-agent-client-architecture-reference-2026-07-22.md)。

## 决策

### 1. 在当前 monorepo 新增应用，不新增独立仓库

若该产品方向进入实施，新增 `apps/neko-desktop` 作为第三个明确的 composition root，默认使用 Electron 承载 MVP。它与 VS Code、TUI 并列，不取代现有应用，也不恢复已经删除的 `neko-home`、Workbench Core 或旧 Desktop 源码。

不新增独立仓库，原因是 Desktop 需要与现有类型、领域包、Engine 和质量门禁原子演进。拆仓会过早引入跨仓版本发布、契约同步和集成测试成本，并鼓励复制公共实现。

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

它不得拥有 Agent、素材、实体、Canvas、Cut、Preview、搜索、Skill 或 Engine 的领域真值，不得从功能包导入私有实现。领域能力继续由 owning package 提供 host-neutral contract、service 或 UI root；Desktop 只注入 Host ports 并组合公共入口。

推荐调用链为：

```text
Desktop renderer
  -> typed preload IPC
  -> Desktop AppHost / application services
  -> host-neutral domain service or Rust Engine client
  -> package-owned fact / Engine-owned computation
```

renderer 不得直接访问 Node.js、Electron main API 或 VS Code API。preload 只暴露最小、版本化、可验证的能力；未知 channel、未知 schema/version、无效 sender 或 instance identity 必须 fail-visible。

### 3. 复用现有子包，不复制领域实现

Desktop 优先复用以下公共能力：

| 能力 | Canonical owner | Desktop 复用方式 |
| --- | --- | --- |
| Agent、会话、模型、Skill、工具编排 | `packages/neko-agent` | 复用 Pi runtime、`AgentHostRuntimeAdapter` 和公共 Web UI root；实现 Electron adapter |
| Canvas 项目事实与交互 | `packages/neko-canvas` | 保留 `.nkc` 与 Canvas domain 为真值；把完整 UI root 的 VS Code message 依赖改为注入式 host adapter |
| Cut 时间线与编辑 | `packages/neko-cut` | 以 `.otio`、Cut Core command 和派生执行计划为真值；通过 host-neutral authoring/runtime contract 接入 |
| 素材、实体与搜索 | `packages/neko-assets`、`packages/neko-entity`、`packages/neko-search` | 复用 domain service 与 DTO；为 Desktop 组合 React 素材管理面，不复用 VS Code TreeView 宿主实现 |
| Preview | `packages/neko-preview` | 保留只读投影职责；把完整 root 的宿主通信抽到 adapter |
| Host、UI 与基础能力 | `packages/neko-host`、`packages/neko-ui`、`packages/neko-types` | 扩展现有公共 ports/primitives，不在 Desktop 建第二套 host framework、design system、i18n、日志或错误类型 |
| Engine 与跨层契约 | `packages/neko-engine`、`packages/neko-client`、`packages/neko-proto` | 是否复用 Engine 由各领域/宿主 ADR 决定；当前 VS Code Cut 通过 adapter 复用，Desktop Cut 尚未决策 |

当前复用成熟度不同：Agent Web UI 已存在 `AgentHostRuntimeAdapter` 与 `electron` host kind，可作为第一阶段入口；Canvas、Cut、Preview 的完整 UI root 仍有较强 VS Code `postMessage` 耦合；Assets 的主要宿主 UI 仍偏向 VS Code TreeView。后两类必须先完成宿主适配器和公共入口收敛，不能在 Desktop 中复制一套平行实现。

当前代码证据、耦合规模和逐包缺口记录在日期化状态快照 [`../status/2026-07-22-desktop-host-adapter-reuse-gap.md`](../status/2026-07-22-desktop-host-adapter-reuse-gap.md)，不在本 ADR 固化会随实现变化的文件数量或完成度。

`packages/neko-host/src/application.ts` 中残留的 `neko-home` application id 属于待审计的旧契约。Desktop 实施时应通过 OpenSpec 明确替换或删除策略，不得把它静默映射为 `neko-desktop`，也不得保留双别名 fallback。

#### 3.1 VS Code 与 Desktop 是同级宿主适配器

Desktop 不复用 VS Code Extension 实现；两种客户端通过各自 adapter 复用同一 host-neutral core、公共 UI root 和领域 contract：

```text
VS Code Webview ----VS Code UI transport----+
                                              -> domain host controller -> domain core / EngineClient
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

| 项目 | 采用层级 | OpenNeko 落点 | 明确排除 |
| --- | --- | --- | --- |
| OpenCode | 宿主、会话/Tab 生命周期与测试参考 | `apps/neko-desktop` 的 sidecar supervisor、health、退出清理、terminal transport、server session/window tab 分层和 timeline | OpenCode server、store、SolidJS UI 和内部 package 不成为依赖；目录/VCS 不成为 Neko Project identity |
| Zed | Project/Thread 与 Agent backend adapter 参考 | Project 分组的 Conversation projection、并行 runtime 状态、统一 native/ACP/terminal backend slot | 不采用 Zed editor/worktree 产品骨架，不把 Thread 类型变成 Project Profile，不增加第二套内部 runtime |
| Craft Agents | 主要 Desktop Agent UX 参考 | Home Inbox、workspace/source onboarding、权限模式、后台任务、结果/变更/预览审阅 | 不复制其 Agent runtime、credential、session/source store、remote control plane |
| Goose | 协议与外部 backend 参考 | ACP adapter 和 MCP App 的独立 spike 候选 | Goose Rust Agent Core 不进入媒体 Engine；ACP 不替换内部 contract |

#### 4.1 OpenCode 提供 Desktop Host 与 Session/View 分层经验

采用其 sidecar spawn/readiness/stop/relaunch、loopback health、深链、窗口恢复、terminal transport、session timeline 增量投影和实例隔离测试经验；同时采用 Server Session、window-scoped SessionTab、session-internal result/file tab、child/fork/abort/delete operation 相互分离的设计原则。这些能力必须按 Neko typed IPC、Host ports、Logger、Errors 和生命周期 contract 实现；不直接依赖 `@opencode-ai/*`，不引入第二套 server、session store、provider 或插件 runtime。

OpenNeko 对应关系不是一一照搬：`ConversationId` 是持久讨论身份，Host-owned `ConversationRuntime` 是运行实例，`AgentRunId` 是一次执行，`ConversationViewId` 是窗口投影。关闭 view 只 detach；abort、archive、delete 和 cancel BackgroundWork 必须是不同 operation。OpenCode child session 只说明 delegation 需要 identity；OpenNeko subagent 默认保持父 Conversation 下的 child run，不自动创建用户顶层 Conversation 或 Project Tab。

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
- Engine Protobuf、`EngineClient` 和媒体数据路径；
- Content、Character、World 的项目事实、run 或 save contract。

Goose Rust Agent runtime 不得合入 `packages/neko-engine`。MCP App 只能进入受控 conversation result、Context Dock 或明确 editor surface，并继续接受 Host trust、permission、CSP 和资源授权。

### 5. MiniMax Hub 是产品能力参考，不是架构模板

MiniMax Hub 用于校准用户体验：桌面创作指挥中心、多 Agent 创意流程、Canvas、Skill、本地素材、质量检查和导出闭环。它不提供 OpenNeko 内部契约的事实来源，也不构成引入云端控制面、多租户、私有协议或未知数据模型的理由。

OpenNeko 只采用其“Home 入口与管理、顶部项目工作集、项目内创作工作台”的宏观层级。内容创作、角色 IP 和互动世界分别拥有闭合 Project Profile；角色调试和世界体验不能作为 Canvas 节点类型或插件面板绕过自己的项目事实与运行生命周期。

Desktop MVP 仍遵守本地产品边界：workspace、本地文件、Host 权限、Pi runtime，以及各领域 ADR 明确要求的本地 Engine/Host runtime 组成 canonical path。商业云服务、团队协作、市场和远程同步若进入范围，应分别提出新变更。

### 6. 开源组件按“直接采用、协议参考、交互参考”分级

| 项目 | 决策 | 边界 |
| --- | --- | --- |
| Electron Forge | 优先直接采用 | 用于 Electron 打包、发布和 native module rebuild；最终选择仍需通过实施 OpenSpec 和平台 spike |
| Electron Security Guidance | 必须落实 | `contextIsolation`、sandbox、CSP、最小 preload API、sender 校验和安全自定义协议是宿主基线 |
| Playwright Electron | 评估后采用 | 用于 Desktop 运行态 E2E；其 Electron 支持状态要求同时保留 IPC/contract 测试，不能只靠 UI 自动化 |
| OpenTimelineIO | Cut 工程协议 | Cut 以受限 OTIO profile 作为唯一项目真值；MVP 不要求嵌入其 Python/C++ runtime |
| Agent Skills | 格式参考并保持兼容 | 用于开放 Skill 可移植格式；Neko overlay、trust 和 capability 仍由现有 Agent 边界拥有 |
| ComfyUI | 交互参考 | 参考 queue、history、provenance 与节点工作流体验；不采用其后端或工作流格式 |
| React Flow | 技术 spike 候选 | 只评估图交互、可访问性与自动布局；未经 Canvas 架构和性能 spike 不替换现有 Canvas |
| pi-mono | 上游模式参考 | 参考 session、subagent 与工具模式；OpenNeko 已有 Pi canonical path，不建立第二个 Agent runtime |
| Agent Client Protocol | 技术 spike 候选 | 仅用于未来可选外部 Agent backend adapter；不替换内部 Agent、Desktop IPC 或 Engine Proto |
| MCP Apps | 技术 spike 候选 | 用于受控 inline result、Context Dock 或 editor surface；不得向 Shell 任意贡献 UI |
| VS Code / Code OSS | UX 参考 | 参考命令面板、快捷键和工作区体验；不 fork Code OSS 作为 Desktop 基座 |

### 7. 每个 runtime instance 独立拥有状态

每个 Desktop window、Project Tab、Conversation、Conversation view、Agent run、Canvas document、Cut document、Engine session 和 BackgroundWork 必须有显式 identity 与独立生命周期。active tab、active conversation 或当前 workspace 只选择展示投影，不得充当共享可变状态 owner，也不得通过全局单例切换参数模拟多实例。

Host runtime registry 默认按 `(projectId, conversationId)` 拥有一个 `ConversationRuntime`；同一 Window 内重复打开 Conversation 聚焦已有 view，跨 Window 的多个 view 订阅同一 runtime 与 transcript projection。renderer/view 只拥有滚动、选择、布局和临时输入等展示状态，关闭 view 不终止 runtime、Agent run 或 BackgroundWork。多进程窗口若无法共享内存，必须通过单一 Host owner 和显式消息传递协调，不得按窗口复制 AgentSession。

Subagent/delegation 使用父 Conversation 下的 child `AgentRunId`；导出、渲染、导入和领域异步任务使用 `BackgroundWorkId`。两者均不得通过创建隐藏 Conversation 或复用 Tab identity 获得生命周期。只有显式“在新会话继续”或 needs-review promotion 才创建新的 Conversation identity。

跨实例 operation 和 event 必须携带 identity；缺失、陈旧或不匹配时直接返回 diagnostic。此约束同时适用于 Electron IPC、Agent adapter、domain authoring 和 Engine client。

## 五层分析

职责：Desktop 负责宿主和组合；领域包负责事实与操作；Engine 或 Host runtime 只负责各领域明确委托的计算/媒体执行；公共包负责稳定跨层契约。Cut 的 OTIO、命令和执行计划不归 Engine。

依赖：renderer 只能依赖浏览器安全的公共入口；preload 依赖 Electron 并暴露窄桥；main 依赖 Host/application service 但不依赖 React；功能包之间不直接导入私有实现。

接口：先定义 Desktop application id、Host ports、IPC schema/version、instance identity、domain adapter 和 lifecycle/error contract，再接具体 UI。Proto 继续是 Engine 跨层契约的单一事实来源。

扩展：新领域通过公共 capability 或 domain adapter 接入；新宿主通过实现相同 ports 接入。只有出现第二个真实实现或稳定变化点时才新增 registry/factory，不预建插件平台。

测试：对生产者、消费者、IPC、实例隔离、资源释放和用户路径分层验证，并证明 Desktop 命中新的 canonical path、不会回退旧 `neko-home` 或 VS Code message 路径。

## 实施门槛与阶段

本 ADR 不授权直接开发。实施前必须创建新的 OpenSpec change，限定迁移范围、公共契约、旧数据处置、任务拆分和验收标准。

建议阶段如下：

1. 定义 Desktop application contract、Electron 安全模型、typed IPC 和复用审计，删除或 poison 本次边界内的旧 application alias。
2. 建立 `apps/neko-desktop` main/preload/renderer、AppHost、Electron Host ports 和 workspace lifecycle；把 Agent router 收敛为 host-neutral controller，并接入 Agent Electron adapter。
3. 依次完成 Canvas、Cut、Preview 完整 Root 的 adapter 化以及 Assets React 管理面，按各领域 ADR 接入 Engine 或 Host runtime 生命周期；不得以现有简化 HostAdapterSurface 代替完整运行路径。
4. 在 canonical path 稳定后增加多 Agent 展示、模型路由、Skill 管理、质量检查和导出闭环。

商业云、Marketplace、团队协作、远程 server 和 native professional viewport 不随 Desktop shell 自动进入 MVP；每项需要独立的职责与契约决策。

## 验证要求

实施至少覆盖：

- Desktop main/preload/renderer 的 typecheck、build 和 package 测试；
- 架构测试阻止 renderer 导入 Node/Electron/VS Code 与包内部实现，阻止 main 导入 React；
- IPC schema/version、unknown channel、sender validation、取消、资源释放和 instance identity 测试；
- 使用隔离 fixture 的 Playwright Electron 运行态场景：启动、workspace、Agent session、Canvas/Cut/Preview、Engine lifecycle 与退出清理；
- Agent prompt、Skill、provider、tool routing 或 AgentSession 行为变化的聚焦真实 evaluation；
- 生产者与消费者测试，以及仓库级 `pnpm build`、`pnpm test`、`pnpm check`；
- macOS、Windows 等目标平台的签名、公证、更新与 native module 验证。

UI E2E 不得读取真实用户 workspace、凭据或本机私有配置。Playwright Electron 不能替代 VS Code 特有功能的 Extension Development Host 验证，也不能替代 Engine 集成测试。

## 后果

- Desktop 与现有应用共享同一领域模型和基础设施，公共契约可以原子演进。
- 初始工作量主要是宿主解耦与 composition，而不是重写领域能力。
- Agent 可较早接入；Canvas、Cut、Preview 和 Assets 需要明确的跨宿主改造，不能承诺零成本复用。
- Electron 带来更直接的桌面生态与测试路径，同时增加供应链、安全、签名、更新和多平台发布责任。
- OpenCode、Zed、Craft Agents、Goose 与 MiniMax Hub 提供互补参考，但不会形成第二个 Agent runtime、存储模型、Desktop framework 或远程架构。

## 被拒绝的方案

- 新建独立仓库并复制现有子包：拒绝，因契约与版本漂移成本过高。
- 恢复旧 Desktop/Workbench Core/neko-home：拒绝，因其已被现行架构显式删除和取代。
- 直接 fork OpenCode、Zed、Craft Agents 或 Goose：拒绝，因 runtime、存储、UI 技术栈和产品事实边界不一致。
- 把 ACP 作为内部统一协议：拒绝，因 Desktop IPC、Neko Agent contract、Engine Proto 和项目格式拥有不同职责与错误模型。
- 把 Goose Rust Agent Core 合入媒体 Engine：拒绝，因 Agent orchestration 与媒体计算不是同一 owning responsibility。
- 直接把 VS Code Webview 包进 Electron：拒绝，因它保留错误的宿主依赖并绕过 typed Desktop bridge。
- 同时引入 Claude SDK、LangGraph、CrewAI 或 AutoGen：拒绝，因 Pi 已是唯一 Agent canonical path。
- MVP 先建远程 server/control plane：拒绝，因当前产品是本地客户端 + 本地 Engine，没有真实分布式边界。

## 参考

仓库内：

- [`application-composition.md`](application-composition.md)
- [`client-targets.md`](client-targets.md)
- [`package-boundaries.md`](package-boundaries.md)
- [`adr-pi-agent-runtime.md`](adr-pi-agent-runtime.md)
- [`adr-agent-runtime-architecture-comparison-boundary.md`](adr-agent-runtime-architecture-comparison-boundary.md)
- [`adr-neko-desktop-home-project-profile-ux-boundary.md`](adr-neko-desktop-home-project-profile-ux-boundary.md)
- [`adr-neko-desktop-apphost-resource-viewport-boundary.md`](adr-neko-desktop-apphost-resource-viewport-boundary.md)（历史、已取代）
- [`../research/desktop-agent-client-architecture-reference-2026-07-22.md`](../research/desktop-agent-client-architecture-reference-2026-07-22.md)
- [`../status/2026-07-22-desktop-host-adapter-reuse-gap.md`](../status/2026-07-22-desktop-host-adapter-reuse-gap.md)

外部调研快照（2026-07-22，外部项目能力与许可可能变化，实施时需重新核验）：

- [OpenCode](https://github.com/anomalyco/opencode)
- [Zed Agents](https://zed.dev/docs/ai/agents) 与 [Parallel Agents](https://zed.dev/docs/ai/parallel-agents)
- [Craft Agents 文档](https://agents.craft.do/docs/getting-started/introduction) 与 [Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss)
- [Goose](https://github.com/aaif-goose/goose)
- [MiniMax Hub](https://hub.minimaxi.com/)
- [Electron Forge](https://github.com/electron/forge) 与 [Electron Security Guidance](https://www.electronjs.org/docs/latest/tutorial/security)
- [Playwright Electron](https://playwright.dev/docs/api/class-electron)
- [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO)
- [Agent Skills](https://github.com/agentskills/agentskills)
- [ComfyUI](https://github.com/comfy-org/comfyui)
- [React Flow](https://reactflow.dev/)
- [pi-mono](https://github.com/badlogic/pi-mono)
