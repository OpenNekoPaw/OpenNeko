# Agent 横切架构

更新日期：2026-07-15

> 2026-07-15 收敛：固定 IDC profile/stage/run/persona 与 Draft/Plan/Apply runtime 已删除，当前约束见 [`adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md`](adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md)。Canonical path 是普通 Agent session/turn/ReAct；`executionMode` 只控制权限和计划提示，Markdown/TODO 不拥有执行状态。

Agent 是 OpenNeko 的领域无关智能运行内核，不是创作领域，也不内置影视、动画或媒体制作能力。它只提供 session/conversation、memory/context、Prompt 与 Plan Mode、Approval、Task、MCP、subagent、Skill、Tool、Provider adapter 和普通结果续作；视频、音频、模型、2D、互动及其他领域能力通过扩展组合进入。

## 设计目标

- 让 Agent 能组合各创作领域能力，而不直接耦合 Webview 或子包实现。
- 保持 Agent/Platform 极简且领域无关；任何非核心语义只能由 Skill、Tool、subagent 或 owning package 注入。
- 将 Prompt、Skill、Tool、Memory、Provider、Approval、Evaluation 分成可测试控制面。
- 让 Agent 产出的媒体、实体和项目事实重新接地到 Assets、Entity、Search、Engine 或领域格式。

## 核心原则

- Agent-first：用户意图先进入通用 Agent runtime，由模型根据当前注册上下文决定是否激活 Skill、派生 subagent 或调用领域 Tool；core 不用硬编码领域词表代替该判断。
- API-first：跨层交互先定义 shared contract、command、provider、port 或 message schema，再接 UI 和具体实现。
- Prompt-first：Prompt 只表达上下文、角色、约束和行为策略，不隐藏宿主副作用。
- Agent-directed creation：创作下一步、反馈、审阅和恢复由普通 Agent ReAct 判断；Approval、Task、validation 和领域 project 各自拥有授权、异步执行、校验与项目事实，不存在 IDC profile 或平行创作 runtime。
- Skill-first：Skill 描述可跳过、重排和重复的领域方法、创作语义、输出标准和适用条件；具体工具协议、命令列表和子包 schema 由系统提示词、子包 capability 和 Tool schema 提供，不成为私有 workflow engine。
- Tool-as-capability：Tool 是可审计能力入口，必须有来源、权限、schema、trust、输入输出 contract。
- Provider-neutral：runtime 不依赖具体模型供应商语义，provider adapter 负责 tool calling、structured output、多模态消息投影差异。
- Grounded-output：Agent 输出要进入持久上下文，必须接地到 `ResourceRef`、asset/entity ID、Search source、Engine output 或领域项目格式。
- Human-governed：不可逆、高成本、外部副作用、信任边界变化和项目事实改写必须经过 Approval/Policy。
- Host-agnostic runtime：Agent runtime 不知道 VS Code、React、Webview、Node 文件系统细节；这些都通过 host adapter 注入。
- Domain-neutral core：Agent/Platform core 不定义 creation profile/guidance、创作 summarizer、媒体 Skill 路由、Storyboard validator、媒体 task projector、CreativeAgent 或 MediaPlanner；通用 matcher/validator/projector 必须由注册元数据或 adapter 驱动。
- Workspace-shared business plane：同一工作区的配置、会话身份、Skill/command catalog、任务事实、上下文和资源缓存策略必须复用共享 contract；平台差异保留在 host adapter 和 projection。
- Projection-only UI：Webview 展示消息、任务、Agent-native creation 状态、artifact 和设置投影，不拥有 Agent 业务策略。

## 分层

| 层            | 职责                                                                                  |
| ------------- | ------------------------------------------------------------------------------------- |
| `agent-types` | Webview/Extension/runtime 共享协议、消息、投影和状态 contract                         |
| `agent`       | host-agnostic session/turn runtime、Prompt、Skill、memory、Tool、Approval、Task continuation |
| `ai-sdk`      | Provider/AI SDK adapter，不承载 UI 或 VS Code 逻辑                                    |
| `platform`    | host-agnostic 平台桥、配置、provider glue 和能力注入                                  |
| `extension`   | VS Code commands、配置桥、host adapters、会话入口、资源授权                           |
| `webview`     | Chat UI、输入、消息投影、用户反馈、短生命周期 UI 状态                                 |

`apps/neko-tui` 是 Terminal TUI/headless 产品 owner，负责 Commander、Ink、terminal projection、Node host composition 和 debug automation，并复用上述 runtime 能力。

## 包职责边界

| 包/层         | 可以做                                                                                                                    | 不可以做                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `agent-types` | 定义 Webview/Extension/runtime 共享消息、provider、Prompt schema、work item、Task 和 artifact projection              | 导入 runtime、VS Code、React 或 provider SDK         |
| `agent`       | session/conversation、memory/context、Prompt/Plan、MCP、subagent、Skill/Tool lifecycle、Approval、通用 validation 和 Task continuation | 读写 VS Code API、渲染 UI、直接访问 Webview、内置任何创作领域语义 |
| `ai-sdk`      | provider adapter、model invocation、tool/structured-output projection、多模态消息投影                                     | 拥有创作 lifecycle、读取项目文件、决定领域语义       |
| `platform`    | host-agnostic Provider/配置/注册 glue、market Skill adapter 和通用能力注入                                                | 依赖 React/Webview、实现 VS Code UI、拥有媒体/角色/分镜等领域执行或结果解释 |
| `extension`   | VS Code command、Webview bridge、file/resource/auth/engine/entity/search host adapter、lifecycle/disposable               | 沉淀 Agent runtime 决策或 prompt 拼装                |
| `webview`     | Chat、settings、Skill catalog、Task/artifact projection、用户确认                                                        | 导入 runtime/platform/ai-sdk，执行工具或访问文件系统 |
| `apps/neko-tui` | Terminal TUI/headless shell、TUI adapter、Node host composition 与 executable                                           | 绕过 runtime 另建 Agent 业务路径                     |

## 架构视图

```text
Webview / Terminal TUI projection
  -> Extension or shell host adapter
  -> Agent runtime
  -> Platform, provider, skill and capability adapters
  -> Domain services, Engine, Assets, Entity, Search, Market
```

### 五层设计约束

| 维度   | 约束                                                                                                                                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责   | Webview/Terminal TUI 只投影交互；Extension/shell 只注入宿主能力；Agent runtime 拥有通用 session/turn、Skill、Prompt、Tool、Task continuation、memory、approval 和 validation 协调；Platform/AI SDK 只适配 provider/注册；Skill、Tool、subagent 与领域服务拥有具体创作方法和事实 |
| 依赖   | Webview 依赖 `agent-types`，不依赖 runtime；Extension 可依赖 runtime 和 platform，但不沉淀策略；`agent`、`platform`、`ai-sdk` 保持 host-agnostic；领域包通过 capability、command、facade 或 shared contract 接入                         |
| 接口   | Webview protocol、runtime ports、provider adapter、capability contribution、tool schema、artifact projection 和 grounded refs 分层定义，不能用自由 JSON 在层间扩散                                                                       |
| 扩展   | 新 provider、新 Skill、新 market capability、新领域工具先进入 registration，再按当前 Host/context/policy 注入；扩展点不能绕过 approval、grounding 和 diagnostics                                                                          |
| 可测性 | 通过 prompt snapshot/hash、protocol schema、adapter fake、session/turn、Tool/capability policy、boundary import guard 和 projection fixture 固化确定性行为；模型驱动路径再使用真实 TUI Evaluation 证明                                         |

## 运行时入口与平面

Agent runtime 的宿主入口不应直接暴露零散构造参数。宿主应组装统一 runtime config，再创建 session。

```text
host bootstrap
  -> runtime config
      sessionSettings
      artifactStore
      capabilityRuntime
      taskContinuation
  -> AgentSession
```

| 平面                | 职责                                                                          | 约束                                                              |
| ------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `sessionSettings`   | 当前 execution mode、模型、Prompt locale、预算与 Host policy                  | 不保存创作 stage、计划授权或领域项目事实                           |
| `artifactStore`     | workspace artifact、journal writer、artifact projection、grounded output refs | 不保存 Webview URI、runtime token、临时绝对路径或 provider secret |
| `capabilityRuntime` | Skill、ToolGroup、Prompt fragments、provider cards、capability diagnostics    | registration 与 injection 分离，不能注册即注入 LLM                |
| `taskContinuation`  | 终态 Task observation、原 conversation 唤醒与结构化 result 投递               | 只投递结果，不决定下一创作动作，也不形成 workflow recovery state  |

宿主显式配置优先于 runtime 默认值。Extension、Terminal TUI 和 headless 工具不应各自维护一套 session bootstrap 映射；差异通过 host adapter 注入。

## 工作区 Runtime 共享与宿主差异

Webview/Extension 与 Terminal TUI/headless 是不同本地宿主，不要求功能完全一致。差异本身不是债务：VS Code API、`postMessage`、Webview URI、watcher、memento/recovery、Extension command、Ink 键盘流、终端进程生命周期、stdout/stderr 报告和真实 API 验证 lane 都可以保留在各自宿主。债务来自两端为同一工作区重复实现配置、会话、Skill、命令、任务、上下文或缓存业务规则。

同一工作区必须共享以下业务数据面：

| 数据面                    | 共享规则                                                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Effective config snapshot | `~/.neko/config.toml`、`.neko/config.toml`、环境凭据和账号 catalog 统一解析；Webview/TUI 对 provider、model、scalar、MCP 得到同一结果或同一 diagnostic。运行时模型/参数选择只影响当前 session，不自动重写 TOML。                    |
| Conversation/session      | 每个 conversation 拥有独立 runtime/config/queue/projection；交互式会话使用 canonical runtime assembly 和 workspace-scoped canonical conversation id。旧 `cli-*` id 不作为 TUI resume 兼容输入。                                     |
| Skill/command catalog     | Portable Skill 的标准用户/工作区来源是 `~/.agents/skills`、`.agents/skills`；Command 仍使用 `~/.neko/commands`、`.neko/commands`。其他来源不能让 TUI/headless 单独看到不同 catalog，必须通过显式 source provider 暴露 diagnostics。 |
| Async task facts          | 可跨宿主观察的任务状态进入 workspace-visible task record；live handle、lease、recovery token 和 no-workspace state 保持 host-private。                                                                                              |
| Context/memory            | project memory、AGENTS overlays、context settings、授权读根和 capability prompt fragments 通过 shared runtime assembly 注入。                                                                                                       |
| Content/cache             | 工作区资源使用 project resource-cache root、manifest、quota 和 GC 策略；cache path、Webview URI、blob URL 和 provider-private payload 不是 durable identity。                                                                       |
| Dependency diagnostics    | 文档、图片和可选解析依赖由 host content-access runtime 注入；缺失依赖返回 typed diagnostic，不在某个宿主静默降级为空结果。                                                                                                          |

跨宿主请求遇到 host-private 能力时，应返回 host-private/unavailable diagnostic，不能 no-op、转成普通 prompt、读取另一端私有缓存或回退旧实现。共享 command catalog 的 surface scope 使用 `tui` / `extension`；headless 只作为执行 lane，不伪装成交互式 CLI surface。新增 Agent 能力默认先进入共享 contract 和 path-level 测试，再由 Webview/Extension 与 Terminal TUI/headless 分别实现 adapter 与 projection。

### 异步任务结果观察

后台任务的业务闭环归共享 runtime，而不是 Webview 或 TUI 私有实现：

- `agent` 层拥有 task-result observation runtime，负责识别终态 task、记录 observation/evidence、根据 delivery policy 请求继续或自动续跑。
- owning media capability 贡献媒体任务到通用 Agent task-result 的投影，负责把 provider/model、stable result refs、generated assets、host output paths 和 delivery policy 转成共享任务事实；generic Platform 只承载注册和 Provider adapter。
- VS Code Extension、Terminal TUI、Desktop/Electron 只提供 host delivery port，例如 Webview URI、通知、Node workspace 保存目录、Electron IPC 或终端诊断。
- 同一工作区的媒体生成结果必须能被任一宿主通过 workspace-visible task record、conversation journal、`ResourceRef` 或 generated asset index 观察；Webview URI、blob URL、临时下载路径和 host-private live handle 不能作为业务事实。

TUI 不读取 VS Code 注入设置，也不模拟 Webview 消息；它通过 Node adapter 复用 `AgentEventStreamRuntimeProcessor`、task-result observation runtime 和已注册的 owning media delivery contribution。Webview/Extension 可以有 VS Code 专属资源投影、setting bridge 和通知，但不能因此复制一套 task observation 或 token/usage 计算路径。

Webview 和 TUI 的可变展示状态遵循相同 ownership 规则，但不共享 UI 实现。每个 Webview Tab 拥有独立 `TabRenderRuntime`、projection attachment、store 与 keyed React subtree；切换 Tab 只改变 visibility。每个 Ink root 拥有独立 `AgentTuiApplicationRuntime`，每个 hosted conversation 拥有独立 session/render controller 和 store bundle；resume 切换 controller，不重绑模块单例。共享目录、catalog 和默认配置只能以只读服务或不可变 snapshot 注入。

旧 Timeline delivery revision、snapshot-request recovery、foreground flush/discard 和 TUI module store singleton 已被 authoritative conversation projection、attachment snapshot/ACK/patch 和 instance-scoped runtime 取代。live attachment gap 必须 fail-visible；恢复创建新 attachment，不能在旧 attachment 上继续。

## 控制面

```text
Intent
  -> current Prompt / Skill / Tool context
  -> model decision
  -> Approval and policy when required
  -> current Tool call
  -> Tool / Task result and diagnostics
  -> grounded artifacts or owning project result
  -> next turn observation
```

控制面必须分离：

- Prompt 只描述上下文、角色和行为策略，不执行宿主副作用。
- Skill 描述领域方法、创作语义和输出标准，不描述运行时工具协议，也不成为工作流引擎。
- Tool 是能力调用入口，必须有来源、权限和输入输出 contract。
- Memory 保存可追溯上下文，不替代项目事实。
- Provider 适配模型/服务差异，不拥有创作领域逻辑。
- Approval/Policy 管不可逆、高成本或外部副作用动作。
- Evaluation 负责审阅、反馈和修复建议，不绕过权限边界。

### 约束归属平面

| 平面                 | 负责                                                                                   | 不负责                                       |
| -------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------- |
| System Prompt        | 默认 Agent 人设、通用工具协议、Markdown/引用/视觉证据规则、安全边界、失败处理          | 子包字段、运行时参数表、领域 authoring 细节  |
| Capability Injection | 子包工具/operation 名称、参数 schema、validation、diagnostics、资源绑定、能力目录      | 通用人设、跨领域 Markdown 协议、Skill 方法论 |
| Skill Content        | 扩展能力、领域方法论、创作语义、任务判断、输出风格和提示词写作规则                     | 运行时工具协议、子包内部 schema、权限授予    |
| Metadata / Schema    | Tool arguments、structured output、artifact refs、diagnostics、allowed Tools            | 决定是否执行工具                             |
| Runtime              | turn assembly、Tool lifecycle、Task continuation、artifact projection                   | 读取 VS Code API 或渲染 UI                   |
| Policy               | permission mode、trust level、approval gate、secret boundary、host availability        | 用 prompt 文案替代权限判断                   |
| Memory               | journal、conversation projection、project memory、semantic recall                      | 替代 Assets、Entity、Engine 或领域项目格式   |
| Evaluation           | deterministic checks、LLM judge adapter、diagnostics、recovery signal                  | 直接改 confirmed fact 或绕过 approval        |

这些控制面只约束当前 turn 和当前 Tool 调用，不形成创作 stage、run 或计划授权状态。

## Agent 原生动态创作

Agent 的 canonical creative path 是：读取当前事实，模型判断下一步，必要时经过通用 Approval，调用一个当前 typed Tool，观察同步或异步结果，再进入下一轮。Agent 可以跳过、重排、重复、并行或停止领域方法；runtime 不持久化固定阶段、节点图、replan taxonomy 或 target-completion state。

```text
User goal
  -> read current files / ResourceRefs / owning results
  -> decide one next action
  -> generic Approval when the current policy requires it
  -> current typed Tool call
  -> Tool or Task result / diagnostic / generated resource
  -> observe current evidence and decide again
```

`executionMode: auto | ask | plan` 只控制当前权限与提示行为。Plan Mode 可以只读分析并生成可选的 `brief.md`、`plan.md` 或 bounded TODO，但这些都是普通用户内容或进度投影，不保存 executor/schema/Task handle，不编译成 DAG，也不授权未来副作用。Creator review 只表示用户审阅了当前内容；实际高成本、外部、mutation、export 或 delivery Tool 仍按当前 policy 独立审批。

完成状态由实际文件、`ResourceRef`/digest/lineage、owning project revision、validator、Quality 与 Export 结果证明。异步 Task 只把一个终态结果送回原 conversation；Task observation 不决定下一创作动作。`AgentWorkflowDefinition`、`AgentWorkflowRun`、`AgentWorkflowNode`、`AgentWorkflowTransition`、固定媒体 stage state、workflow recovery 与 prompt-chain observation 均不保留兼容成功语义。

## Agent 交互协议

Agent 有三类协议面，不能混用：

| 协议面            | 参与方                            | 内容                                                                                | 约束                                                 |
| ----------------- | --------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Webview protocol  | Webview ↔ Extension               | `sendMessage`、confirm tool、slash command、settings、open/reveal                  | 只传投影和用户意图，不传 secret 和 runtime internals |
| Runtime protocol  | Extension adapter ↔ Agent runtime | turn assembly、Tool call/result、Task continuation、approval、memory、artifact projection | host-agnostic，使用 ports/adapters                   |
| Provider protocol | Runtime/AI SDK ↔ model provider   | messages、tool schemas、structured output、多模态 payload                           | provider-specific 差异在 adapter 内消化              |

### 消息与产物

- `Message` 是对话投影，不等于 provider 原始消息。
- `ContentBlock` 表达 thinking、text、tool call、code diff、plan、composite 等顺序展示单元。
- `ToolCall` 是内部工具调用投影，不是 provider function-call 原始 wire。
- Artifact projection 只传 compact ref、metadata、provenance 和可展示摘要；二进制内容通过资源/缓存服务按 intent 读取。
- Webview confirmation 只表达用户批准或拒绝；Approval/Policy 决策仍归 runtime/Extension adapter。

### 媒体上下文生命周期

原生媒体输入和可展开为 provider 媒体的 `PerceptionCard` 只属于引入它们的当前 Agent turn。Platform provider projection 必须以最新普通用户消息或内部 continuation 为 turn 边界，只展开该边界之后的 `MultimodalContextPacket` 和工具感知卡片。

后续 turn 保留历史工具结果中的结构、语义证据、`ResourceRef`、版本和 provenance，但不得自动重新加载缩略图、关键帧、音频或视频字节，也不得把历史 `MultimodalContextPacket` 作为 JSON 文本继续发送给 provider。需要再次查看媒体时，Agent 必须通过当前 turn 的 `ReadImage` 或 `perception.perceive` 显式重检稳定资源身份；只有新产生的当前 turn 感知结果可以再次展开。

聊天模型与理解模型相同时，当前 turn 可以使用原生多模态输入；两者不同时，媒体分析走独立 perception/tool 路径，主 Agent 消费紧凑 `PerceptionCard` 证据。两条路径都不得让历史媒体在普通“继续”或内部续跑中隐式重放。当前 turn 媒体缺失、模型不支持或加载失败时保持 fail-visible，不得回退历史媒体或返回空成功。

### 协议治理规则

- 跨 Webview 边界的消息必须由 `agent-types` 或共享 contract 定义，不在组件里临时拼自由对象。
- Provider 原始 tool call、stream event 和多模态 payload 不穿透到 Webview；runtime/AI SDK 负责投影成 `Message`、`ContentBlock`、`ToolCall` 或 artifact projection。
- Webview 不接收 secret、provider credential、native path capability 或无界二进制 payload。
- `confirmTool` 等用户确认消息只绑定明确 id；创作者对 Markdown/范围的批准通过普通对话和现有 Approval owner 记录，不恢复 Plan action 协议。
- `openFile`、`revealAsset`、`sendToPlugin`、`revealDocumentLocator` 是宿主意图，不是文件系统授权本身；Extension adapter 负责解析、授权和审计。
- 错误和降级应返回 typed diagnostic，避免只把 provider/工具原始错误文本塞进 assistant message。

### 创作表面调度

Agent 可以把领域状态投影成消息卡片、确认清单和操作按钮，但不拥有领域 Webview 的运行时状态。对于 Canvas/Cut/Preview，Agent 的职责是理解、展示、确认和调度：

| 能力            | Agent 负责                                                                   | Owning surface 负责                                                                             |
| --------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Canvas 播放顺序 | 读取 `CanvasPlaybackPlan`，展示 route 摘要、有序清单、诊断和导入确认         | Canvas 保存顺序事实，Canvas Editor Webview 内的 `PlaybackWorkspace` 拥有 route playback session |
| Canvas 预览播放 | 发起 `revealCanvasPlaybackWorkspace(sourceCanvasUri, routeId, unitId?)` 意图 | Canvas Editor Webview 显示/聚焦 `PlaybackWorkspace`、seek、播放、维护 playhead 和当前 unit      |
| Cut 剪辑结果    | 读取 timeline 摘要、展示导入或审阅建议                                       | Cut 管理 `.nkv`、timeline、clip、trim、效果、字幕、音频和播放                                   |
| 媒体预览        | 展示缩略图、poster、probe、关键帧和资源卡片                                  | `neko-preview` / Engine 负责解码、stream、seek、音频同步和资源授权                              |

Agent Chat 不应复制完整播放器、route timeline 或剪辑 timeline。Chat 内只展示轻量预览卡片，例如缩略图、当前 shot 图片、时长、素材状态、diagnostic、source mapping 和按钮：

```text
当前路线：Shot 1 · 20 units · 约 1:00
诊断：2 个镜头缺预览图，入口为自动推断
[在 Canvas 中播放] [发送到 Cut] [查看完整顺序]
```

这些按钮发送的是 reveal/open 或 confirmation intent，不是直接文件访问或 Webview store mutation。Extension adapter 负责解析资源、检查 policy、显示或聚焦对应 Webview 区域，并返回可审计 diagnostic。

Agent 可以分析视频内容，但分析路径应调用 Engine、Preview、Media LSP 或领域工具读取 probe、关键帧、字幕、音频峰值、质量诊断和 ResourceRef，而不是通过在 Chat 内播放视频来获得状态。

### Package Authoring Transfer

当 Agent/Assets/Skill 要把生成结果、分镜、素材或模型写入 Cut、Sketch、Audio、Model 或 Canvas 项目时，Agent 只负责选择能力、传递 stable source/ref、`target`、`reveal` 和 provenance，并展示 structured diagnostics。项目事实写入必须走 owning package 的 canonical authoring service/command，遵循 [`headless-project-authoring.md`](headless-project-authoring.md)；旧 UI-bound command、隐藏打开 Webview、Webview pending import、temp project 和“打开即成功”都不是 durable authoring 成功路径。

## Capability、Skill、Prompt

Capability 分 Registration 和 Injection 两个阶段：

```text
Registration
  builtin / package / market / local / MCP / provider contribution
  -> registry, diagnostics, trust, host requirements
        |
        v
Injection
  active Skill + subpackage capability + current session/context + provider capability + policy + context budget
  -> system / skill / capability prompt fragments + tool schemas + metadata allowlists + structured output schemas
```

### 能力边界

| 概念                              | 负责                                                                                        | 不负责                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Skill                             | 领域方法、创作语义、输出标准、适用场景；可通过 machine-readable metadata 引用所需工具      | 拥有 durable profile schema、执行副作用、保存项目事实、在正文描述工具协议 |
| Artifact Profile                  | 持久 artifact/table 形状、字段、schema ref、资源模态、校验和建议 action                     | 激活 Skill、执行工具、写项目事实                                          |
| ProviderCard / Expression Profile | provider/model 表达偏好、输入输出模态、generation capability、结构化输出支持                | 保存凭证、adapter wire mapping、改写领域事实                              |
| Tool                              | 原子能力调用、schema、权限、来源、结果和附件                                                | 决定何时进入 LLM 上下文                                                   |
| ToolGroup                         | 跨 Skill 共享的一组能力                                                                     | 为了视觉分组滥建                                                          |
| PromptFragment                    | 可组合提示片段                                                                              | 执行工具或读取文件                                                        |
| MCP                               | 外部 tool/resource/prompt 后端                                                              | 替代 Skill 或 Policy                                                      |

### Profile 贡献边界

Profile 是独立 capability contribution，不是 Skill 的私有提示词。内置 Artifact Profile 和 ProviderCard 只是一组 standard-library contribution；market、personal、project 或 package provider 可以通过同一 registry 路径贡献新的 profile。Skill 可以随包一起分发 profile，也可以只引用其他包贡献的 profile id；注册后 profile 以 `profileId + version + kind + source` 作为稳定契约被验证和组合。Creation Profile 及其 stage/transition/policy registry 不属于通用 Profile 能力，必须删除；创作方法由 Skill/subagent 表达，执行与校验由 Tool/owning capability 表达。

Profile-only package 合法存在，用于分发团队表结构或 provider/model expression profile，而不会生成可运行 Skill catalog entry。安装和加载前必须通过 trust、signature/verified publisher、host requirement 与 descriptor path 检查。

`skill-local` profile 只允许用于单轮临时推理 schema，不得作为 persisted artifact、project fact 或跨 Skill contract 的 profile id。持久 artifact 引用缺失、版本不支持或 `skill-local` profile 时必须返回可见 diagnostic，不允许静默当成 generic artifact。

ProviderCard 保留为兼容名称；架构上它是 provider/model expression profile 的当前实现。它描述“某厂商或某模型适合怎样表达生成意图”，不描述 credential、adapter 请求格式或用户账号配置。模型目录和 TOML 只能引用 `providerExpressionProfileId`，不能内联定义 expression prompt/schema。

### Skill 生命周期

| 阶段       | 设计规则                                                                                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discover   | 从 builtin、workspace、market、local、MCP 或 provider contribution 发现，不执行副作用                                                                                                         |
| Validate   | 校验 portable core、Host overlay、schema、trust、host requirements、metadata tool references、prompt fragment 形状                                                                            |
| Register   | 进入 registry，产出 diagnostics 和 capability metadata                                                                                                                                        |
| Activate   | 根据用户意图、slash command、active Skill 或领域上下文选择候选                                                                                                                               |
| Inject     | 在 policy、token budget、provider capability 和当前 session/context 允许时注入 Skill prompt fragments；Tool schema、capability prompt 和 structured schemas 由对应 runtime/capability 提供     |
| Observe    | 记录 capability diagnostics、tool result metadata、artifact refs 和 feedback signal                                                                                                           |
| Deactivate | 切换会话、清除 active skill、失去 trust/host requirement 或上下文不再匹配时移出 injection set                                                                                                 |

Skill-first 的含义是“领域方法包先行”，不是“Skill 拥有执行引擎或工具协议”。Portable `allowed-tools`、`agents/neko.yaml` dependencies、tool registry 和测试 fixture 可以包含机器可读工具/capability id，但 Skill prompt content 不应以自然语言教程形式描述具体工具名、命令参数、轮询协议、缓存/Webview/path 协议或子包 authoring 细节。跨领域创作应通过多个 capability 的显式注入组合完成，而不是在某个 Skill 中硬编码对其他包的内部调用。

### Prompt 层次

| 层          | 内容                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| base        | 项目级行为边界、安全规则、Agent 角色、通用工具/Markdown/引用/视觉证据协议                            |
| schema      | Tool 参数、structured output、artifact refs 与 diagnostics                                           |
| capability  | 子包领域能力目录、operation 语义、validation/diagnostics 和资源绑定规则                              |
| skill       | active skill 的领域方法、创作语义、输出标准和任务判断                                                |
| environment | locale、custom instructions settings、AGENTS.md overlay、provider expression、memory/context summary |
| ephemeral   | 当前 selected context、Tool/capability policy、多模态 evidence 与本轮结果                             |

Prompt 生成应输出 prompt snapshot/hash 和 diagnostics，便于追踪 drift。Provider 不支持 native tool calling 或 structured output 时，由 adapter 决定 prompt-only 投影或返回 capability diagnostic。

Prompt-first 的边界：

- Prompt fragment 必须有稳定 id、来源、优先级和适用条件。
- Prompt 不携带 provider credential、Webview URI、绝对路径、runtime token 或一次性 stream id。
- Prompt 不隐藏工具调用或权限要求；需要工具时由 schema、capability catalog 和 tool policy 显式暴露。
- Provider expression fragment 只能描述模型表达偏好，不能改写领域事实。
- AGENTS.md overlay 和设置里的自定义指令属于 environment layer；它们影响用户/项目偏好，不替代 base system prompt、tool protocol、capability schema 或 package/domain contract。

## Context、Memory 与 Grounding

Agent 上下文分三类：

| 类型            | 来源                                                                              | 持久化规则             |
| --------------- | --------------------------------------------------------------------------------- | ---------------------- |
| Runtime context | 当前消息、选区、打开文件、Webview UI 状态、临时工具结果                           | 不作为项目事实         |
| Project context | `ResourceRef`、asset/entity ID、Search source、domain project refs                | 可进入 durable payload |
| Memory context  | conversation journal、working summary、semantic memory、character memory evidence | 不替代项目事实         |

Memory 保存可追溯上下文，不是实体、素材或领域项目格式的权威来源。Agent 生成内容若要进入项目，应通过对应事实层：素材进 Asset Library，身份进 Unified Entity，媒体进 Resource/Generated source，Engine 输出进 source ref 或领域格式。

### Agent-first 多模态解析

```text
UI selection / open editors / viewport state
  -> Project and domain state
  -> Engine perception or media evidence
  -> Perception input resolver
  -> Multimodal context packet
  -> Agent observation and decision rationale
```

Agent-first 不表示忽略 UI 或素材文件。UI 提供“用户正在指什么”，项目/领域服务提供“对象是什么”，Engine/ML/搜索提供“证据是什么”，Agent runtime 最后形成可解释的观察和决策。

| 来源                 | 角色                                                          | 约束                                     |
| -------------------- | ------------------------------------------------------------- | ---------------------------------------- |
| UI context           | selection、viewport、active tab、playhead、用户焦点           | 短生命周期，不写项目事实                 |
| Project/domain state | timeline clip、canvas node、scene node、entity、asset binding | 由领域服务或 facade 查询                 |
| Engine evidence      | frame、audio、scene snapshot、ML embedding、transcript        | 通过 descriptor/ref 传递，二进制按需读取 |
| Search/Memory        | 语义召回、历史依据、用户偏好                                  | 必须保留来源和置信边界                   |

对 Canvas、Timeline、Scene、Asset、Entity 的改动采用 query-first mutation：先查询目标上下文和能力，再提交 typed intent。Agent 或 Agent Webview 不拼目标包内部 patch。

## Approval、Policy 与 Trust

| 动作                                              | 默认策略                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| 只读查询、搜索、解释                              | 可自动                                                                   |
| 写项目事实、修改文件、安装 market package         | 需要 policy 允许，必要时用户确认                                         |
| 删除、覆盖、外部网络、执行本地命令、native plugin | 高信任门槛和明确 approval                                                |
| untrusted/local capability 注入                   | 默认不自动执行，不进入高风险 tool policy                                 |
| secret/token/provider credential                  | 只通过 Auth/config/provider adapter，不写 prompt、skill 或 Webview state |

Approval 是运行时 gate，不应埋在 Prompt 文案里。Policy 可以影响 Tool 可见性、当前操作授权、Provider choice 和允许的恢复动作，但不创建创作 stage 或计划授权状态。

## Evaluation 与 Recovery

Validation 和 Quality 是横切审阅面，不是创作阶段，也不是独立 workflow runtime。

- deterministic evaluator 适合格式、尺寸、duration、schema、引用完整性、权限合规检查。
- LLM-as-judge 只通过 Provider adapter 接入，并保留 provider/model/prompt snapshot。
- 失败结果返回结构化 diagnostic 与证据，由下一 Agent turn 判断修复、换策略、请求用户或停止；不建立确定性 creative recovery coordinator。
- 后续动作不得绕过 Approval/Policy，也不得把 evaluator 建议直接写入 confirmed fact。
- 普通用户流不应隐式插入消融或评测节点；研发验证与普通创作主路径分离。

### 开发期 Agent Evaluation

开发期 Agent evaluation 是仓库脚本能力，不是 Agent 产品能力或独立的 CLI 业务编排：

- `apps/neko-tui` 提供通用 debug automation 控制面和中立事实投影；session、输入队列、Skill 生命周期、运行配置、任务观察和产物投影必须继续走 canonical TUI runtime。每条 controller 消息都进入 TUI input queue，不得 direct-import Agent turn runner 或建立第二套 `AgentSession` assembly。
- `scripts/agent-eval` 是唯一平台 owner，拥有 `reuse | update | create | excluded` authoring 决策、严格 v2 suite/scenario、fixture、controller、hard assertion、artifact check、Judge、baseline/comparison、报告和退出码；不得把这些职责放回 TUI application、Agent capability 或 runtime Skill。
- 每项行为先定义 user behavior、canonical path、forbidden fallback、observable evidence、expected result/failure，再编写 prompt。缺失 facts 或公开 validator 时 Evaluation 必须 blocked，不能退化成最终文本、metadata 或人工假设。
- debug automation 只能增加本地开发自动化普遍需要的 typed facts：Skill/Prompt fragment、effective runtime/model config、Tool/task/continuation、artifact、diagnostic、usage/timing/retry 和 dropped count。不得暴露 suite、case、variant、assertion、rubric、score、baseline、optimizer、pass/fail 或 report 概念，也不得投影 hidden prompt body 和 credential。
- Skill suite 使用 portable name 与 Host-owned `source + provenance + rootId + relativePath + fingerprint` 确定被测开发快照。同名不同来源/位置是不同 Host identity；Market package id、semver、发布、安装和分发历史不属于 Evaluation 身份。
- runtime/model profile 只表达产品 canonical TUI 已支持的 session-scoped immutable 配置，并同时记录 requested/effective identity 与 digest。Evaluation 不添加测试专用 feature flag；消融由外部平台比较隔离配置或 revision/build。
- Ablation 是 `scripts/agent-eval` 的 suite mode，不是独立 validation utility。配置消融复用上述 profile；实现消融使用 detached revision/worktree/build。两者都调用同一个 TUI driver 和 TUI App session owner，禁止产品 CLI experiment command、direct `AgentSession` runner、marker/no-op branch、alias 或第二套报告事实来源。
- Skill 实现消融在同一个 Host identity 下记录不同 package fingerprint 与显式 development checkpoint；revision、patch、build recipe 和 executable identity 只存在于 Evaluation 报告，不进入 TUI facts。blind Judge 只看到不含 variant fingerprint 的稳定 Host identity。接受本地开发候选不等于 Market 版本或发布。
- Evaluation 报告分离三个证据面：hard gates 证明 Skill/Tool/model/config、process、format/schema、artifact、permission、canonical path 和 no-fallback correctness；latency/token/cost/iteration/Tool/retry/task 只描述执行效率；领域 validator 或 suite-owned blind Judge 才能从真实模型输出评价相关性、语义完整性、约束满足、推理、具体性、一致性及适用的创作/审美质量。格式或 hard-gate 通过不得生成 content-quality score，也不得被描述为模型质量提升。
- Judge 只读取 allowlisted evidence，并且不能覆盖 hard-gate 失败。`hard-gates-only` 明确表示内容质量未评估；ablation 的 scenario rubric 必须与 indexed case 完全匹配，只有真实 Judge 样本可以产生 quality distribution/delta。重复采样保留全部样本，baseline 或 Judge policy 维度不一致时返回 non-comparable。
- 每次真实运行输出 versioned result、evidence、artifact manifest、quality report，并在执行时增加 Judge、aggregate 或 baseline diff。原始产物保留在 gitignored `reports/agent-eval/`；本地按 14 天策略由开发者清理，trusted CI artifact 自动保留 14 天。OpenSpec/PR 只提交脱敏 summary 和稳定 evidence refs。
- 默认 PR CI 只执行 key-free harness 与 all-suite dry-run。真实 focused/nightly 只在可信 push、schedule 或手动触发环境运行；fork PR 无 secret 路径。缺 credentials、network、quota、model、config 或 fixture 时返回明确 infrastructure blocked/fail，不使用 mock 或 fallback 伪造验收。

失败、拒绝、degraded、stale 或 Quality 结果通过普通 Tool/Task diagnostic 返回当前 conversation。下一步是重试当前 Tool、局部修复、改用另一已注册能力、请求用户决策或停止，由 Agent 在下一 turn 根据当前事实判断；runtime 不维护 `retry-stage`、`regress`、`restart-creation` 等创作恢复状态机。

## 跨领域接入规则

领域包若希望被 Agent 使用，应暴露 capability-friendly contract，而不是要求 Agent 了解内部实现。

| 领域能力      | Agent 需要的最小入口                                                  |
| ------------- | --------------------------------------------------------------------- |
| 只读上下文    | query API、selection/context projection、source/entity/asset refs     |
| 修改领域项目  | typed command、preview/validate/apply 分离、undo 或 revision contract |
| 媒体生成/处理 | tool schema、provider/engine requirements、output artifact refs       |
| 长任务        | work item projection、progress、cancel/retry、artifact/result refs    |
| 展示富内容    | `ContentBlock`/composite projection 或 target package 自己的 renderer |

领域文档描述“Agent 如何参与创作目标”；本文只规定 Agent 以什么协议和约束参与。

## 边界规则

- `agent`、`platform`、`ai-sdk`、`agent-types` 保持 host-agnostic，不导入 `vscode`、React、Webview 或 Extension API。
- `agent`、`platform`、`agent-types` 同时保持 domain-neutral，不定义漫画、角色、Storyboard、shot、媒体制作、后期或交付专用状态、router、validator、projector 或 service。
- Webview 不导入 `@neko/agent`、`@neko/platform`、`@neko/ai-sdk` 或 Extension 实现。
- Extension 可以注册 commands 和 host adapter，但不沉淀 Agent runtime 业务。
- Agent 调用创作能力时走 provider、shared contract、Engine client、entity facade、market capability 或 command bridge。
- 生成媒体和结构化结果必须接地到 `ResourceRef`、asset/entity ID、Search index、Engine output 或领域项目格式后，才成为持久上下文。
- 兼容桥必须声明 owner、replacement 和过期边界，避免长期成为新的耦合入口。

## 反模式

| 反模式                                         | 风险                               | 正确边界                                         |
| ---------------------------------------------- | ---------------------------------- | ------------------------------------------------ |
| Webview 直接导入 `@neko/agent` 或 provider SDK | UI 与 runtime 互相缠死             | Webview 只消费 `agent-types` 投影                |
| Extension 拼 Prompt 或决定创作下一步            | Host adapter 变成业务层            | runtime 负责 Prompt/turn，Extension 只注入宿主能力 |
| Skill 内藏执行逻辑或工具协议                   | Skill 变成不可审计 workflow engine | Skill 只声明领域方法、创作语义和输出标准         |
| 注册能力即注入 LLM                             | token 爆炸和权限泄漏               | Registration 与 Injection 分离                   |
| Tool 结果直接写项目事实                        | 副作用不可审计                     | 通过领域服务、审批和事实层                       |
| Provider adapter 拥有领域逻辑                  | 模型供应商影响业务语义             | provider 只做消息/工具/多模态投影                |
| Agent/Platform 为媒体场景硬编码 matcher、summarizer、validator 或 projector | 核心与领域耦合，扩展只能修改内核 | Skill/Tool/subagent/owning contribution 提供领域语义，核心只执行通用协议 |
| Memory 替代素材/实体事实                       | 事实漂移、难以协作                 | Memory 只保存上下文和 evidence refs              |
| Evaluation 自动改 confirmed fact               | 审阅绕过用户意图                   | 输出 repair suggestion，等待 policy/approval     |

## 与创作领域的关系

| 创作领域 | Agent 参与方式                                     |
| -------- | -------------------------------------------------- |
| 视频     | 分镜、视频理解、自动后期、剪辑建议、质量审阅       |
| 音频     | 转写、效果链建议、混音/后期建议、音频质量审阅      |
| 模型     | LookDev、材质/灯光建议、捏脸、场景编辑和验证       |
| 2D       | 图像准备、PSD 分层建议、Puppet 辅助、角色素材整理  |
| 互动     | 交互结构生成、状态解释、自动连接、运行态审阅与修复 |

领域文档应说明 Agent 如何参与某个创作目标；本文只定义 Agent 自身横切边界。

## 吸收的稳定主题

本设计吸收以下历史主题的稳定部分：

- Agent-native session/turn creative orchestration
- Agent runtime boundary guard
- Capability Protocol
- Agent media architecture
- Agent memory unification
- multimodal perception and provider-aware delivery
- Skill method guidance and lifecycle injection
- agent host boundary review
