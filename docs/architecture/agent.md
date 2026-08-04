# Agent 横切架构

更新日期：2026-08-04

本文件定义 OpenNeko Agent 的系统级边界。运行时包级边界见
[`packages/agent/runtime/src/runtime/README.md`](../../packages/agent/runtime/src/runtime/README.md)，
目标 ADR 见 [`adr-pi-agent-runtime.md`](adr-pi-agent-runtime.md)。

Pi 是唯一 canonical Agent、主模型、Tool 调度、Skill 读取和 transcript/context 执行路径。
`AgentSession`、`AgentExecutor`、Think/Act/ReAct、Platform chat adapter、Vercel AI SDK chat
Agent 不保留第二套 Skill lifecycle、transcript repository 或 session Journal。

## 系统定位

Agent 是领域无关智能运行内核，不是创作领域。它负责：

- conversation-scoped Pi runtime、turn/run identity、队列、取消和事件投影；
- Prompt、Pi Skill Host、MCP、Tool/Capability bridge、permission/approval；
- flat model-purpose snapshot 和 Pi provider/model/credential projection；
- memory/context 输入、稳定资源引用和 conversation Timeline；
- Desktop Main/preload/renderer 共用的 host-neutral contract。

Agent 不拥有：

- Canvas、Cut、Assets、Preview、Character、Generation、Quality、Entity、Search 或媒体 runtime 事实；
- 领域 Job 的 snapshot、retry/reconciliation、结果提交或历史页面；
- workspace 文件 IO、Electron/renderer 生命周期或 React 状态；
- 第二套 transcript、Skill cache、provider chat registry 或通用 TaskManager。

领域能力通过 typed Capability、Tool、domain port 和稳定 `ContentLocator` 注入。

## 五层分析

| 维度 | 约束                                                                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 职责 | Pi 拥有 generic Agent execution、Tool scheduling、Skill read 和 transcript/context；OpenNeko Agent 拥有产品 identity、policy 与 projection；领域包拥有执行和事实；Host 拥有 IO、trust、credential interaction 与 UI transport。 |
| 依赖 | Renderer 只依赖共享 contract；Desktop Main composition 依赖 host-neutral runtime 和具体领域 port；Agent core 不依赖 Electron、React 或具体领域实现；领域包不反向依赖 Agent。                                                    |
| 接口 | conversation/branch/turn/run/tool-call identity、Tool schema、model-purpose snapshot、Capability contribution、domain Job port、Timeline patch 和 ContentLocator 分层定义；禁止自由 JSON 和 active-state fallback。                |
| 扩展 | 新 provider 通过 Pi registration 或 owning media runtime 接入；新 Skill 使用 Pi `SKILL.md`；新领域能力先由 owning package 定义 contract，再通过 contribution 注入。                                                             |
| 测试 | deterministic path/schema/identity/permission 测试证明 canonical path；key-free evaluation 验证 harness；真实 Desktop complete-session 场景证明模型与 UI 行为。                                                                 |

## 分层与依赖方向

```text
Desktop renderer projection
  -> agent-types contract
  -> typed preload IPC
       -> Desktop Main adapter
       -> host-neutral Agent product runtime
            -> Pi Agent / Session / Skills / AI
            -> OpenNeko permission and Capability bridge
            -> injected domain ports
```

| 层                    | 负责                                                                                                 | 不负责                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `agent-types`         | renderer/Main/runtime 消息、Timeline、identity 和 projection contract                                | runtime、Electron、React、provider SDK                         |
| `agent`               | Pi composition、Prompt、Skill Host、Tool/Capability bridge、permission、memory/context、产品事件投影 | Host API、领域执行、第二套 Agent loop                          |
| `apps/neko-desktop`   | Main composition、typed preload IPC、workspace trust、credential、resource authorization、disposal   | Agent 决策、领域事实                                           |
| `agent-webview`       | Chat/Timeline/settings/confirmation UI 和可恢复展示状态                                              | IO、Tool/provider 执行、持久事实                               |
| `platform` / `ai-sdk` | 迁移中的配置投影、媒体 provider implementation 和必要辅助能力                                        | 主模型 chat fallback、Agent transcript、GenerationJob contract |

## Canonical runtime

```text
Host input
  -> conversationId + branchId + turnId
  -> acquire fenced conversation writer lease
  -> freeze flat AgentModelPolicy
  -> conversation-scoped Pi Agent and active Pi Session
  -> OpenNeko permission/workspace-trust preflight
  -> Pi Tool execution through exact owning port
  -> Pi event stream
  -> authoritative conversation Timeline projection
  -> Host projection
  -> terminal Pi Session checkpoint
```

### Identity 与实例隔离

以下 identity 不得互相替代：

| Identity          | Owner                           | 含义                                             |
| ----------------- | ------------------------------- | ------------------------------------------------ |
| `tabId`           | Desktop renderer                | view binding，只选择投影                         |
| `conversationId`  | OpenNeko conversation aggregate | conversation runtime 与 catalog identity         |
| `branchId`        | OpenNeko branch metadata        | active/historical branch identity                |
| Pi `sessionId`    | Pi Session                      | 一条 branch 的 JSONL transcript/context identity |
| `turnId`          | conversation runtime            | 一次用户输入到终态                               |
| `runId`           | runtime owner                   | 一次 foreground Agent 或显式 delegated execution |
| `toolCallId`      | Pi Tool execution               | 一次准确 Tool invocation                         |
| concrete `JobRef` | owning domain                   | 可恢复的 Generation/Export 等领域工作            |

每个 active conversation 独立拥有 Pi Agent、active branch/session、输入队列、abort state、
immutable in-flight snapshot、event subscription、projection 和日志 partition。active tab 只选择
展示，不得切换共享单例参数来模拟多个 conversation。

多个 Desktop view 可观察同一 conversation，但只有持有当前
`ConversationExecutionLease` epoch 的 runtime owner 可以执行 turn 或提交 checkpoint。takeover 产生更高
epoch，旧 writer 必须 fail-visible。

### Transcript 与产品事实

Pi Session JSONL 是以下内容的唯一权威：

- user/assistant/tool messages；
- model/active-tool changes；
- transcript tree、branch context、compaction entry；
- 实际进入模型的 Skill 内容与 `read_skill` receipt。

OpenNeko 用户级 SQLite 继续拥有：

- conversation catalog、active/historical branch mapping；
- workspace binding、writer lease、turn/run/domain Job identity；
- permission、provider task、ContentLocator 和必要的产品 metadata。

SQLite listing preview、message count 等字段是可重建投影，不是第二份 transcript。workspace
不得存放 Pi transcript；旧 Journal、history hydration 或 workspace transcript importer 不能
恢复正常会话。

Desktop 统一 Workbench 冷启动通过 Pi owning package 的只读 catalog reader 投影最近 Agent
conversation metadata。该读取不 attach workspace runtime、不打开 Pi Session、不读取 transcript，
也不获取 execution lease；只有显式 attach 的 exact conversation 可以覆盖实时 attention。catalog
缺失表示尚无历史数据，catalog 损坏或 schema 不匹配必须 fail-visible，不能伪装成成功空列表。

同一个 `AgentWebviewRoot` 同时承载 `draft | session` presentation；phase 只决定是否已有 conversation，
不更换 controller、composer 或 Root identity。`assistant | workspace` scope 与 phase 正交：Assistant
使用用户级授权资源和 conversation scratch；Workspace 必须来自 exact persisted identity 或显式
sender-bound directory grant。draft 编辑不创建 conversation/scratch，第一条提交由 Agent application
authority 原子提交 context、conversation、initial message 和 pending turn，并以稳定 request/turn
identity 幂等启动 provider。任何 Workspace-only capability 在 Assistant scope 下必须返回
`workspace-scope-required`，不得回退到 active/first/recent Project。

每次 Start Creating 都创建新的 `unbound` draft identity。只有该状态显示 Assistant、Workspace 与
Character/Room owner 选择；显式绑定 Assistant 或 Workspace 后，同一 Root 立即显示 owner-qualified
activated draft，清除旧 Tabs、transcript、输入引用和瞬态错误，同时保留模型目录与用户设置。Desktop
只投影 Host 已提交的 phase/scope，不通过 active Project、组件状态或 React key 推断或重建 Agent。

turn terminal checkpoint 具有 `volatile`、`persisting`、`durable`、
`persistence-delayed` 状态。持久化失败必须暴露 diagnostic；process-local backfill 不能伪装成
durable，也不引入第二个 outbox/WAL authority。

## 模型、Provider 与凭据

每个 turn/run 冻结一份 flat `purpose -> model + resolved parameters` snapshot。`agent.main`
与所有实际调用方需要的 purpose 位于同一 map，例如：

```text
agent.main
image.understand
image.generate
video.generate
audio.generate
canvas.prompt
canvas.judge
character.dialogue
character.profile
text.embed
```

禁止 nested purpose、model type default、first-compatible model、implicit main fallback 和
运行中重新读取配置。缺失或不兼容的 binding 使对应 Tool 不注册或返回明确 diagnostic。

Pi 支持的主模型和 bounded understanding model 使用 Pi streaming provider transport。
Generation/edit/TTS 等由领域 runtime 执行的 purpose 只携带 owning runtime 所需的精确
provider/model binding，不伪造成 Pi chat model。

OpenNeko 实现一个用户级 CredentialStore，由 Desktop Main 的 `HostSecretPort` adapter 接入
OS 保护存储。secret 不进入 workspace fact、SQLite conversation metadata、
Pi Session、日志或 evaluation fact。NewAPI/OneAPI chat 通过 Pi OpenAI-compatible projection；
其媒体生成和异步 task protocol 留在 Generation/provider owner。

## Prompt、Skill、Tool 与 Capability

### 归属

| 平面                 | 负责                                                                         | 不负责                                              |
| -------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| System Prompt        | 默认 Agent 行为、通用工具协议、安全和失败处理                                | 子包 schema、运行时参数表、领域 authoring lifecycle |
| Capability injection | operation、Tool schema、validation、diagnostic、资源绑定和 Host requirements | 通用人设、Skill 方法论                              |
| Skill content        | 领域方法、创作语义、判断和输出标准                                           | 工具名教程、权限授予、运行时协议                    |
| Runtime              | Pi turn、Tool lifecycle、identity、event projection                          | Host IO 或 React                                    |
| Policy               | permission、trust、approval、secret boundary                                 | 用 prompt 文案代替安全判断                          |

### Skill

- Pi discovery/formatting/read 是唯一 `SKILL.md` 路径。
- OpenNeko 记录 source、trust、enablement、fingerprint 和 process-local opaque locator。
- locator 不得持久化或进入 PathResolver、ContentAccess、ResourceCache、workspace fact、模型
  可见绝对路径或 Webview URI。
- 指定的 `read_skill` 边界可委托 Skill Host 解析；相对资源必须保持在同一 fingerprint root。
- Skill metadata/content 不授予 Tool、permission、workspace trust、model override 或脚本执行。
- 不保留 activation slot、ToolGuard、ToolSet mutation、Skill lifecycle store 或第二套 cache。

### Tool 与 permission

Tool schema 在 registration 时转换为 Pi schema，完整保留 discriminated/nested contract。
非法参数、未知 wire name、缺失 capability、权限拒绝和 provider failure 必须作为失败 Tool
result 投影，不能改写为空数据或普通 assistant 成功消息。

`plan` mode 不执行 Tool。`ask` mode 对非只读副作用 Tool 使用 Timeline-owned confirmation；
确认必须绑定 conversation/toolCall identity，并具有取消与有界超时。已授权的 workspace/internal
read 可以免确认，但仍受 containment 和 trust 检查。

## Tool Call 与 Domain Job

普通同步工作在同一 Pi Tool Call 中完成。需要独立身份、跨页面/重启恢复、精确查询/取消/重试
的工作由具体领域 Job owner 管理，详见
[`adr-agent-tool-call-domain-job-lifecycle-boundary.md`](adr-agent-tool-call-domain-job-lifecycle-boundary.md)。

```text
Pi Tool Call
  -> exact GenerationJob port
  -> committed versioned observations
  -> terminal ContentLocator or diagnostic

Cut UI
  -> exact ExportJob port
  -> Cut-owned editor/status projection
```

共享 job-lifecycle 只拥有 typed identity、phase、revision、CAS、terminal immutability 和
observation 机械规则。每个领域拥有 submit、provider/executor identity、reconciliation、retry
policy、结果验证与原子提交。

Agent 不直接读写 JobStore，不建立通用 Job/Task dispatcher、global Activity 页面或
active/latest fallback。Tool Call 返回后，后续 describe/observe/cancel/retry 使用带精确
JobRef/revision 的新 Tool Call。

## Renderer 与 Host 边界

- Renderer 不访问 Node.js/Electron API，不读取文件、credential、SQLite 或 provider。
- Preload 只暴露 sender-bound typed IPC；Main 负责 intent validation 与授权资源投影。
- Renderer Tab 拥有独立 store、attachment 和 React subtree；切换只改变可见性。
- Agent Root 必须在 descendant initialization request 发出前建立 Host event subscription；
  browser/Electron renderer 使用 layout phase 建立并在 adapter replacement/unmount 时释放订阅。
- 新 Conversation 的待发送 user message 使用稳定 conversation/message identity 立即进入可见
  projection；authoritative Timeline 只负责按同一 identity reconciliation。Host send 拒绝必须
  清除目标 conversation 的虚假 executing 状态并投影 conversation-scoped diagnostic。
- Desktop Main 拥有 workspace IO、path containment、trust、credential interaction、
  LocalMetadata、runtime composition 和显式资源释放。
- 模型/renderer 只接收稳定 identity、`ContentLocator` 和脱敏 diagnostic；绝对路径、
  cache path、token、SQLite row 与 runtime handle 不穿透边界。
- Renderer/CSP/焦点/IPC/视觉验收必须使用打包 Electron 与隔离 fixture；普通浏览器/Vite 不能
  替代 Desktop 运行态验收。

## Grounding 与创作领域

进入持久上下文或领域项目的结果必须接地到稳定事实：

- `ContentLocator`、asset/entity ID；
- Search source、媒体或领域执行 output；
- Canvas/Cut/Character 等 owning project revision 和格式；
- concrete domain Job terminal result。

Agent 可以读取事实、决定下一 Tool、请求 approval、观察结果并继续，但不保存固定创作 stage、
DAG、plan authorization 或领域 project state。Canvas、Cut、Preview 等 surface 的完整编辑和
播放状态仍由 owning package/Webview 管理；Agent 只发送 typed reveal/open/authoring intent。

## 测试与验收

确定性验证必须覆盖：

- conversation/branch/session/turn/run/tool-call/Job identity；
- immutable model snapshot、purpose/capability/credential fail-visible；
- Tool schema、permission、confirmation、cancellation；
- Pi Session authority、lease fencing、checkpoint durability；
- Skill trust/locator/receipt/no-cache；
- canonical provider/domain port 被命中，未注册旁路无法返回成功；
- Desktop Main/preload/renderer projection 的 producer/consumer contract。

`pnpm test:agent:eval` 只验证 key-free harness、schema、fixture 和 hard gate，不能描述为真实
Agent 行为。真实行为结论需要 configured-provider Desktop complete-session case，并记录
effective model、usage/cost、artifact/path fact 与 no-fallback evidence。Desktop UI 行为必须
使用打包 Electron 与合成 fixture workspace 验收。

## 禁止恢复的路径

- `AgentSession` / `AgentExecutor` / Think-Act-ReAct；
- Platform/Vercel AI SDK 主模型 chat fallback；
- 第二套 Journal/history hydration/custom compaction；
- Skill lifecycle/activation/ToolGuard/model override；
- generic TaskManager、JobManager、payload/result dispatcher；
- Webview-owned runtime、active conversation singleton、latest Job fallback；
- 默认空数据、默认成功、旁路 reader 或双写 transcript。

命中上述路径必须使架构检查、测试或运行时 diagnostic 失败，而不是继续返回成功。
