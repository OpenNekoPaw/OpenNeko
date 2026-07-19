# ADR: Neko Desktop 组合根与开源参考复用边界

状态：Proposed
日期：2026-07-19
范围：拟议中的 `apps/neko-desktop`、现有领域子包、Desktop Host bridge、Rust Engine，以及 Craft Agents、MiniMax Hub 等外部参考的采用边界。

## 背景

OpenNeko 当前只有 `apps/neko-vscode` 和 `apps/neko-tui` 两个应用组合根，系统文档也只把 VS Code 与 TUI 描述为现行客户端。此前的 Desktop、Workbench Core 与 Market Core 已被删除；[`adr-neko-desktop-apphost-resource-viewport-boundary.md`](adr-neko-desktop-apphost-resource-viewport-boundary.md) 因此保持 `Superseded`，不得作为恢复旧实现的依据。

新的产品方向希望提供类似 MiniMax Hub 的本地创作客户端：以 Agent 为入口，组合素材、Canvas、Cut、Preview、生成任务、质量检查和导出。与此同时，Craft Agents 展示了成熟的 Electron Agent 客户端形态，包括多会话工作区、来源接入、后台任务、深链和 main/preload/renderer 分层。

这项工作会跨应用宿主、多个领域包、公共契约与 Engine 边界。若直接复制旧 Desktop、为每个领域新增一套 Desktop 实现，或把 Craft Agents 当作新运行时基础，都会形成第二套事实来源和长期双路径。

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
| Cut 时间线与编辑 | `packages/neko-cut` | 保留 `.nkv` 与 Cut domain 为真值；通过 host-neutral authoring/runtime contract 接入 |
| 素材、实体与搜索 | `packages/neko-assets`、`packages/neko-entity`、`packages/neko-search` | 复用 domain service 与 DTO；为 Desktop 组合 React 素材管理面，不复用 VS Code TreeView 宿主实现 |
| Preview | `packages/neko-preview` | 保留只读投影职责；把完整 root 的宿主通信抽到 adapter |
| Host、UI 与基础能力 | `packages/neko-host`、`packages/neko-ui`、`packages/neko-types` | 扩展现有公共 ports/primitives，不在 Desktop 建第二套 host framework、design system、i18n、日志或错误类型 |
| Engine 与跨层契约 | `packages/neko-engine`、`packages/neko-client`、`packages/neko-proto` | 复用 EngineClient 与 Proto；计算、媒体处理和导出继续以 Rust Engine 为权威 |

当前复用成熟度不同：Agent Web UI 已存在 `AgentHostRuntimeAdapter` 与 `electron` host kind，可作为第一阶段入口；Canvas、Cut、Preview 的完整 UI root 仍有较强 VS Code `postMessage` 耦合；Assets 的主要宿主 UI 仍偏向 VS Code TreeView。后两类必须先完成宿主适配器和公共入口收敛，不能在 Desktop 中复制一套平行实现。

`packages/neko-host/src/application.ts` 中残留的 `neko-home` application id 属于待审计的旧契约。Desktop 实施时应通过 OpenSpec 明确替换或删除策略，不得把它静默映射为 `neko-desktop`，也不得保留双别名 fallback。

### 4. Craft Agents 是主要桌面 Agent UX 参考，不是代码基座

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

### 5. MiniMax Hub 是产品能力参考，不是架构模板

MiniMax Hub 用于校准用户体验：桌面创作指挥中心、多 Agent 创意流程、Canvas、Skill、本地素材、质量检查和导出闭环。它不提供 OpenNeko 内部契约的事实来源，也不构成引入云端控制面、多租户、私有协议或未知数据模型的理由。

Desktop MVP 仍遵守本地产品边界：workspace、本地文件、Host 权限、Pi runtime 和 Rust Engine 组成 canonical path。商业云服务、团队协作、市场和远程同步若进入范围，应分别提出新变更。

### 6. 开源组件按“直接采用、协议参考、交互参考”分级

| 项目 | 决策 | 边界 |
| --- | --- | --- |
| Electron Forge | 优先直接采用 | 用于 Electron 打包、发布和 native module rebuild；最终选择仍需通过实施 OpenSpec 和平台 spike |
| Electron Security Guidance | 必须落实 | `contextIsolation`、sandbox、CSP、最小 preload API、sender 校验和安全自定义协议是宿主基线 |
| Playwright Electron | 评估后采用 | 用于 Desktop 运行态 E2E；其 Electron 支持状态要求同时保留 IPC/contract 测试，不能只靠 UI 自动化 |
| OpenTimelineIO | 协议/语义参考 | 用于时间线交换边界；MVP 不要求嵌入其 Python/C++ runtime，也不替换 `.nkv` 真值 |
| Agent Skills | 格式参考并保持兼容 | 用于开放 Skill 可移植格式；Neko overlay、trust 和 capability 仍由现有 Agent 边界拥有 |
| ComfyUI | 交互参考 | 参考 queue、history、provenance 与节点工作流体验；不采用其后端或工作流格式 |
| React Flow | 技术 spike 候选 | 只评估图交互、可访问性与自动布局；未经 Canvas 架构和性能 spike 不替换现有 Canvas |
| pi-mono | 上游模式参考 | 参考 session、subagent 与工具模式；OpenNeko 已有 Pi canonical path，不建立第二个 Agent runtime |
| VS Code / Code OSS | UX 参考 | 参考命令面板、快捷键和工作区体验；不 fork Code OSS 作为 Desktop 基座 |

### 7. 每个 runtime instance 独立拥有状态

每个 Desktop window、Agent session、Canvas document、Cut document、Engine session 和后台任务必须有显式 identity 与独立生命周期。active tab 或当前 workspace 只选择展示投影，不得充当共享可变状态 owner，也不得通过全局单例切换参数模拟多实例。

跨实例 operation 和 event 必须携带 identity；缺失、陈旧或不匹配时直接返回 diagnostic。此约束同时适用于 Electron IPC、Agent adapter、domain authoring 和 Engine client。

## 五层分析

职责：Desktop 负责宿主和组合；领域包负责事实与操作；Engine 负责计算和媒体真值；公共包负责稳定跨层契约。

依赖：renderer 只能依赖浏览器安全的公共入口；preload 依赖 Electron 并暴露窄桥；main 依赖 Host/application service 但不依赖 React；功能包之间不直接导入私有实现。

接口：先定义 Desktop application id、Host ports、IPC schema/version、instance identity、domain adapter 和 lifecycle/error contract，再接具体 UI。Proto 继续是 Engine 跨层契约的单一事实来源。

扩展：新领域通过公共 capability 或 domain adapter 接入；新宿主通过实现相同 ports 接入。只有出现第二个真实实现或稳定变化点时才新增 registry/factory，不预建插件平台。

测试：对生产者、消费者、IPC、实例隔离、资源释放和用户路径分层验证，并证明 Desktop 命中新的 canonical path、不会回退旧 `neko-home` 或 VS Code message 路径。

## 实施门槛与阶段

本 ADR 不授权直接开发。实施前必须创建新的 OpenSpec change，限定迁移范围、公共契约、旧数据处置、任务拆分和验收标准。

建议阶段如下：

1. 定义 Desktop application contract、Electron 安全模型、typed IPC 和复用审计，删除或 poison 本次边界内的旧 application alias。
2. 建立 `apps/neko-desktop` main/preload/renderer、AppHost、workspace lifecycle，并接入 Agent Electron adapter。
3. 依次完成 Canvas、Cut、Preview 的 host adapter 化以及 Assets React 管理面，接入 Engine 生命周期。
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
- Craft Agents 与 MiniMax Hub 提供清晰的产品标杆，但不会形成第二个 Agent runtime、存储模型或远程架构。

## 被拒绝的方案

- 新建独立仓库并复制现有子包：拒绝，因契约与版本漂移成本过高。
- 恢复旧 Desktop/Workbench Core/neko-home：拒绝，因其已被现行架构显式删除和取代。
- 直接 fork Craft Agents：拒绝，因 runtime、存储、UI 技术栈和产品事实边界不一致。
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
- [`adr-neko-desktop-apphost-resource-viewport-boundary.md`](adr-neko-desktop-apphost-resource-viewport-boundary.md)（历史、已取代）

外部调研快照（2026-07-19，外部项目能力与许可可能变化，实施时需重新核验）：

- [Craft Agents 文档](https://agents.craft.do/docs/getting-started/introduction) 与 [Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss)
- [MiniMax Hub](https://hub.minimaxi.com/)
- [Electron Forge](https://github.com/electron/forge) 与 [Electron Security Guidance](https://www.electronjs.org/docs/latest/tutorial/security)
- [Playwright Electron](https://playwright.dev/docs/api/class-electron)
- [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO)
- [Agent Skills](https://github.com/agentskills/agentskills)
- [ComfyUI](https://github.com/comfy-org/comfyui)
- [React Flow](https://reactflow.dev/)
- [pi-mono](https://github.com/badlogic/pi-mono)
