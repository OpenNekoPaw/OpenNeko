# Desktop Agent 客户端开源架构参考

日期：2026-07-22

范围：OpenCode、Zed、Craft Agents、Goose 的 Desktop Shell、Agent runtime、会话/Thread、Tab/Panel/Window、扩展和协议边界。本文是外部调研快照，不是 OpenNeko 的实现事实；稳定采用结论见 [`../architecture/adr-neko-desktop-composition-and-open-source-reference-boundary.md`](../architecture/adr-neko-desktop-composition-and-open-source-reference-boundary.md) 与 [`../architecture/adr-neko-desktop-home-project-profile-ux-boundary.md`](../architecture/adr-neko-desktop-home-project-profile-ux-boundary.md)。

## 结论

四个项目共同证明：会话/Thread 是后台运行事实，Tab、Panel、Window 和 Sidebar item 是可关闭、可恢复的 UI 投影；Agent profile/mode、会话、一次运行和子 Agent 也不是同一个对象。

它们采用了不同的客户端组织方式：

- OpenCode 重做 Electron Desktop，并由桌面进程监管本地 OpenCode server；
- Zed 在项目下组织并行 Thread，以统一 Threads Sidebar 承载内置 Agent、ACP External Agent 和 Terminal Thread；
- Craft Agents 使用 Electron main/preload/React renderer，围绕 workspace、session、source 和结果交付建立自己的工作台；
- Goose 使用 Electron/React 客户端启动 Rust `goose` CLI，并通过 ACP 连接 Agent backend。

OpenCode、Craft Agents 和 Goose 选择独立 Desktop Shell，Zed 则证明现有编辑器也可以通过明确 Thread owner 和 backend adapter 支持并行 Agent。共同点不是某个 UI 框架，而是把产品 Shell、会话 identity、运行时和外部 Agent backend 分层。OpenNeko 补齐桌面生命周期、会话、权限、插件和后台任务时，不需要引入 Code OSS Workbench 或 VS Code Extension Host，也不能用 active Tab 模拟多实例。

## 已验证事实

| 项目 | Desktop 与 runtime | 扩展边界 | 许可 | 主要来源 |
| --- | --- | --- | --- | --- |
| OpenCode | `packages/desktop` 是 Electron 应用；main process 启动和监管本地 server/sidecar；server 将 project、session、status、child、fork 和 abort 暴露为独立资源，App 另行维护 window-scoped session/draft tabs | 内部包含 MCP、Skill、permission、plugin、ACP 和 server route；primary agent 是会话内可切换 profile/mode，subagent 可创建 child session | MIT | [Server](https://opencode.ai/docs/server/)、[Agents](https://opencode.ai/docs/agents/)、[Desktop main](https://github.com/anomalyco/opencode/blob/dev/packages/desktop/src/main/index.ts)、[App tabs](https://github.com/anomalyco/opencode/blob/dev/packages/app/src/context/tabs.tsx) |
| Zed | Project 下的 Thread 独立拥有 agent、context 和 conversation history；Threads Sidebar 可同时投影多个项目和运行状态，Agent Panel 只显示当前选择的 Thread | 同一 Thread shell 可承载 Zed Agent、ACP External Agent 或 Terminal Thread；各 backend 保持自身 auth、model、tool 和配置边界 | 主要为 GPL-3.0-or-later，标记组件为 Apache-2.0 | [Agents](https://zed.dev/docs/ai/agents)、[Parallel Agents](https://zed.dev/docs/ai/parallel-agents)、[Agent Profiles](https://zed.dev/docs/ai/agent-profiles)、[Repository licensing](https://github.com/zed-industries/zed#licensing) |
| Craft Agents | Electron main/preload/React renderer；共享层拥有 agent、session、source、credential 和 status；可连接 headless server | Skill、MCP/REST/local source、权限模式、automation 和预览由其自有 transport/store 驱动 | Apache-2.0 | [README 与 Architecture](https://github.com/craft-ai-agents/craft-agents-oss)、[Electron package](https://github.com/craft-ai-agents/craft-agents-oss/blob/main/apps/electron/package.json) |
| Goose | Electron/React Desktop 启动打包的 Rust `goose` CLI，并连接其 ACP server；ACP 用 `session/new`、`session/load`、`session/prompt` 和 `session/cancel` 管理 backend session | Rust runtime 拥有 provider、MCP extension、permission、session、recipe、schedule；Desktop 通过 ACP adapter 投影 | Apache-2.0 | [Desktop README](https://github.com/aaif-goose/goose/blob/main/ui/desktop/README.md)、[Custom UI / ACP](https://github.com/aaif-goose/goose/blob/main/CUSTOM_DISTROS.md) |

Electron 只提供 Chromium、Node、窗口和原生桌面能力。OpenCode、Craft Agents 和 Goose 使用 Electron 不等于复用 VS Code；其仓库没有把 Code OSS Workbench、Editor Group 或 VS Code Extension Host 作为 Desktop 产品骨架。Zed 的价值在于 Thread/backend 分层，不构成采用其编辑器工作台或代码的建议。

## 会话、运行时与 UI identity 对比

| 客户端 | 持久会话对象 | UI 选择/多开对象 | Agent 配置对象 | 子 Agent | 关闭 UI 的语义 |
| --- | --- | --- | --- | --- | --- |
| OpenCode | Server `Session` | window-scoped `SessionTab` / `DraftTab`；Session 内另有文件/结果 tab | primary agent / permission profile | child session，可从 parent/child 导航 | 关闭 session tab 只移除窗口投影；abort 与 delete 是独立 server operation |
| Zed | Project-scoped Thread | Threads Sidebar item + 当前 Agent Panel；可跨项目并行 | Zed Agent profile 或 External/Terminal backend 类型 | 独立 Thread 或 backend 内部 delegation | 切换 Thread 只改变 Panel 投影；运行 Thread 继续工作，archive/delete 是独立动作 |
| Craft Agents | Workspace-scoped Session | Inbox item、Panel Stack、focused window | agent/provider/permission mode | 由 runtime/session workflow 表达 | 关闭 panel/window 不应等价删除 session；workspace runtime 继续拥有状态 |
| Goose | ACP/REST Session | Desktop 当前会话与历史投影 | Goose backend provider/extension/recipe | backend 内 subagent/recipe | UI 与 backend process/session 通过 ACP 分离，cancel 只针对进行中的 prompt |

这些名称不能直接映射为 OpenNeko 同名对象。特别是 OpenCode 文档中的 `Tab` 键切换的是 primary agent，不是 UI Tab；其 App `SessionTab` 才是窗口投影。Zed 的 Thread 同时接近 OpenNeko Conversation 和 runtime binding，但仍不拥有项目事实、导出任务或 Character/World run。

## 可复用内容

### OpenCode：宿主与高频会话实现参考

适合参考：

- sidecar spawn、readiness、health、stop、relaunch 和异常退出语义；
- loopback server、代理绕过、深链、窗口恢复和应用退出清理；
- terminal transport、session timeline 增量投影和大量消息虚拟化；
- server/project/session identity 隔离及其回归测试结构。
- session、window tab、session-internal file/result tab 的分层；
- list/status/children/fork/abort/delete 的独立生命周期 operation；
- 同一 server/session 在一个窗口内去重，关闭 Tab 只 detach UI 投影。

OpenCode 的关键运行链是：

```text
Desktop / Web / TUI client
  -> OpenCode server
     -> Project
        -> Session
           -> message / status / permission / child / current run

Window
  -> SessionTab(sessionId) | DraftTab(draftId)
     -> session-internal file / diff / result tabs
```

其优点是 server session 不依赖可见 UI，多个 session 可以分别处于 busy/idle/error；其局限是 project 主要围绕目录/VCS，session 和 child session 主要围绕 coding task。OpenNeko 不能据此把 workspace path 当成 Project identity，也不能把内部 subagent child 自动提升为用户顶层会话或 Project Tab。

不直接采用：

- OpenCode server、session store、provider/plugin runtime；
- SolidJS 产品 UI 和 `@opencode-ai/*` 内部包；
- 用 OpenCode contract 取代 Neko Agent、Host、Proto 或项目事实。

### Zed：Project/Thread/backend adapter 参考

适合参考：

- Thread 按 Project 分组，但单个 Shell 可以同时观察多个 Project；
- 每个 Thread 独立拥有 agent、context、history 和运行状态，选择 Thread 只切换 Agent Panel；
- 内置 Agent、ACP External Agent 和 Terminal CLI 共享 Thread shell，但保留各自 backend 配置和能力边界；
- archive、history、restore、delete 与运行状态分离；
- 多个并行 Thread 涉及同一仓库时，可通过 worktree 隔离写入环境。

Zed 最接近 OpenNeko 未来的 `Conversation -> AgentBackendBinding`：一个产品级 Conversation/Thread shell 可以选择不同 backend adapter，但 backend 不拥有 Project、Character、World 或 BackgroundWork 控制面。OpenNeko MVP 仍以 Pi adapter 为唯一 canonical path；引入 ACP 或 Terminal backend 必须经过独立 OpenSpec，不能因 UI 可统一展示就建立多套内部 Agent runtime。

不直接采用：

- Zed editor、worktree 或 code-review 工作流作为 OpenNeko Desktop 骨架；
- 把 Thread 类型当作 Project Profile；
- 把 Agent profile、External Agent backend 或 terminal process 当作 Conversation identity。

### Craft Agents：Home 与项目 Agent UX 参考

适合参考：

- 多会话 Inbox、状态过滤、搜索、flag 和 needs-review 流程；
- workspace/source onboarding 与 source 健康状态；
- Explore、Ask to Edit、Auto 等渐进权限；
- 后台 session/task、结果文件、变更、预览和交付物检查；
- Electron main/preload/renderer 的窄桥与安全分层。

Craft 的核心价值是 attention management，而不是浏览器式 Tab：Inbox、Panel Stack、focused window 和 needs-review 状态可以同时投影同一 workspace 下的多个 session。OpenNeko 可采用这种“工作等待用户，而不是强制抢占当前页面”的交互，但 Session 不能成为项目、任务或领域运行的统一容器。

React/Tailwind 技术栈与 OpenNeko 接近，但其页面组件普遍依赖自有 transport、store、credential 和 session schema。优先按 OpenNeko contract 重建交互；只有职责独立、依赖闭合的 utility 或 primitive 才进入逐文件复用审计。

不直接采用：

- Claude Agent SDK 与 Pi 双 runtime；
- JSON/JSONL session、credential、source 和 remote server 事实；
- 文档转换、内容读取或预览的平行实现；这些能力继续由 `@neko/content`、Host IO 和领域 owner 提供。

### Goose：ACP 与 MCP App 边界参考

适合参考或进行独立 spike：

- ACP capability negotiation、session、prompt、permission、elicitation 和 tool notification；
- Desktop client 与本地/外部 Agent backend 的进程隔离；
- MCP extension 生命周期与 MCP App 的受控 UI 投影；
- transport auth、取消、诊断和 session identity 测试。

ACP 若进入 OpenNeko，只能作为可选外部 Agent adapter：

```text
Desktop / VS Code / TUI
  -> Neko AgentHostRuntimeAdapter
     -> Pi adapter（默认 canonical path）
     -> ACP adapter（未来、可选外部 backend）
```

ACP 不替换 Desktop typed IPC、Engine Protobuf、Neko Agent 内部 contract 或项目格式。Goose Rust Agent runtime 不进入 `neko-engine`；该 Engine 继续只拥有媒体计算和数据模型。

Goose 的主要价值是证明 `session/new/load/prompt/cancel` 和流式 tool/permission event 可以由 backend protocol 提供。它不是完整的 OpenNeko 控制面：Project catalog、Conversation view、CharacterRun、WorldRun/Save、导出与 BackgroundWork 仍必须由 OpenNeko owning service 管理。

## 对 OpenNeko identity 与生命周期的推导

稳定结论应收敛为以下对象，不使用一个 `sessionId` 或 `tabId` 承担所有职责：

```text
ProjectId
├─ ConversationId
│  ├─ ConversationRuntime            # host-owned, keyed by project/conversation
│  ├─ AgentProfile / CharacterProfile
│  └─ AgentRunId
│     └─ ChildAgentRun / DelegationRun
├─ BackgroundWorkId                  # export/render/import/domain async work
└─ SurfaceId                         # Canvas/Cut/Character/World/document

WindowId
└─ ProjectTabId -> ProjectId
   └─ ConversationViewId / SurfaceViewId -> owning identity
```

语义约束：

1. `ConversationRuntime` 按 `ConversationId` 建立，不按 UI Tab 建立；同一 Conversation 的多个 view 共享后台 runtime，但各自拥有滚动、选择和布局等 view state。
2. 同一 Conversation 在同一 Window 默认去重；跨 Window 可以有多个 view，不能因此复制 runtime、消息队列或工具执行。
3. 关闭/detach view 不 abort 当前 run、不删除 Conversation；abort、archive 和 delete 是显式独立 operation。
4. `AgentRunId` 表示一次 turn/续跑/delegation 的执行，Agent profile/角色只决定上下文、模型、能力和策略，不成为 runtime identity。
5. Subagent 默认是父 Conversation 下的 child/delegation run；只有用户显式打开、需要独立长期讨论或 needs-review 时，才提升为独立 Conversation/view。
6. 导出、渲染、导入和领域异步任务使用 `BackgroundWorkId`，可以由 Agent 发起，但不冒充 Conversation 或 child Agent session。
7. operation/event 必须携带显式 project/conversation/run/work identity；缺失或不匹配时 fail-visible，不回退当前 active Tab/Thread。

## 对最终 UX 的映射

| OpenNeko 表面 | 主要参考 | 采用内容 |
| --- | --- | --- |
| Home 入口与会话/任务 | Craft Agents、OpenCode、Zed | Director composer、多会话 Inbox、按项目分组、独立状态和后台任务投影 |
| Content Project | MiniMax Hub、OpenCode | 左资源、中创作表面、右 Agent/Review/Tasks；终端或 Diff 只按需出现 |
| Character IP Project | Craft Agents、Zed | 多 Conversation 实验、结果审阅、独立 profile/backend binding 和权限反馈；角色事实与运行由 Neko 新领域拥有 |
| Interactive World Project | Goose 的 backend 隔离模式 | authoring 与 run/save 分离；外部 Agent 只能通过显式 adapter 参与 |
| Skills、插件与受控面板 | Craft Agents、Goose、Zed | Skill/Source/MCP catalog、profile/tool availability、诊断、permission、MCP App 候选 |
| Desktop Host | OpenCode、Craft Agents | Electron 生命周期、sidecar、typed preload bridge、深链和更新 |

这些参考不会增加第四种 Project Profile，也不会让会话、插件或 Canvas 成为角色和世界的事实 owner。

## 许可与不确定性

- OpenCode 为 MIT；Craft Agents 和 Goose 为 Apache-2.0；Zed 主要为 GPL-3.0-or-later，部分标记组件为 Apache-2.0。OpenNeko 为 AGPL-3.0-or-later，选择性纳入代码前仍需逐文件确认版权、LICENSE、NOTICE、专利条款和第三方依赖。本文对 Zed 只作产品/协议边界参考，不授权复制代码。
- 本文只核对公开仓库在 2026-07-22 可见的默认开发分支。目录、依赖和能力可能变化；实施 spike 必须固定 commit 并重新审计。
- “适合参考”不代表已经通过 OpenNeko 的安全、可维护性、性能或运行态验收。
