# neko-agent 包架构

更新日期：2026-07-26

`neko-agent` 提供 OpenNeko 的领域无关智能运行时、VS Code 集成和 Chat Webview。Pi 是唯一
Agent、主模型、Tool 调度、Skill 读取和 transcript/context 执行路径；已删除的
`AgentSession`、`AgentExecutor`、Think/Act/ReAct、Platform chat adapter 和自建 Journal
不得作为正常路径或兼容 fallback。

系统级约束见：

- [`docs/architecture/agent.md`](../../docs/architecture/agent.md)
- [`docs/architecture/adr-pi-agent-runtime.md`](../../docs/architecture/adr-pi-agent-runtime.md)
- [`docs/architecture/adr-agent-tool-call-domain-job-lifecycle-boundary.md`](../../docs/architecture/adr-agent-tool-call-domain-job-lifecycle-boundary.md)
- [`packages/agent/src/runtime/README.md`](packages/agent/src/runtime/README.md)

## 子包与职责

| 包                      | 职责                                                                                                                             | 禁止                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `@neko/agent`           | host-neutral Pi conversation runtime、Prompt、Skill Host、Tool/Capability bridge、permission、MCP、memory/context 和产品事件投影 | VS Code/React、第二套 Agent loop、第二套 transcript、领域 Job 状态 |
| `@neko-agent/types`     | Webview、Extension 和 runtime 共享的消息、identity、Timeline 与 projection contract                                              | runtime 实现、VS Code、React、provider SDK                         |
| `@neko-agent/extension` | VS Code command、Webview bridge、workspace trust、URI/resource、credential interaction、composition/disposal                     | Agent 决策、Prompt 拼装、领域事实                                  |
| `@neko-agent/webview`   | Chat/Timeline/settings/confirmation 的 React 投影和短生命周期 UI 状态                                                            | 文件 IO、Tool 执行、provider 调用、持久事实                        |
| `@neko/platform`        | 迁移中的 Host 配置投影和媒体 provider implementation                                                                             | 主模型 chat fallback、GenerationJob contract、Agent transcript     |
| `@neko/ai-sdk`          | 仍被媒体/输入边界使用的 provider 辅助能力                                                                                        | Agent 主模型执行或 Pi 兼容层                                       |
| `apps/neko-tui`         | Terminal TUI/headless Host、Node composition、终端投影和 evaluation driver                                                       | 第二套 Agent runtime 或配置规则                                    |

`@neko/generation`、`@neko/chara`、`@neko/quality`、Canvas、Cut、Assets、Entity、Search 和
Engine 是与 Agent 平级的领域 owner。Agent 通过 typed Capability/Tool/domain port 组合它们，
不转移领域事实所有权。

## 依赖方向

```text
Webview
  -> agent-types
  -> postMessage
  -> Extension Host
       -> host-neutral @neko/agent runtime
            -> Pi Agent / Pi Session / Pi Skills / Pi AI
            -> shared contracts
            -> injected domain capabilities

Terminal TUI / headless
  -> host-neutral @neko/agent runtime
  -> same Pi and product contracts
```

Webview 不依赖 runtime、Platform 或 VS Code API。`@neko/agent` 不依赖 Extension、Webview、
React 或具体领域实现。Host 可以依赖 runtime 与领域 package，并负责把具体 adapter 注入到
conversation-scoped composition root。

## Canonical conversation path

```text
Host input
  -> explicit conversationId / branchId / turnId
  -> immutable AgentModelPolicy snapshot
  -> conversation-scoped Pi Agent + active Pi Session
  -> OpenNeko permission/workspace-trust preflight
  -> Pi Tool execution over owning Capability/domain port
  -> Pi events
  -> authoritative conversation Timeline projection
  -> TUI or Webview Host projection
  -> terminal turn checkpoint in Pi Session JSONL
```

关键不变量：

- `conversationId`、`branchId`、Pi `sessionId`、`turnId`、`runId`、`toolCallId` 含义不同，
  必须显式携带，不能回退到当前 active tab/conversation。
- 每个 active conversation 独立拥有 Pi Agent、active branch/session、队列、abort state、
  immutable model snapshot、event subscription 和 projection。
- Pi Session JSONL 是 transcript/context/compaction 的唯一权威；OpenNeko SQLite 只拥有
  conversation catalog、branch mapping、lease、provider/Job/resource 等产品事实。
- Webview Tab 和 TUI controller 只拥有展示与 attachment 状态，不拥有 conversation runtime。
- legacy Executor/AgentSession/Journal/chat adapter 被命中时必须 fail-visible。

## 模型与 Provider

运行时在 turn/run 开始时冻结一份 flat `purpose -> model + resolved parameters` snapshot：

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

只注册有真实 caller 且 capability 匹配的 purpose。缺失 provider、model、capability 或
credential 时返回明确 diagnostic；不得使用 first-compatible model、type default、
`agent.main` 或旧 Platform chat path 兜底。

Pi 支持的 chat/understanding model 直接投影为 Pi provider/model。媒体生成继续通过 owning
Generation runtime 执行，不伪装成 Pi chat model。CredentialStore 是用户级单一持久边界，
TUI 和 VS Code 共享 contract；secret 不进入 transcript、workspace fact、日志或 evaluation fact。

## Skill、Tool 与权限

- Pi Skill discovery/formatting/read 是唯一 `SKILL.md` 路径。
- OpenNeko 只补充 source、trust、enablement、fingerprint 和 process-local opaque locator。
- Skill content/metadata 不授予 Tool、permission、workspace trust、model override 或执行权限。
- model-selected Skill 通过指定的 `read_skill` 边界读取，真实 Tool result 和 receipt 留在 Pi
  transcript；不维护 activation slot、ToolGuard、ToolSet mutation 或第二套 Skill cache。
- Tool schema 在注册时转换并保持完整结构；非法参数、未知 wire name、权限拒绝和缺失能力都
  fail-visible。
- `plan` 不执行 Tool；`ask` 对非只读副作用 Tool 使用 Timeline-owned confirmation。

## Domain Job 边界

普通 Tool 在同一 Pi Tool Call 中返回终态。需要独立身份、恢复、查询、取消或重试的工作由
具体领域 Job owner 管理：

```text
Pi Tool Call
  -> @neko/generation GenerationJob port
  -> versioned snapshot observation
  -> terminal ResourceRef or explicit diagnostic

Cut surface
  -> Cut ExportJob port
  -> Cut editor/status-bar projection
```

Agent 不拥有 JobStore，不建立通用 TaskManager/Activity 页面，也不使用 active/latest Job
fallback。Tool Call 返回后，后续 describe/observe/cancel/retry 是带精确 JobRef 的新 Tool Call。
生成结果通过稳定 `ResourceRef` 和 Workspace Board delivery contract 交付。

## Host 与资源边界

- Webview 只能通过 `postMessage` 与 Extension 通信；资源必须经 `asWebviewUri()` 投影。
- Extension/Node Host 负责 workspace IO、path containment、trust、credential interaction、
  LocalMetadata、provider/runtime composition 和 `Disposable` 生命周期。
- 模型与 Webview 只看稳定 identity、ContentLocator/ResourceRef 和脱敏 diagnostic，不看绝对
  路径、cache path、token、SQLite 细节或 runtime handle。
- Extension Development Host 是 VS Code Webview、CSP、焦点、消息和视觉验收的唯一运行态
  路径；普通浏览器/Vite 不能替代。

## 扩展规则

新增能力时按以下顺序：

1. 在 owning package 定义 typed contract、schema、diagnostic 和 identity。
2. 通过 `AgentCapabilityProvider`、Tool contribution 或具体 domain port 暴露。
3. 在 Host composition root 注入，不在 Agent core 硬编码领域语义。
4. 为 schema、permission、identity、canonical path 和 legacy poison 增加确定性测试。
5. 对模型驱动路径运行 key-free evaluation；需要真实行为结论时再运行有凭据的真实 TUI case。
6. 涉及 VS Code UI/消息时使用 Extension Development Host 验收。

不得增加 Pi facade、第二套 model/message DTO、第二个 transcript、compatibility adapter、
generic Job manager 或共享 active runtime singleton。

## 验证入口

```bash
pnpm --dir packages/neko-agent/packages/agent test:run
pnpm --dir packages/neko-agent/packages/extension test:run
pnpm --dir packages/neko-agent/packages/webview test:run
pnpm check:agent-boundaries
pnpm test:agent:eval
pnpm build
```

`pnpm test:agent:eval` 只证明 key-free harness、schema 和 hard gate；真实 Provider 行为必须保留
实际 model、usage/cost、artifact、path fact 与 no-fallback 报告。
