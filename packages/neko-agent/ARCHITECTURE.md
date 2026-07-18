# neko-agent 架构

> AI Agent 系统，提供对话、MCP 工具、技能系统、多模型 LLM 等能力。
>
> 2026-07-15：固定 IDC stage/run/persona、Draft/Plan/Apply runtime、Plan action/card 和 runtime artifact store 已退役。Canonical path 是普通 `AgentSession` / turn / ReAct；Plan Mode 只由 `executionMode` 控制只读规划，Markdown、TODO 和 UI 不拥有执行状态。本文未同步章节中的旧术语仅作为历史背景。

---

## 系统定位

neko-agent 是 OpenNeko 的 AI 能力中枢。它将 LLM 对话、工具执行、技能系统、MCP 协议整合为统一的 Agent 运行时，支持 VSCode 扩展、终端 TUI 和 headless 工具接入方式。

---

## 子包结构

```
packages/neko-agent/
├── packages/
│   ├── agent/        # @neko/agent — Agent 运行时（核心，零 VSCode 依赖）
│   ├── platform/     # @neko/platform — AI 服务平台（LLM 适配 + 媒体生成）
│   ├── extension/    # @neko-agent/extension — VSCode Extension Host（纯胶水层）
│   └── webview/      # @neko-agent/webview — React 对话 UI

apps/
└── neko-tui/         # @neko/app-tui — Ink TUI 终端产品 + headless 工具
```

**依赖方向**（严格单向）：

```
webview ──(postMessage)──→ extension ──→ agent ──→ platform ──→ shared
                               │                      │
                               └──→ shared             └──→ ai-sdk

apps/neko-tui ──→ agent ──→ platform ──→ shared
       │                         │
       └──→ shared               └──→ ai-sdk
```

> **说明**：`agent` 通过 `@neko/shared` 的 `IService` 接口抽象 LLM 调用，`platform` 提供具体实现。
> `apps/neko-tui` 直接复用 `@neko/platform`，通过 `createCLIPlatform()` 创建实例，`toSharedService()` 适配为 `IService`。
> Extension、Terminal TUI 和 headless 工具共享同一套 LLM 和 Provider 管理。

---

## 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                   VSCode Extension Host                  │
│                                                         │
│  ┌──────────────────────────────────────────┐           │
│  │     @neko-agent/extension                │           │
│  │                                          │           │
│  │  Bootstrap → ChatViewProvider            │           │
│  │         │         │                      │           │
│  │  ServiceCollection                       │           │
│  │    ├─ AgentMessageTurnHandler (消息桥接)  │           │
│  │    ├─ ConversationBridge (会话桥接/注入)  │           │
│  │    ├─ SystemPromptManager (代理 Builder)  │           │
│  │    ├─ AgentRunner (薄包装 AgentSession)   │           │
│  │    ├─ AgentManager (LRU 多会话池)         │           │
│  │    ├─ ConfigBridge (配置消息路由)          │           │
│  │    ├─ AgentStreamProcessor (事件→UI)      │           │
│  │    └─ 10 个专用 Handler (task/skill/plan...)│         │
│  └──────────┬───────────────────────────────┘           │
│             │                                            │
│  ┌──────────▼──────────┐     ┌────────────────────────┐ │
│  │    @neko/agent       │────→│    @neko/platform      │ │
│  │                     │     │                        │ │
│  │  AgentSession        │     │  LLM Adapters          │ │
│  │  ├─ AgentExecutor    │     │  ├─ Anthropic          │ │
│  │  │  (ReAct 循环)     │     │  ├─ OpenAI             │ │
│  │  ├─ ToolRegistry     │     │  ├─ Google/Azure       │ │
│  │  ├─ SkillService     │     │  ├─ Ollama/Generic     │ │
│  │  ├─ MCPManager       │     │  │                     │ │
│  │  ├─ ContextManager   │     │  MediaService           │ │
│  │  ├─ PermissionSystem │     │  ├─ Runway/Luma        │ │
│  │  ├─ HookComposer     │     │  ├─ MiniMax/Suno      │ │
│  │  └─ SkillInjection   │     │  └─ Vidu/Midjourney   │ │
│  │    Coordinator       │     │                        │ │
│  └─────────────────────┘     │  ConfigManager          │ │
│         ▲ postMessage         │  ├─ User Config         │ │
│  ┌──────┴──────────────────┐ │  └─ Workspace MCP       │ │
│  │  Webview (React)        │ │                          │ │
│  │  @neko-agent/webview    │ │  ModelSelector            │ │
│  │                         │ │  (优先级 fallback)        │ │
│  │  ChatView + ContentBlock│ └────────────────────────┘ │
│  │  Zustand State          │                             │
│  │  Handler Registry       │                             │
│  └─────────────────────────┘                             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│            Terminal TUI / headless（独立进程）             │
│                                                         │
│  ┌──────────────────────────────────────────┐           │
│  │ apps/neko-tui — Ink React + tools        │           │
│  │                                          │           │
│  │  App                                     │           │
│  │    ├─ ChatView + Input + StatusBar       │           │
│  │    ├─ Zustand Stores                     │           │
│  │    │  (agent/conversation/config/ui)     │           │
│  │    └─ useAgentSession Hook               │           │
│  │                                          │           │
│  │  createCLIPlatform()                     │           │
│  │    ├─ createPlatform(...)                │           │
│  │    ├─ collectEnvApiKeys()                │           │
│  │    └─ toSharedService() → IService       │           │
│  └──────────┬───────────────────────────────┘           │
│             │                                            │
│  ┌──────────▼──────────┐     ┌────────────────────────┐ │
│  │    @neko/agent       │────→│    @neko/platform      │ │
│  │  AgentSession        │     │  (与 Extension 共享)    │ │
│  └─────────────────────┘     └────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## TUI/Webview 工作区运行时边界

Neko Agent 的 VS Code Extension/Webview 与 Terminal TUI/headless 是两个本地宿主，功能差异必须保留。Extension/Webview 可以拥有 VS Code API、`postMessage`、`webview.asWebviewUri()`、文件 watcher、memento/recovery、Extension command 和 Webview timeline projection；Terminal TUI/headless 可以拥有 Ink 键盘流、终端展示、进程生命周期、stdout/stderr 报告和真实 API 验证 lane。

对齐目标不是统一 UI，而是让同一个工作区配置和工作区数据能同时被 TUI 与 Webview 使用。业务逻辑进入共享 runtime/config/catalog/task/cache contract，宿主只提供 adapter 和 presentation。

| 工作区共享业务面          | 共享规则                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Effective config snapshot | `~/.neko/config.toml`、`.neko/config.toml`、环境凭据和账号 catalog 通过共享 resolver 形成同一份快照；Webview 与 TUI 不得分别手写 provider/model/scalar/MCP 解析策略。运行时模型/参数选择只影响当前 session，不自动重写 TOML。                    |
| Session/runtime assembly  | 交互式 Webview 和 TUI 会话都走 `createAgentSessionWithRuntime()` 及 host-neutral runtime bindings；AGENTS overlay、project memory、context settings、capability prompt fragments 和 task projection 在共享路径注入。                             |
| Conversation identity     | 交互式会话使用 workspace-scoped canonical conversation id。旧 `cli-*` 记录不作为 TUI resume 兼容输入，不读取、不迁移、不重写、不删除；旧 runtime state source 不能作为共享状态成功读入。                                                         |
| Skill/catalog             | 标准来源是 `~/.agents/skills`、`~/.neko/commands`、`.agents/skills`、`.neko/commands`，由共享 Skill file runtime 与 command catalog 解析；`.codex/skills` 或 `skillsDir` 之类非标准来源只能通过显式 source provider 进入，并必须带 diagnostics。 |
| Command effects           | `/command` 工件、内置命令和 `$skill` 激活使用共享 catalog。TUI-only 或 Extension-only 行为必须注册为 `tui` / `extension` surface scope 的 effect，另一端请求时返回 unavailable diagnostic。                                                      |
| Async tasks               | 可序列化 Task/Run 与最小 checkpoint 进入用户级 `neko.db` state tables，并按显式 `workspaceId` 分区；terminal/process handle、cancel object、runtime token 等 live lease 是 host-private。                                                            |
| Context                   | 项目记忆、AGENTS overlays、context settings、授权读根、capability fragments 通过共享 runtime assembly 进入会话；Webview/TUI 只负责展示或输入采集。                                                                                               |
| Content access / cache    | 工作区资源共用 project cache artifact root；metadata ledger、quota、touch 和 GC eligibility 进入用户级 `neko.db` cache tables。Extension-private artifact 只服务 no-workspace 或 VS Code 私有资源。                                                 |
| Dependency injection      | 文档、图片和可选解析依赖通过 host content-access runtime 注入；缺失依赖要返回一致 diagnostic，不能在某个宿主静默 fallback 成空内容。                                                                                                             |

Host-private 数据不能伪装成共享业务结果。Webview URI、blob URL、Extension memento、VS Code handle、Extension-private cache、TUI 进程 handle、终端尺寸、键盘状态和 headless 报告路径都不是 durable workspace identity。跨宿主请求遇到这些能力时，应返回 host-private/unavailable diagnostic，而不是 no-op、当作普通 prompt、读另一端私有缓存，或回退旧实现。

### Generated output 与 AssetLibrary 身份

媒体生成完成后，生成文件及 generated-output index 记录服务于预览、`ReadImage`、perception、异步 continuation、重载以及 revision/digest/generation lineage；它们不是 AssetLibrary `AssetEntity`。Agent task-result observation 对未显式加入资产库的生成结果只投影 `ResourceRef`，不得根据 presentation `assets[]` 字段名推断 `kind: asset`。

```text
GeneratedOutput / ResourceRef
  -> preview / ReadImage / perception / async recovery
  -> explicit Import or Promote
  -> AssetLibrary AssetEntity
```

`ListAssets` 和 `GetAsset` 只查询 AssetLibrary。它们不得 fallback 到 generated-output index；用户或 Agent 显式 Import/Promote 成功后，使用该操作返回的新 AssetEntity id 访问资产库。真实 AssetLibrary task result 必须通过 typed `asset` result ref、`assetId` 或 `assetIds` 声明身份，不能依赖通用集合名。

新增 Agent 业务能力时，默认接入顺序是：先定义共享 contract 和 path-level 测试，再实现 Extension/TUI adapter，最后做 Webview 或终端展示。测试应能证明 canonical runtime、catalog、task/cache path 被命中，并能 poison legacy path 证明旧 readline interactive、TUI-local raw config、TUI-local Skill loader 或结果型 fallback 没有参与成功路径。

新增 Agent 功能的验收顺序是：先用 mock 与 real workflow/TUI lane 验证 Agent 核心行为、Skill/Tool/prompt 效果、长时间任务、失败诊断和稳定性；确认核心路径可用后，再用 VS Code Extension Development Host + `vscode-extension-debugger` 验证 Webview UI 投影、交互、`invokeSkill` / active Skill 指示器和 UI Skill 使用效果。Webview 验收不能替代 Agent/TUI 核心行为验证，TUI/headless 验收也不能替代 VS Code Webview runtime 验收。

---

## 核心模块

### @neko/agent — Agent 运行时

Agent 的核心执行引擎，零 VSCode 依赖，Terminal TUI/headless 与 Extension 复用。

| 模块           | 职责                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `executor/`    | AgentExecutor — ReAct 循环（think-phase → act-phase → hook-runner）                                                                |
| `session/`     | AgentSession 生命周期 + stepToEvents/recordStepInHistory 纯函数 + Initializer                                                      |
| `tools/`       | ToolRegistry + 内置工具（Read/Write/Bash/Grep）+ ToolSet 双层注入（always/dynamic）+ 元工具                                        |
| `skill/`       | SkillService + SkillRegistry + Loader + Matcher + 3-track 原子注入（Coordinator + Injector + ToolGuard）+ 斜杠命令（command 字段） |
| `mcp/`         | MCP Client（Stdio/HTTP）+ 工具桥接 + 测试服务                                                                                      |
| `context/`     | ContextManager + TokenBudgetManager + ConversationCompressor                                                                       |
| `permission/`  | IPermissionManager 接口 + 规则匹配（plan/ask/auto 三模式）                                                                         |
| `hooks/`       | ExecutorHooks + composeHooks + factory                                                                                             |
| `hook-loader/` | SettingsHookLoader（settings-based hooks；`.neko/hooks` 仅作为弃用诊断路径，不再加载）                                             |
| `prompt/`      | SystemPromptComposer（分层合成）+ SystemPromptBuilder（多语言 + AGENTS.md）                                                        |
| `runtime/`     | 统一 runtime bootstrap 契约（workflow/artifact/capability/feedback）+ `createAgentSessionWithRuntime()`                            |
| `plan/`        | Plan 管理器 + Markdown 解析                                                                                                        |
| `input/`       | InputProcessor — @ 文件引用解析（IFileReader 接口）                                                                                |
| `subagent/`    | 子 Agent 管理                                                                                                                      |
| `task/`        | 后台任务管理器 + 持久化 + 恢复                                                                                                     |
| `validation/`  | 输出验证器（Image/Output/Mermaid/JSON/Length）                                                                                     |
| `memory/`      | 项目记忆（`.neko/memory.md`）+ recall / extraction                                                                                 |
| `commands/`    | 内置斜杠命令处理（help/status/clear/config/skills/tools/plan 等）                                                                  |
| `errors/`      | 统一错误类型                                                                                                                       |

### @neko/platform — AI 服务平台

LLM 适配和媒体生成服务。62 个源文件。

```
配置策略：
├─ Effective Snapshot: 共享 resolver 输出同一份 Webview/TUI 工作区快照
├─ Providers/Models/Credentials: 用户配置（~/.neko/config.toml）、环境凭据、账号 catalog
├─ Workspace defaults/scalars: 工作区配置（.neko/config.toml）只能通过 snapshot policy 选择或覆盖
├─ MCP Servers: 用户配置 + 工作区配置（workspace 按 id 覆盖 user）
└─ Runtime controls: 当前会话状态，不自动回写 TOML

模型选择: 显式 provider/model 失败即报错；未显式选择时才从可用 chat 模型中解析；Webview/TUI 对同一工作区必须得到同一结果或同一 diagnostic
```

| 模块           | 职责                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `llm/adapter/` | 7 个 LLM 适配器（Anthropic/OpenAI/Google/Azure/Ollama/Generic + AI-SDK 统一）+ AdapterRegistry + StreamAggregator |
| `provider/`    | ProviderRegistry（适配器查找）+ PlatformError（统一错误分类）                                                     |
| `config/`      | ConfigManager（用户配置 + 工作区 MCP 合并）+ ChatModelService + 导入导出 + 首次运行默认值                         |
| `media/`       | MediaService + 8 个适配器（Runway/Luma/MiniMax/Suno/Vidu/Midjourney/LibLib/OpenAI-compat）+ 路由 + 任务执行       |
| `service/`     | IService 门面 + ModelSelector（优先级 fallback）+ PromptManager + ToolRegistry                                    |
| `core/`        | BaseRegistry + HttpClient + ConcurrencyPool（re-export from @neko/shared）                                        |
| `types/`       | Provider/Model/Config 类型定义                                                                                    |

### @neko-agent/extension — VSCode 扩展

纯 VSCode 集成层（胶水代码），不含 AI 业务逻辑。52 个源文件。

所有 AI 功能委托给 `@neko/agent` 和 `@neko/platform`。Extension 只负责：

- VSCode EventEmitter 桥接
- postMessage 消息路由
- 文件系统操作（IFileReader 与 HookFileService 的 VSCode 实现）
- Webview 生命周期管理

| 模块            | 职责                                                                                                                                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bootstrap/`    | 服务初始化 + ServiceCollection 组装                                                                                                                                                                                                                                                      |
| `chat/`         | ChatViewProvider + Webview 消息 Router + 专用桥接 Handler（task/skill/plan/settings/context/conversation/file/integration/slashCommand）                                                                                                                                                 |
| `chat/message/` | AgentMessageTurnHandler（消息回合桥接）+ AgentTurnBridge + AgentStreamProcessor（AgentEvent → postMessage）+ AttachmentProcessor                                                                                                                                                         |
| `ai/`           | AgentRunner（薄包装 AgentSessionRunner）+ AgentManager（多会话池委托 @neko/agent/runtime）+ AgentContext                                                                                                                                                                                 |
| `services/`     | ConfigBridge（配置消息路由）+ SkillFileService/HookFileService（文件监听）+ ConnectionStateManager                                                                                                                                                                                       |
| `editor/`       | EditorModel + EditorRegistry（活动编辑器抽象）                                                                                                                                                                                                                                           |
| `tools/`        | 扩展工具注册（NekoCut/NekoCanvas/NekoStory API 桥接）                                                                                                                                                                                                                                    |
| `pipeline/`     | Pipeline 编排层：7 stages（readDocument → parseStoryboard → importStoryboardToCanvas → generatePrompts → generatePilot → batchGenerate → arrangeOnTimeline）+ pipeline-adapters（IStructuredStoryPlanner / IStoryboardCanvasSink 等桥接器）+ pipeline-progress-bridge（事件转发 + 回写） |

### @neko-agent/webview — 对话 UI

React 对话界面，通过 postMessage 与 Extension Host 通信。117 个源文件。

| 模块          | 职责                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| `components/` | ChatView + ContentBlocks 时序渲染 + SettingsView + ToolCallDisplay + MermaidBlock |
| `handlers/`   | 消息处理注册表（streaming/tool/conversation/config/task）                         |
| `hooks/`      | Zustand 状态管理（多会话隔离：conversation/config/ui/resource）                   |
| `messages/`   | type-safe postMessage 构建器                                                      |
| `config/`     | 预设配置（providers/prompts/MCP servers）                                         |
| `i18n/`       | 国际化                                                                            |

### Agent 流式交付、Markdown 与持久化生命周期

长文本生成采用分层背压，而不是让 provider fragment 频率穿透所有边界：

```text
provider transport fragments
  -> turn-scoped semantic accumulator
  -> conversation-owned ConversationProjectionStore
  -> attachment-scoped snapshot / ACK / patch queue
  -> TabRenderRuntime projection replica
  -> Tab-owned MarkdownStreamingSession
  -> React normalized Markdown adapter

conversation snapshots
  -> storage-scoped persistence coordinator
  -> serialized local storage mutation
```

#### 语义流边界

- provider 的 `text_delta` / thinking fragment 是传输片段，不是独立的历史语义步骤。它们只更新当前回合 accumulator，并尽快产生可见增量。
- working-memory、journal、history 与 context compaction 只在真正的语义事件、回合/模型预算边界或终态发生时更新；禁止按 provider chunk 执行完整投影或 compaction。
- turn accumulator 只在一个 `conversationId + turnId + messageId` 生命周期内复用。禁止跨 turn 共享 mutable accumulator，也不建立全局 Timeline mutable state。

#### Authoritative projection 与 attachment delivery

`ConversationProjectionStore` 是活动回合显示顺序的唯一权威。它由 conversation runtime 持有，以稳定的 conversation、turn、message 和 item identity 累积 assistant、thinking、tool、task、media 与 completion 投影；相邻文本 append 和 latest-value progress 在发送前有界合并，provider chunk 数量不得直接等于跨进程消息数量。

- 每个打开的 Tab 建立独立 attachment，并通过同一串行队列执行 snapshot、ACK、patch 和 detach。snapshot ACK 前不得发送 patch。
- attachment identity 包含 endpoint epoch、attachment、Tab 与 conversation。endpoint 重建会使旧 attachment 全部失效，并为保留 Tab 创建新 attachment 和权威 snapshot。
- established live attachment 的 frame gap、base-version mismatch 或 identity mismatch 是 typed fatal diagnostic。旧 attachment 不得请求 snapshot 后继续运行；恢复必须创建新 attachment。
- Tab visibility 只改变 keyed component subtree 的显示状态，不 attach、detach、flush、discard、重置或改变投影序列。
- rebuildable delivery revision、connection recovery descriptor 和 Timeline snapshot-request protocol 已删除；conversation projection 与持久历史不依赖 React commit 顺序。

#### Webview commit 与 canonical Markdown

- 一个有效 projection frame 只产生一次 Tab runtime state transaction。多个 host frame 若落在同一 animation frame，会按 item 合并为至多一次 streaming render revision。
- 会话投影与 Markdown external store 使用同一有序提交边界：先把已接受 delivery 提交到 Markdown session 但不通知订阅者，再提交 conversation refs/React state，最后每个受影响 session 只 publish 一次。Renderer 保留 source identity fail-visible 检查，禁止用 catch、fallback 或关闭检查掩盖跨状态源竞态。
- 共享 Host message 只提供已完成历史和 Timeline item 到达前的等待信号；没有 snapshot、空 snapshot 或只包含历史 turn 的 snapshot 都不得让未被当前 Timeline 表示的活动 message/block 进入 Renderer。只有匹配的 conversation/message/item Markdown session 已提交后才能发布活动渲染投影。
- completion、replace、error、attachment detach 与 Webview disposal 必须 flush 或 cancel 待提交 frame，禁止遗失最后一个 delta；Tab switch 不参与 delivery lifecycle。
- 每个 assistant text/thinking item 复用一个 `@neko/markdown` `MarkdownStreamingSession`。append 推进同一个 session；replace 创建新的 source generation；snapshot 只用于 resync；complete finalizes 同一 session。
- 历史完成消息也进入同一 normalized session/React adapter，不允许 `react-markdown`、final-only parser 或 raw-source success fallback。
- 原始 fenced Markdown 是视觉 source authority。normalized `codeBlock` node 可投影带 source range/provenance 的 semantic composite metadata，但不得删除原始 fence，也不得把 derived composite 再显示成第二个独立 artifact。
- normalized contract 的未知 node/schema、活动流缺失 Markdown session 或 source mismatch 都必须 fail-visible。

#### Conversation render ownership 与 Tab visibility

- `TabRenderRuntime` 是 Webview 内 canonical 的 per-Tab render owner，拥有输入、附件、引用、配置选择、投影 replica、Markdown session、焦点、滚动、菜单和诊断。`ConversationRenderCoordinator` 只负责 conversation-scoped host mutation projection，不拥有 foreground UI 状态。
- 每个打开的 UI Conversation Tab 和 character-role Tab 都创建独立 keyed subtree：

  ```text
  create TabRenderRuntime(tabId, conversationId)
    -> attach authoritative conversation projection
    -> hydrate Tab-owned config and input state
    -> render keyed ConversationTabRuntimeView
    -> activation changes visibility only
  ```

- activation 不复制输入或配置，不重绑 session，不 flush/discard projection，也不触发 foreground save/restore effect。隐藏 Tab 继续接收自己的 projection；后台更新不得夺取其他 Tab 的滚动、焦点或 composer 状态。
- 干净的 inactive historical subtree 可按有界策略 unmount，但独立 store 与 projection replica 保留；remount 只能从自己的 runtime 或新 attachment snapshot 恢复。
- cleanup 按 scope 分离：Tab close 释放该 view runtime 与 attachment；Webview endpoint teardown 使旧 attachments 失效；conversation disposal 只清理目标 conversation runtime。关闭 Tab 不取消仍在运行或可恢复的 conversation。
- `pagehide` realm teardown 清空 Markdown session/subscription 时不得再通知正在卸载的 React subscriber，否则旧 React tree 会在真正销毁前读取已经删除的活动 session。conversation/turn scoped disposal 仍保留 scoped invalidation。

#### 串行持久化与 completion barrier

- 每个本地 conversation storage authority 复用一个 `ConversationPersistenceCoordinator`；不同 runtime 不得并发写同一 storage scope。
- partial snapshot 使用 latest-wins coalescing；terminal save/delete 是 required operation，必须可等待。`flush()` 只等待其调用水位，`dispose()` 必须 drain 已接纳写入后再释放 storage。
- 同进程正常单 turn 不应产生 stale-write；真正的外部 writer conflict 保持 fail-visible，不重试成静默成功。
- 正常完成顺序是：finalize accumulator → commit authoritative projection → enqueue terminal attachment patch → await terminal persistence → 返回区分 model completion、projection delivery、attachment state 和 durability 的 typed lifecycle result。
- cancellation、conversation clear、Webview close 和 Extension deactivation 必须停止 late callbacks，并释放 timer、subscription、attachment queue、Markdown session、frame callback 与 pending write。

#### 实例复用边界

| 实例                                    | 复用范围                                                                  | 禁止范围                             |
| --------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------ |
| semantic accumulator / projection store | accumulator 限定同一 turn；projection store 属于一个 conversation runtime | 不跨 conversation 共享 mutable state |
| projection attachment queue             | 一个 Tab attachment 与 endpoint epoch                                     | 不跨 Tab 共享序列或 ACK 状态         |
| Tab render runtime                      | 一个打开 Tab；可有界保留 store/replica                                    | 不通过 active 标记模拟多个 Tab       |
| Markdown streaming session              | 同一 message/item/source generation                                       | replace 后不得继续复用旧 generation  |
| persistence coordinator                 | 同一本地 storage authority 生命周期                                       | 不跨独立 storage authority 共享      |
| Webview frame scheduler                 | 一个 Webview runtime                                                      | dispose 后不得接收新 delivery        |

这些 coordinator 都留在 owning package：它们分别拥有 Agent 语义、VS Code `postMessage`、Webview frame/DOM 和 conversation storage 生命周期。当前不存在可同时满足这些契约的共享调度器；只有第二个子包出现相同运行环境与生命周期语义时才提取中立抽象。

### apps/neko-tui — Terminal TUI 与 headless 工具

独立终端 TUI 与 headless/validation 应用，直接复用 `@neko/agent` + `@neko/platform`。Commander 命令、Ink UI、terminal presentation、Node host composition 与 debug automation 均由应用拥有，不再通过 `@neko/cli` facade 暴露。

TUI/headless 特有的 bootstrap 层（`createCLIPlatform()`）负责：

- 每个 Ink application root 创建一个 `AgentTuiApplicationRuntime`，每个 hosted conversation 创建独立 `TuiConversationRuntime` 和 agent/config/conversation/UI store bundle。
- resume 激活目标 conversation controller 并切换 keyed component subtree，不把同一模块 store 重绑到另一个 conversation。
- application/session unmount 先取消异步初始化并释放 session 资源，再 dispose runtime；unmount cleanup 不调用 React state setter。

- 从环境变量注入 API Key（`ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 等）
- 基于文件的用户配置（`~/.neko/config.toml`，与 Extension 共享）
- `toSharedService()` 适配 platform Service → `@neko/shared.IService`

| 模块          | 职责                                                       |
| ------------- | ---------------------------------------------------------- |
| `components/` | Ink React 组件（ChatView/Input/StatusBar/ToolCallDisplay） |
| `adapters/`   | LLMServiceAdapter（IService 桥接）                         |
| `stores/`     | Zustand 状态（agent/conversation/config/ui）               |
| `hooks/`      | useAgentSession + useKeyboardShortcuts                     |
| `core/`       | createCLIPlatform + bootstrap                              |

#### TUI Markdown canonical presentation

Assistant Markdown from the first streaming delta through finalization uses one message/timeline-scoped `MarkdownStreamingSession` from `@neko/markdown`. Historical finalized content enters the same path as an immediately finalized session; `StreamingText` is not an assistant Markdown renderer.

```text
authoritative assistant source
  -> @neko/markdown normalized session/document
  -> apps/neko-tui terminal projector
  -> adaptive table/code/text layout
  -> renderer-owned safe ANSI/OSC encoding
  -> thin Ink Text component
```

The semantic parser/document is shared, while terminal projection remains `apps/neko-tui`-local. `TerminalTextMetrics`, Unicode/ASCII borders, terminal theme/capability resolution, table modes, whole-block highlighting, resize reflow and ANSI/OSC trust handling are terminal presentation responsibilities and do not belong in `@neko/markdown` or `@neko/ui`.

All source-backed ranges use half-open UTF-16 offsets `[startOffset, endOffset)`. Resize changes projection/layout generations against the same document revision and must not reparse. Resource/link resolution is immutable and revision-associated; arbitrary provider terminal controls and unvalidated local/file targets remain inert. Resource budgets and caches are centralized in application-local `MarkdownResourcePolicy`, not user settings.

The removed TUI regex parser, line-regex highlighter, final-only renderer and assistant `StreamingText` Markdown path have no fallback. Agent Webview migration is separately tracked by `openspec/changes/migrate-agent-webview-to-normalized-markdown`; cross-host semantic unification is not complete until its legacy parser poison and Extension Development Host gates pass.

---

## 统一 Runtime Bootstrap

`AgentSession` 现在有两层创建语义：

1. `AgentSessionConfig`
2. `AgentRuntimeConfig`

宿主统一走：

```text
host bootstrap
  -> createAgentSessionWithRuntime(...)
  -> buildAgentSessionConfigWithRuntime(...)
  -> createAgentSession(...)
```

`AgentRuntimeConfig` 分成四个 plane：

- `workspaceStore`：workspace、journal writer 和 grounded output 引用平面
- `capabilityRuntime`：skill / toolGroup / promptFragments 等动态能力注入
- `feedbackLoop`：project memory、journal-as-SSOT、memory recall/extraction 等反馈设置

关键约束：

- 宿主的显式 `AgentSessionConfig` 字段优先于 runtime 默认值
- extension、Terminal TUI 和 headless 工具不再各自手写一套 session bootstrap 映射逻辑
- Node 宿主统一复用 `createNodeWorkspaceRuntimeStore()` 组装 workspace plane

Prompt/Skill/Command 编排、Capability 注入和 feedback 应优先接到普通 runtime plane，而不是把新字段散落进宿主入口或恢复 IDC/Plan runtime。

---

## 通信模式

### Extension ↔ Webview（postMessage）

```
Webview → Extension:
  sendMessage, confirmTool, cancelMessage,
  newConversation, switchConversation, deleteConversation,
  getSettings, updateSettings, invokeSlashCommand,
  clearActiveSkill,
  searchProjectFiles, getTasks, cancelTask,
  projectionEndpointDiscover, projectionAttach,
  projectionSnapshotAck, projectionDetach,
  requestCanvasAuthoringHandoff

Extension → Webview:
  projectionEndpointReady, projectionSnapshot,
  projectionPatch, projectionAttachmentDiagnostic,
  thinking, streamText, streamThinking,
  toolCall, toolResult, toolConfirmation,
  streamComplete, agentPhase, error,
  taskCreated, taskUpdated, tasksUpdated,
  mediaTaskCreated, mediaTaskProgress, subagentEvent,
  contextTokenCount,
  conversations, activeConversation, settings, tabState
```

### Workspace Board 投影与历史 Authoring Handoff

Agent core 和 session 不拥有 Canvas destination、Board work session、conversation binding、Board index/scope resolver、delivery runtime 或 Cut target state。核心只观察通用 Tool/Task/result、diagnostic 与 Approval。VS Code/TUI Host composition 可以把已声明的 creator-visible typed result 交给 owning Canvas projector，但目的地状态不能进入 Agent contract。

没有显式 Canvas target 时，公共 `NekoCanvasAPI.boards.project()` 只写 `neko/boards/workspace.nkc`；显式 target 是普通 `.nkc` identity。它不解析活动/最近文档、会话、scope 或文件名。Generated Output owner 先将 creator-visible binary 保存到 `neko/generated/<kind>/` 并建立 revision/digest/lineage/`ResourceRef`，Canvas 再写普通持久 Inbox Group/Media 节点；AssetLibrary promotion 是独立可选动作。

普通问答、reasoning、日志、provider scratch、未选搜索结果、runtime handle 和 non-reviewable failure 不投影。目标缺失、权限失败或 revision conflict 只产生 projection diagnostic；生成文件继续由 generated-output owner 保留，不重新解析或改投其他 Canvas。

一次 terminal creator-visible 结果以 `CanvasWorkspaceProjectionRequest` 批次提交，而不是逐 asset 写入。Host 在结果 owner 已确认 durable 后收集实际消费的 `ResourceRef`/`DocumentArchiveResourceRef`、命名 reviewable Markdown 和生成生命周期，按 `source → analysis → output` 角色交给 Canvas-owned coordinator。批次通过用户级 `LocalMetadataStore` 的 `tasks` / `task_checkpoints` 账本排队、claim、receipt 和恢复；`system:canvas-board-*` 行不会进入 Agent TaskManager、`/tasks` 或通用 cleanup。SQLite 只保存投递状态，`.nkc` 仍保存节点、布局和用户编辑事实。

多 Host 通过 workspace-scoped fenced writer epoch 串行化 load-plan-save；保存前重新校验 epoch 与 revision。重复 delivery 返回同一 receipt/no-op，dirty 的已打开 Canvas 返回 conflict，失效 Host 不得写入或将结果改投另一个 Canvas。Board 投递失败不影响已 durable 的 artifact，presentation 分开显示 artifact durability 与 Board 状态。

下面的 handoff 仅服务未参与当前 typed delivery 的历史/外部内容和显式专业 authoring，不是新结果的默认保留流程。

Agent 是 Canvas Skill activation 和 tool selection 的拥有者。Agent Webview 的显式 Add/Import to Board Canvas 不直接调用 Canvas command，也不选择 `canvas.ingestMarkdown`、`canvas_create_node` 或 `neko.canvas.importAsset`。它只发送 `requestCanvasAuthoringHandoff`，携带 source content、source kind、stable resource refs、semantic stable refs、diagnostics、prompt spans、provenance、user intent 和 target hints。

Extension Host 路由该消息时只创建普通 Agent user message + `document-selection` context payload：

```text
Historical/external Add to Board button
  -> requestCanvasAuthoringHandoff
  -> Extension message route
  -> Agent-visible user message + context payload
  -> Agent may query GetContext(includeTools), activate canvas-authoring Skill,
     call canvas_describe_authoring_capabilities / active context,
     choose Canvas tools, ask approval, import explicitly, or decline
```

边界规则：

- Extension/Webview 不通过关键词、表头、profile hint 或资源类型预激活 Canvas Skill。
- Markdown projections from `@neko/markdown` are metadata only：stable refs、diagnostics、prompt spans 和 `declared*Hint` 可帮助 Agent 决策，但不成为 Canvas validation/mutation authority。
- Canvas authoring tool results are rendered read-only in Agent Webview: refs、diagnostics、blocked reason、prompt-field alignment 和 next actions 会展示给用户，但 approval-gated next actions 不能因渲染自动执行。
- 历史/外部素材导入必须使用显式 Import / Add Source affordance；当前 typed result 已由 Board 自动投递，不再显示通用 `Send to Canvas`。

### Package Authoring Transfer

Agent/plugin transfer planner 负责选择包级 authoring 能力，具体 `.nk*` 项目写入由 owning package service 执行。VS Code、Terminal TUI、Electron 和 Agent host adapter 共享同一 transfer contract：`target`、`reveal`、stable source/ref、provenance 和 structured diagnostics。

Canonical durable authoring commands:

| 目标                          | 命令                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Cut generated clip            | `neko.cut.authoring.importGeneratedClip`                                       |
| Cut storyboard / Canvas draft | `neko.cut.authoring.importStoryboard` / `neko.cut.authoring.importCanvasDraft` |
| Sketch image source           | `neko.sketch.authoring.importImageSource`                                      |
| Model asset                   | `neko.model.authoring.importAsset`                                             |

旧 UI-bound command id 不是 Agent/Assets 默认投递目标。`neko.cut.importGeneratedClip`、`neko.sketch.importAsset`、`neko.model.importAsset`、隐藏打开编辑器、Webview pending import 或 temp project 都不能作为 durable write 成功路径。package authoring 返回 `ok: false` 时，Agent 展示 diagnostic 并停止，不改用 Webview fallback。

### Agent 执行流

```
用户输入
  │
  ▼
AgentMessageTurnHandler（Extension — Host 资源桥接）
  ├─ runAgentMessageTurnRuntime（@neko/agent/runtime — 消息回合规则）
  ├─ InputProcessor 解析 @ 文件引用
  ├─ AttachmentProcessor 处理附件
  │
  ▼
AgentRunner（Extension — VSCode 事件适配）
  │
  ▼
AgentSessionRunner → AgentSession → AgentExecutor（ReAct 循环）
  │
  ├─ LLM 调用 → IService → @neko/platform → Claude/OpenAI/Google API（流式）
  │
  ├─ 工具调用 → ToolRegistry → 内置/MCP/扩展工具
  │     ├─ 权限检查 → PermissionSystem（plan/ask/auto）
  │     ├─ ToolGuard → 技能白名单
  │     └─ Hook 链 → ExecutorHooks
  │
  ├─ 技能 → SkillService → 发现 + 3-track 原子注入
  │
  └─ 上下文 → ContextManager + TokenBudgetManager → 压缩/摘要
         │
         ▼
AgentStreamProcessor（Extension — 语义事件翻译与 delivery barrier）
  ├─ provider fragment → turn accumulator
  ├─ semantic event → Timeline V2 operation
  ├─ delivery scheduler → bounded/serialized webview.postMessage
  └─ completion barrier → terminal delivery + durable persistence result
```

---

## 关键设计模式

| 模式            | 应用                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| **Factory**     | `createPlatform()`、`createAgentSession()`、`createAgentSessionWithRuntime()`、`createCLIPlatform()` |
| **Registry**    | ToolRegistry、SkillRegistry、ProviderRegistry、AdapterRegistry、MediaAdapterRegistry                 |
| **Adapter**     | 7 个 LLMAdapter + 8 个 MediaAdapter — 统一接口适配异构 API                                           |
| **Facade**      | Service（platform 门面）、ChatViewProvider（extension 门面）                                         |
| **Observer**    | vscode.EventEmitter（AgentRunner）、onProgress（MediaService）                                       |
| **Strategy**    | ExecutionMode（plan/ask/auto）、ToolInjectionLayer（always/dynamic）                                 |
| **Composite**   | composeHooks — 多个 ExecutorHooks 组合                                                               |
| **Coordinator** | SkillInjectionCoordinator — 3-track 原子注入/回滚                                                    |
| **LRU Cache**   | AgentManager — 多会话池化（max=10，驱逐非运行中最久未用）                                            |
| **依赖注入**    | 构造函数注入 — AgentSession/Service/ConfigManager 均通过接口解耦                                     |

---

## 技术栈

| 层级                  | 技术                                                              |
| --------------------- | ----------------------------------------------------------------- |
| Extension Host        | VSCode Extension API + TypeScript + esbuild                       |
| Webview               | React 18 + Zustand + Tailwind + Vite                              |
| AI SDK                | Vercel AI SDK (@ai-sdk/anthropic, @ai-sdk/openai, @ai-sdk/google) |
| MCP                   | MCP Protocol（Stdio/HTTP 传输）                                   |
| Terminal TUI/headless | Ink 5 + React 18 + Zustand + commander + chalk                    |
| 测试                  | Vitest v4                                                         |
