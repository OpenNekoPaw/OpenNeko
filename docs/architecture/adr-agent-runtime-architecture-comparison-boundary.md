# ADR: Agent Runtime 架构对比与边界决策

状态：Accepted
日期：2026-07-05
范围：`neko-agent` runtime、session/turn/runner/capability/stream 分层、Extension host adapter、Skill/Capability/External Processor、Agent 协议面与测试边界。

本文把 `neko-agent` 与 Codex、OpenCode、Pi、OpenClaw、Hermes、OpenAI Agents SDK、LangGraph 等 agent 模式的架构对比沉淀为 OpenNeko 的稳定架构决策。它补充 [`agent.md`](agent.md)、[`package-boundaries.md`](package-boundaries.md)、[`adr-agent-sandbox-and-external-processing-boundary.md`](adr-agent-sandbox-and-external-processing-boundary.md)、[`adr-agent-skill-catalog-activation-boundary.md`](adr-agent-skill-catalog-activation-boundary.md) 与 [`adr-agent-message-task-queue-boundary.md`](adr-agent-message-task-queue-boundary.md)。

## 背景

`neko-agent` 正在从早期的会话聚合实现收敛到 host-neutral runtime。当前代码已经把 runtime 目录约束为：

- `session/`：session bootstrap、runtime pool、runtime session controller、host bindings。
- `runner/`：一个已配置 session 的执行端口、取消、确认、pending message queue。
- `turn/`：单个用户消息 turn 的 provider/model selection、prompt/context/attachment assembly、stream persistence。
- `capability/`：消费 `AgentCapabilityProvider` contribution、portable Skill / Host overlay capability 投影、External Processor 能力注入。
- `stream/`：Agent event stream projection、stream state、background task observation。

这与 Codex/OpenCode 等 coding agent 的代码结构有相似点：都有 session、turn/run loop、tool/capability registry、permission/approval、skill/plugin、history/state 和多前端投影。但 OpenNeko 的产品边界不同：

- Neko 是本地 VS Code 客户端 + 本地 Rust Engine 的创作套件。
- Agent 的目标是驱动 Canvas、Timeline、Asset、Entity、Search、Engine 和创作 artifact，而不是成为通用代码修改 shell。
- Webview 仍是 projection surface；Extension Host 是本地 host adapter；Rust Engine 是媒体计算和核心数据模型权威。
- 平台化必须匹配真实边界：优先平台化 Skill/Plugin/Capability 和客户端 adapter，不为假想远程多租户、服务治理或通用 agent daemon 提前引入 indirection。

## 外部参考

### Codex

参考快照：OpenAI Codex 官方仓库 [`openai/codex`](https://github.com/openai/codex/tree/be33f80bc65159c094ecd06bf155afa3061ce23d)，HEAD `be33f80bc65159c094ecd06bf155afa3061ce23d`。

Codex 代码的主干形态是：

```text
protocol Submission / Op / Event
  -> app-server MessageProcessor / RequestProcessor
  -> ThreadManager / CodexThread
  -> core Session
  -> run_turn
  -> ToolCallRuntime / ToolRegistry / ToolOrchestrator
  -> sandbox / approval / MCP / skills / plugins
```

可借鉴点：

- `protocol` 与 `app-server-protocol` 把跨前端 API、turn start、event stream 和权限请求定义为稳定 contract。
- `app-server` 作为请求路由和横切规则层，集中处理 initialization gate、experimental API gate、request serialization 和 processor dispatch。
- `core/session`、`session/turn`、`input_queue` 把会话状态、单 turn loop 和运行中输入协调拆开。
- `tools` 形成 registry、parallel/cancellation runtime、approval/sandbox orchestrator 三段式边界。
- Skills/plugins/MCP 采用渐进披露：先暴露 catalog/summary，需要时再注入具体 instruction 或依赖。

不可照搬点：

- Codex 的 shell、apply_patch、workspace diff、sandbox escalation 是 coding agent 的核心能力；Neko 默认能力应是 typed creative tools、ResourceRef、domain operation 和受管 External Processor。
- Codex 的 app-server/SDK/protocol 层服务于多客户端、多运行面和外部集成；Neko 已经需要支持 VS Code 与 TUI，并应为未来客户端保留统一 runtime command/event contract，但不需要在第一阶段复制 Codex 的独立 daemon、公共 SDK 和完整 app-server 分层。
- Codex 的权限模型围绕代码仓库读写和命令执行；Neko 的真实边界还包括 Webview CSP、媒体 Range/codec、ResourceRef、Engine、Asset library、provider trust 和创作 artifact provenance。

### OpenCode

参考快照：当前 OpenCode 仓库 [`sst/opencode`](https://github.com/sst/opencode/tree/b7e4f1ef7433f83ba009eefa2997aeb81017f6ed) / [`anomalyco/opencode`](https://github.com/anomalyco/opencode/tree/b7e4f1ef7433f83ba009eefa2997aeb81017f6ed)，HEAD `b7e4f1ef7433f83ba009eefa2997aeb81017f6ed`。旧 [`opencode-ai/opencode`](https://github.com/opencode-ai/opencode) Go 仓库已归档，不作为当前架构事实来源。

当前 OpenCode 是 TypeScript/Bun monorepo，包含 `core`、`server`、`protocol`、`sdk`、`tui`、`app`、`plugin` 等包；`core` 内有 `session`、`tool`、`permission`、`plugin`、`skill`、`provider`、`filesystem`、`database` 等 owner。它说明一个多入口 coding agent 产品也会自然分化出 core/server/protocol/plugin/sdk 层。

对 Neko 的启发是：多入口、多前端和插件生态会推动 core/server/protocol/plugin/sdk 分层。Neko 应先把能力注册、客户端 adapter 和 runtime command/event contract 平台化；只有当跨进程共享 session、外部 SDK 或远程控制成为真实需求时，才升级为显式 protocol/server 层。

### 各 Agent 模式优缺点与必要性

本节只评估可借鉴设计，不把它们叠加成一个复杂功能。Neko 当前面向本地内容创作，优先选择低成本、可验证、可解释的运行边界；复杂平台层必须由真实需求触发。

| Agent / 框架 | 优点 | 缺点 | 对 Neko 的必要性 |
| --- | --- | --- | --- |
| Codex | 任务闭环成熟：上下文读取、计划、执行、验证、汇总、sandbox、approval、Skill、subagent 和多 surface 投影形成稳定产品心智。官方文档可参考 [sandboxing](https://developers.openai.com/codex/concepts/sandboxing)、[subagents](https://developers.openai.com/codex/subagents) 与 Codex manual。 | coding-agent 取向强，shell、patch、workspace diff 和仓库验证是核心；直接照搬会把 Neko 推向通用代码执行器。 | 高。借鉴 plan/update/verify/summary、approval、Skill 渐进披露、subagent review；不借鉴 shell-first 和完整 app-server。 |
| OpenCode | Plan/Build agent、primary/subagent、permission allow/ask/deny 和项目/全局规则边界清楚；参考 [agents](https://opencode.ai/docs/agents/) 与 [permissions](https://opencode.ai/docs/permissions/)。 | 仍以代码任务为中心，Plan/Build 二分不完全适合创作中的探索、生成、比较、修订循环。 | 中高。借鉴只读分析模式、执行模式和权限矩阵；不建立大型角色市场或多 agent 分身体系。 |
| Pi / companion agent | 对话体验好，善于追问、共情、降低用户表达成本；适合作为创作 brief、风格澄清和反馈体验参考。参考 [Inflection](https://inflection.ai/) 与 [Pi](https://hey.pi.ai/)。 | action、artifact、验证、写回和可追溯性弱；容易停留在舒适对话，不能保证创作结果落地。 | 高但仅限 UX。借鉴 brief、澄清问题、反馈语气；不能用对话历史替代 run、ResourceRef 或 package-owned apply。 |
| OpenClaw / gateway-session 模式 | 多渠道、多 agent、多 workspace/session routing 可以隔离长期会话；参考 [multi-agent routing](https://docs.openclaw.ai/concepts/multi-agent)。 | 对当前本地创作套件过重，会增加 gateway、session store、routing、成本、延迟和语义污染。 | 低。用户已明确不需要 gateway session routing；仅保留显式 identity、isolation diagnostic 这类概念。 |
| Hermes / agent loop 模式 | prompt assembly、stable/context/volatile 分层、context compression、memory flush 和 agent loop 职责边界有参考价值；参考 [prompt assembly](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/prompt-assembly.md) 与 [agent loop](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/agent-loop.md)。 | 单一大 agent loop 容易吸收过多职责；自动 memory/self-improvement/fallback 会造成状态漂移和成本不可见。 | 中高。借鉴 prompt/context/memory 分层与压缩；不借鉴自动记忆写入、隐式 provider fallback 或万能 loop。 |
| OpenAI Agents SDK | Agent/Runner/tools/handoff/guardrails/sessions/tracing 抽象清楚，适合固定工具和审批流的事务型 agent；参考 [Agents guide](https://developers.openai.com/api/docs/guides/agents)。 | SDK runtime 若成为核心，会压过 Neko 已有 host-neutral runtime、ResourceRef 和 owning package apply 边界。 | 中。借鉴 tracing、guardrails、handoff 语义；不把 SDK 作为 Neko runtime 主循环。 |
| LangGraph | durable execution、persistence、human-in-the-loop、streaming 和 checkpoint/resume 适合复杂长任务；参考 [LangGraph overview](https://docs.langchain.com/oss/python/langgraph/overview)。 | 图编排对多数创作按钮和单文档 run 过重，容易形成第二套 workflow engine。 | 低到中。只在影视批量生成、跨媒体长任务中借鉴 checkpoint/interrupt/resume；不做通用 graph clone。 |

由此得到的收敛判断：

- 必要优化是 `Brief -> Plan -> Run/workItem -> Capability -> ResourceRef/artifact -> Verify -> package-owned apply -> Summary` 的轻量闭环。
- 不必要优化是 gateway session routing、通用 workflow graph、通用 daemon/public SDK、自动记忆写入和 TypeScript extension。
- 当前 `CreativeAiRunRuntime`、`TaskManager`、消息队列/任务队列/任务卡 ADR 已经覆盖大部分基础设施，应优先补齐边界和 UX，而不是新增平台层。

## 决策

### 1. Neko Agent 分阶段平台化：先能力与客户端 adapter，后 app-server

本 ADR 不反对平台化。结论是：Neko Agent 需要平台化能力生态和客户端适配，但暂不复制 Codex/OpenCode 的独立 app-server/daemon/SDK 形态。

| 层级                                         | 决策       | 说明                                                                                                                                       |
| -------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Skill / Plugin / Capability 平台化           | 需要       | 用户 Skill、Market/plugin、External Processor、领域 capability 必须进入统一 registry、trust、diagnostic、activation 和 permission policy。 |
| 客户端 adapter 平台化                        | 需要       | VS Code、TUI 和未来客户端应复用同一 host-neutral runtime port 与 runtime command/event contract，不复制 Agent runtime。                    |
| 独立 app-server / daemon / public SDK 平台化 | 分阶段触发 | 只有跨进程共享 session、外部 SDK、远程控制或多客户端并发连接成为真实需求时才引入。                                                         |

当前 canonical path 是：

```text
VS Code / TUI / future client projection
  -> client adapter / host adapter
  -> @neko/agent host-neutral runtime
  -> Skill / Plugin / capability / approval / artifact / memory / validation
  -> domain packages / Engine / Assets / Entity / Search
```

Extension 可以拥有 VS Code API、workspace trust、`asWebviewUri`、Engine client provider、ContentAccess 和 host effect。`@neko/agent` runtime 不得导入 VS Code、React、Webview 或 Extension 实现。

客户端 adapter 的共享 contract 应先保持 in-process/package-level：

```text
Client-specific message / command
  -> AgentRuntimeCommand
  -> runtime port
  -> AgentRuntimeEvent
  -> client-specific projection
```

`AgentRuntimeCommand` / `AgentRuntimeEvent` 可以作为未来 protocol/server 的种子，但在没有真实跨进程需求前，它们不要求 JSON-RPC transport、daemon 生命周期或公共 SDK。

只有出现以下至少一个真实需求时，才考虑引入 Codex/OpenCode 式独立 Agent protocol/server 层：

- VS Code、CLI/TUI、desktop app 或远程 control plane 需要共享同一长期会话 API。
- 外部 SDK 需要稳定管理 session、turn、event stream、permission request、artifact reference。
- 同一 Agent runtime 需要被多个进程或客户端并发连接。
- 现有 Extension bridge 已经承担 request serialization、schema version、capability negotiation 和 persistent thread store，且这些职责无法再通过 package-local ports 清晰表达。

在这些条件出现前，不新增 `agent-app-server`、通用 JSON-RPC daemon 或外部 SDK 层；但必须允许 VS Code、TUI 和未来客户端通过同一 runtime command/event contract 复用 `@neko/agent`。

### 2. Runtime 目录继续收敛为 session/runner/turn/capability/stream

`runtime/` 是 host-neutral runtime boundary，不是 prompt governance、Skill lifecycle、permission policy、presenter、projector、store 或领域 adapter 的通用桶。

新增 runtime 文件必须回答三个问题：

1. 是否符合现有架构：是否落在 `session/runner/turn/capability/stream` 之一，或是否应放入 `session/`、`context/`、`memory/`、`artifact/`、`workspace/`、`prompt/`、`skill/`、`permission/`、`approval/`、`task/`、`commands/`、`input/` 等 owning directory。
2. 如何进一步降低耦合：是否通过小接口、端口、registry、strategy 或 event projection 连接，而不是直接依赖具体 host/domain 实现。
3. 是否易于扩展与测试：是否能用边界测试证明 Webview/Extension/runtime 依赖方向正确，是否能用 contract tests 验证非法 schema、未知 message 或缺失 owner fail-visible。

runtime root 只允许 package exports、shared runtime types 和少量尚未稳定归属的 host-neutral collaborator。新增 root file 是例外，必须在 ADR、OpenSpec 或实现说明中给出 owner 和迁移条件。

### 3. AgentSession 是过渡性聚合对象，不能继续吸收新职责

`AgentSession` 当前仍聚合 executor、prompt modules、Skill injection、approval、artifact facade、validation bridge、memory、journal、history、confirmation 和 stream state。它可以继续作为兼容 facade 存在，但新功能不得默认塞进 `AgentSession` 字段和长方法。

后续演进方向：

| 职责                                                                        | 首选 owner                                      |
| --------------------------------------------------------------------------- | ----------------------------------------------- |
| 单 turn provider/model/context/media attachment assembly                    | `runtime/turn/`                                 |
| 执行中输入、pending message queue、confirmation timeout、cancel             | `runtime/runner/`                               |
| 会话 bootstrap、runtime pool、session refresh、host bindings                | `runtime/session/`                              |
| Skill lifecycle、activation projection、Skill injection prompt/tool guard   | `skill/`                                        |
| Capability contribution、manifest normalization、external processor catalog | `runtime/capability/` + owning package registry |
| Artifact persistence、Draft/Plan/Task writes、watcher                       | `artifact/` + `session` facade                  |
| Journal/history/conversation projection                                     | `session/`                                      |
| Context window、token budget、compaction、summarization                     | `context/`                                      |
| Durable project facts、recall、memory files                                 | `memory/`                                       |
| Permission/approval policy                                                  | `permission/`、`approval/`                      |

`AgentSession` 可以协调这些 owner，但不应成为新的 state machine 或 policy owner。

### 4. Capability/tool execution 借鉴三段式，但保持创作领域语义

Codex 的工具层可以抽象为：

```text
ToolRegistry
  -> ToolCallRuntime
  -> ToolOrchestrator
```

Neko 应采用同类分工，但命名和语义应贴合创作能力：

```text
CapabilityRegistry / ExternalProcessorRegistry
  -> CapabilityCallRuntime
  -> CapabilityPolicyOrchestrator
```

职责建议：

- Registry：注册、去重、schema validation、source/trust projection、capability lookup、diagnostics。
- CallRuntime：并发、取消、event projection、tool result normalization、timeout、background task observation。
- PolicyOrchestrator：resource root policy、approval、trust gate、provider/processor risk、host requirement、fail-visible diagnostic。

普通创作 Agent 默认不暴露任意 shell。需要执行外部工具时，必须通过 [`adr-agent-sandbox-and-external-processing-boundary.md`](adr-agent-sandbox-and-external-processing-boundary.md) 定义的 External Processor manifest、PathAccessPolicy、ResourceRef 和 approval gate。

### 5. Protocol 面保持窄，但为多客户端预留 runtime command/event contract

Codex 的 `Submission/Op/Event` 适合多客户端 agent 平台。Neko 当前应保持较窄协议面，但不能把 VS Code、TUI 和未来客户端各自写成一套 Agent 协议。第一阶段的公共面是 package-level runtime command/event contract：

- Webview/Extension 消息：放在 `@neko-agent/types` 或已存在 owning package contract。
- 跨层 Engine 通信：优先 `packages/neko-proto`。
- Agent runtime host 连接：使用 `@neko/agent/runtime` 小端口、`AgentRuntimeCommand` / `AgentRuntimeEvent` 或等价 command/event adapter。
- Domain capability：通过 `@neko/shared` contract、domain package provider 和 runtime projection。

约束：

- 客户端 adapter 负责把 VS Code/TUI/future client 的 UI message 映射为 runtime command/event；runtime 不理解 Webview DOM、VS Code API 或 TUI 控件。
- Runtime command/event 必须表达 session、turn、capability、permission、artifact 和 queue 的稳定语义，不能携带 Webview-only display URI、temporary absolute path 或 host runtime handle。
- 当未来需要 server/protocol 时，优先提升 runtime command/event contract，而不是把某个客户端的 UI message 直接公开为 API。

如果未来引入 Agent server/protocol，必须 contract-first：

- 先把既有 `AgentRuntimeCommand` / `AgentRuntimeEvent` 或等价 package-level contract 版本化为 transport schema。
- 版本化 schema，未知 version 和未知 message fail-visible。
- 不把 Webview UI message 直接升级成公共 server API。
- 不在 protocol 里保存 Webview URI、absolute temp path、provider handle 或 runtime-only display state。

### 6. Skill/Plugin 采用渐进披露，不变成 workflow engine

Skill 是 prompt、method、创作方法和扩展语义，不是独立 workflow engine，也不是工具协议或子包 schema 的承载层。工具范围只能作为机器可读 metadata/policy 输入；具体工具 schema、capability guidance 和运行时诊断由 runtime 与 owning subpackage capability 提供。Neko 保持 Agent-first 激活：

```text
User message / explicit $skill
  -> Agent reads catalog/context
  -> Agent explicitly activates Skill or invokes typed capability
  -> Runtime validates Skill/source/trust/tool metadata/subpackage/lifecycle
  -> Runtime injects Skill prompt content and capability/tool policy from the owning registries
```

可借鉴 Codex/OpenCode 的地方：

- catalog 先给摘要，具体 Skill 内容在显式触发或 Agent 需要时注入。
- Skill dependency、MCP/provider/external processor dependency 以 diagnostics 和 explicit install/enable flow 表达。
- Plugin 是 skills、MCP/providers、apps 或 processors 的 packaging/discovery surface，不是 runtime 直接调用对象。

不可接受的路径：

- Extension/Webview 用自然语言关键词在模型 reasoning 前自动选择 Skill。
- Skill 自行绕过 runtime permission 或 capability registry。
- Plugin/Market manifest 自行把 trust 升级为 `core`。
- 为单个领域 workflow 复制一套 package-local Skill engine。

### 7. State、history、queue 和 artifact 必须区分 durable fact 与 runtime projection

Codex/OpenCode 都把 session/thread/history/event store 作为 agent 产品主干。Neko 也需要保存会话、journal、artifact 和 task observation，但必须区分：

| 类型                  | 示例                                                                            | 规则                                                  |
| --------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Durable creative fact | Asset、Entity、Draft、Plan、Task、ResourceRef、workspace-relative path          | 可进入项目事实和长期 artifact。                       |
| Session history       | user/assistant/tool messages、journal event、conversation index                 | 可持久化，但不得承载 Webview-only display URI。       |
| Runtime projection    | stream delta、phase、pending message queue、confirmation prompt、TaskCard state | 按 session/turn/version 投影，不能替代 durable fact。 |
| Host display state    | `asWebviewUri`、blob URL、runtime image src、temporary local path               | 不进入长期 payload；只能由 host presenter 临时生成。  |

消息队列、任务队列和任务卡继续遵守 [`adr-agent-message-task-queue-boundary.md`](adr-agent-message-task-queue-boundary.md)。External Processor 输出继续遵守 ResourceRef 与 path policy。

## 五层分析

### 职责

- `@neko/agent`：host-neutral Agent runtime、session facade、turn assembly、runner port、capability consumption。
- `@neko-agent/types`：Webview/Extension/Agent projection contract。
- `@neko/shared`：跨包 capability、permission、provider、ResourceRef、task/artifact 基础 contract。
- Extension：VS Code API、workspace trust、resource URI projection、Engine client provider、ContentAccess、host effect。
- Domain packages：贡献领域 capability provider、typed operation、artifact/schema adapter，不反向依赖 Agent internals。

### 依赖

- Webview 不依赖 Agent runtime、platform、ai-sdk 或 VS Code。
- Runtime 不依赖 Webview、React、Extension 或 VS Code。
- Extension 不引入 React。
- 功能包之间不直接 import 对方内部实现；通过 shared contract、domain service、registry 或 provider。
- Rust Engine/Proto 仍是跨层数据和媒体计算的权威，Agent TS 不重复实现核心计算。

### 接口

- 新 runtime 能力先定义小接口和 schema，再实现 adapter。
- Capability registry、external processor registry、permission request、task observation 都应可被 contract test 验证。
- 未知 schema/version/message、未注册 capability、非法 path/root、缺失 provider、越权 resource 都应 fail-visible。
- Runtime event 必须带 conversation/turn/task identity，避免 Webview 通过数组位置或文本解析推断事实。

### 扩展

- VS Code、TUI 和未来客户端都应复用 runtime ports 与 runtime command/event contract。
- 如果 desktop app、remote control、SDK、跨进程共享 session 或多客户端并发连接成为真实需求，再把 command/event contract 提升为 protocol/server。
- Capability/tool 三段式可先在 External Processor 和 high-risk creative operation 上落地，再推广到通用 domain capability。
- AgentSession 瘦身应按 owner 逐步迁移，不做一次性大爆炸重写。

### 测试

- 保持并扩展 architecture boundary guards：Webview/Extension/runtime 依赖方向、runtime root 文件、forbidden domain runtime、Extension host adapter 边界。
- 为 `runtime/turn` 补充 provider selection、token budget、queued message compatibility、context patch contract 测试。
- 为 `runtime/runner` 补充 cancellation、confirmation timeout、pending queue、config locked 测试。
- 为 `runtime/capability` 补充 manifest/source/trust/diagnostic、registry revision、injection blocking 测试。
- 为 External Processor 和 resource handoff 补充 path policy、ResourceRef、legacy cachePath poison、Webview URI 非持久化测试。
- VS Code Webview 视觉、CSP、message route、resource projection 改动必须用 Extension Development Host 或 `vscode-extension-debugger` 验证。

## 后果

- Neko 可以吸收 Codex/OpenCode 的成熟分层经验，先平台化真实需要的 Skill/Plugin/Capability 与客户端 adapter，而不把本地创作套件过早改造成通用 agent daemon。
- `AgentSession` 的长期职责会变少；短期仍保留兼容 facade，降低迁移风险。
- Capability 和 External Processor 的边界会更清晰，审批、资源、trust 和执行并发可以独立测试。
- 如果未来确实需要 app-server/protocol，已有 runtime ports、runtime command/event contract 和 contract-first 规则可以自然提升，不需要重写 VS Code、TUI 或未来客户端 adapter。

## 不做

- 不在第一阶段新增通用 Agent app-server、daemon、SDK 或远程 control plane；这不禁止 Skill/Plugin/Capability 平台化，也不禁止 VS Code/TUI/future client 共享 runtime command/event contract。
- 不默认暴露任意 shell/Bash 作为创作 Agent 能力。
- 不让 Webview 直接调用 runtime、provider、Engine 或 VS Code API。
- 不把 Codex/OpenCode 的 coding-agent 文件编辑、shell sandbox、patch workflow 作为 Neko creative workflow 的默认模型。
- 不把 Skill/Plugin 变成独立 workflow engine 或隐式自然语言 router。

## 后续建议

1. 从 `AgentSession` 中优先抽离 confirmation、pending message queue、journal/artifact/validation owner，保持每次迁移有 characterization test。
2. 为 External Processor catalog 建立 `Registry -> CallRuntime -> PolicyOrchestrator` 的最小实现，并用 path/resource/trust diagnostics 覆盖真实边界。
3. 为 runtime/capability/turn README 和 architecture boundary guards 增加本 ADR 链接。
4. 为 VS Code/TUI/future client 梳理最小 `AgentRuntimeCommand` / `AgentRuntimeEvent` contract，避免客户端直接复刻 runtime 语义。
5. 如果未来提出 Agent protocol/server，先创建 OpenSpec，明确真实客户端、schema、state store、migration 和 VS Code Webview 验证路径。
