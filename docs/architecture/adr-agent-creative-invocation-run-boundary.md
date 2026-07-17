# ADR: Agent 创作调用、Run 与写回边界

状态：Accepted
日期：2026-07-09
范围：`neko-agent`、创作包 AI 按钮、生成资产生命周期、run/workItem、Package-owned apply、Agent 投影与后续扩展边界。

本文记录 OpenNeko 面向内容创作时，Agent 如何接收创作包发起的 AI 调用、执行生成任务、保存生成资源并写回 owning package。它补充 [`agent.md`](agent.md)、[`adr-agent-runtime-architecture-comparison-boundary.md`](adr-agent-runtime-architecture-comparison-boundary.md)、[`adr-agent-message-task-queue-boundary.md`](adr-agent-message-task-queue-boundary.md)、[`adr-agent-sandbox-and-external-processing-boundary.md`](adr-agent-sandbox-and-external-processing-boundary.md)、[`headless-project-authoring.md`](headless-project-authoring.md) 与 [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)。

## 背景

Neko 的内容创作入口不仅来自 Agent Chat，也来自 Canvas、Cut、Story、Sketch、Audio、Model 等创作包内的 AI 按钮。这些入口通常作用于一个明确文档、节点、片段、素材或时间线区域，并且可能触发图片、视频、音频、文档抽取、分镜、提示词批量生成等高成本或长耗时任务。

早期设计曾考虑把外部创作包调用路由到最近的 source/document-associated background conversation，再由 conversation 承载后台工作。这个方向会带来两个问题：

- 成本与性能：每次创作按钮都需要会话关联、上下文选择和历史路由，容易把简单生成请求变成昂贵的 conversation orchestration。
- 语义污染：创作包按钮的真实 owner 是文档、目标对象和 run，而不是当前聊天会话。把它默认绑定到 conversation 容易污染聊天历史、Project Memory 和后续 Agent 上下文。

因此，Neko 对外部创作调用采用 document/run-centric 设计，而不是 gateway/session-routing-centric 设计。Agent conversation 仍可展示结果、诊断和后续操作，但不是外部创作调用的默认权威身份。

## 决策

### 1. 不采用 Gateway Session Routing 作为当前创作调用路径

Neko 当前不引入 OpenClaw 式 gateway/session routing、远程会话网关、跨进程 routing daemon 或 session-centric invocation broker。外部创作包按钮不得默认通过“最近会话”“当前 Agent 会话”或“隐式 document association conversation”来决定执行上下文。

当前 canonical path 是：

```text
Package AI button / Agent action
  -> explicit invocation envelope
  -> lightweight run / workItem
  -> typed capability call
  -> ResourceRef / artifact result
  -> package-owned apply
  -> optional Agent conversation projection
```

`conversationId` 是可选投影目标或用户显式继续创作对话时的上下文身份，不是外部创作调用的默认路由依据。没有 `conversationId` 不应阻止 document-scoped run 执行；缺少 `documentRef`、`targetRef`、`capabilityId`、revision 或 idempotency 这类执行身份则必须 fail-visible。

### 2. 外部创作调用必须使用显式 Invocation Envelope

创作包发起 AI 操作时，必须提供明确的调用 envelope，不能让 Agent 从聊天历史、Webview 当前状态或最近活动会话中猜测目标。

最小语义包括：

```ts
interface ExternalCreativeAiInvocation {
  documentRef: DocumentRef;
  sourceRef?: CreativeSourceRef;
  targetRef: CreativeTargetRef;
  intent: CreativeAiIntent;
  capabilityId: string;
  modelSelection?: AgentModelSelection;
  revision: CreativeTargetRevision;
  idempotencyKey: string;
  provenance: CreativeAiInvocationProvenance;
  conversationId?: string;
}
```

字段命名可在实现中按现有 shared contract 调整，但语义必须稳定：

- `documentRef` 表示 owning package 的持久文档或项目。
- `sourceRef` 表示用户选择、参考素材、上下文节点或输入片段。
- `targetRef` 表示即将生成、替换、追加或建议写回的目标。
- `capabilityId` 表示要调用的 typed creative capability，不是自然语言工具猜测。
- `revision` 是 stale target 防护，不匹配时不得静默应用。
- `idempotencyKey` 防止重复点击、重放消息或刷新 UI 造成重复 provider 调用和重复扣费。
- `conversationId` 只表达可选投影或用户显式选择的创作对话。

Envelope 不得携带 Webview URI、blob/object URL、provider runtime handle、component-local state、未授权绝对路径或 cache path 作为 durable identity。图片、视频、音频和文档页引用必须使用 `ResourceRef`、workspace-relative path、`${VAR}/path`、asset/entity id 或 package-owned source ref。

### 3. Run/workItem 是并发和成本控制单位

外部创作调用默认创建或复用轻量 `run`。批量生成时，每个目标或子任务使用 `workItem`。conversation 不是并发单位，也不是成本控制单位。

Run/workItem 至少应保存：

```text
runId
documentRef
targetRef
capabilityId
status
model/provider identity
cost estimate / usage when available
cancel state
result ResourceRef / artifact refs
diagnostics
```

约束：

- 主 Agent turn 可以继续按 conversation 串行；创作包生成任务通过 run/workItem 并发。
- 长耗时媒体生成、batch work、subagent work 和 external processor 必须支持取消、超时、重试和进度观察。
- 重复 invocation envelope 命中同一 idempotency key 时，应返回已有 run/workItem 或明确诊断，不能重复创建 provider 调用。
- Run 完成后可以向 Agent conversation 投影摘要、诊断、重试按钮或 apply 状态，但不得自动把完整结果写入聊天历史或 Project Memory。

### 4. 生成资产必须进入 ResourceRef 生命周期

图片、视频、音频、文档页图、外部处理器输出和 provider 生成结果必须返回稳定资源身份：

```text
ResourceRef
  + provenance
  + model/profile
  + prompt/params/seed when available
  + diagnostics
  + retention/promote/discard state
```

`dataUrl`、`renderUri`、`asWebviewUri`、blob/object URL、系统 temp path、`.neko/.cache` 物理路径和旧 `cachePath` 都不能作为长期 payload、Canvas/Cut/Sketch/Story 写回身份或项目事实。它们只能是当前 host projection 的展示细节或迁移诊断。

当用户决定保留生成结果时，资源应通过 package-owned apply、Assets promotion 或 media-library policy 进入可追溯的项目事实；未保留结果保持为可清理 runtime/cache 资源。

### 5. 写回必须属于 Owning Package

Agent 不直接修改 Canvas、Cut、Sketch、Story、Audio、Model 或 Assets 的 Webview store、内部状态或持久项目文件。Agent 只负责：

- 选择 capability。
- 组织 invocation/run。
- 记录 observation、diagnostics、provenance。
- 调用 owning package 暴露的 canonical authoring/apply adapter。
- 投影结果给用户确认或继续操作。

Owning package 负责：

- 验证 `documentRef`、`targetRef` 和 revision。
- 执行 apply、candidate apply、replace、append、merge 或 reject。
- 维护 undo/history、项目格式、领域 invariants 和预览刷新。
- 返回 typed apply diagnostics。

写回失败必须返回明确 diagnostic；不得 fallback 到旧 UI-bound command、隐藏打开 Webview、Webview pending import、`dataUrl` 直接写状态或声称发送成功。

### 6. 上下文包最小化，避免默认加载会话历史

外部创作按钮的上下文应由 owning package 提供最小、可解释、可测试的 context packet：

```text
selected nodes / clips / layers
nearby scene or shot metadata
referenced assets and ResourceRefs
style/profile hints
target revision
user-visible intent
```

Agent/runtime 不应默认读取完整 conversation history、自动召回 archived conversations 或把整个项目塞进 prompt。需要更多上下文时，应通过 typed content access/capability 请求，并产生可见 diagnostic 或用户确认。

### 7. 成本、能力和权限前置判断

高成本或有副作用的创作操作在创建 provider 调用或 external processor 前必须完成本地 gate：

- provider/model 是否声明所需 capability。
- 当前模型选择是否完整且匹配。
- 是否批量、是否可能高成本、是否需要 approval。
- 是否覆盖或修改项目事实。
- 输入/输出 root 是否符合 PathAccessPolicy。
- 是否需要 External Processor trust、network、env 或 resource approval。

显式选择的 provider/model 不可静默 fallback 到另一个模型、官方 gateway、首个可用模型或 mock。缺失 capability、配置错误、权限不足、revision stale 或路径越权都应 fail-visible。

### 8. TypeScript Extension 暂不进入当前设计

用户脚本、TypeScript extension、hot reload extension hooks 或任意项目级脚本扩展不进入当前必要路径。未来如需设计，应单独提出 ADR 或 OpenSpec，围绕 manifest、trust、PathAccessPolicy、approval、sandbox 和 ResourceRef 输出定义边界。

当前阶段只接受以下扩展形态：

- typed domain capability provider；
- managed External Processor manifest；
- Skill / profile / prompt guidance；
- package-owned authoring/apply adapter；
- Market/plugin 贡献的受管 capability。

### 9. Agent conversation 是投影和继续创作入口，不是权威执行身份

Agent Chat 可以展示外部 run 的摘要、进度、结果卡、诊断、重试、打开资源、发送到领域包等操作。但这些 UI 投影不得成为唯一事实源：

- Run/workItem 状态来自 runtime 或 package adapter。
- 生成资源身份来自 ResourceRef/artifact store。
- 项目事实来自 owning package。
- Project Memory 晋升必须显式确认，不从 run 或 conversation 自动写入。

用户明确选择“在某个 Agent 对话中继续”时，后续 Agent turn 可以引用 run result、ResourceRef、diagnostics 和 package state。这个动作是上下文引用，不是把历史 conversation 变成 run owner。

## 五层分析

### 职责

- `@neko/shared` 或现有 shared contract 层定义 invocation envelope、document/source/target refs、revision、idempotency、run/workItem、apply request 和 diagnostics。
- `@neko/agent` runtime 负责 host-neutral run/workItem orchestration、capability call、observation、cost/permission gate 和 Agent conversation projection。
- `neko-agent` Extension 负责 VS Code host adapter、resource authorization、Webview message adaptation、provider/processor bridge 和 optional Agent projection。
- 创作包 Extension 负责 AI button adapter、最小上下文包、document revision、package-owned apply adapter 和领域 diagnostic。
- 创作包 Webview 只发起 typed request、展示 package state，不调用 Agent internals。

### 依赖

- Webview 不导入 Agent runtime、VS Code API、provider SDK 或其他功能包内部实现。
- Agent runtime 不导入 Webview、React、VS Code 或具体创作包内部实现。
- 创作包之间不直接 import 对方内部状态；跨包写回通过 shared contract、command/facade 或 package-owned capability provider。
- Rust Engine、Assets、ResourceCache 和 PathAccessPolicy 继续作为媒体计算、资源身份和路径授权的权威边界。

### 接口

- 外部创作入口使用 explicit invocation envelope，不使用隐式 session routing。
- Run/workItem contract 必须表达 document/target/capability/status/cancel/result/diagnostic。
- Apply request 必须携带 target、result refs、revision precondition、idempotency 和 provenance。
- Runtime events 和 Webview projections 可以携带 optional `conversationId`，但执行身份必须有 document/run/target。
- 未知 schema/version、缺失 owner、未知 capability、stale revision、非法 resource identity 和 host-private ref 都应 fail-visible。

### 扩展

- 新创作包接入 AI 按钮时，只需要实现最小 context packet 和 apply adapter，不需要改 Agent Webview 内部。
- Capability Directory、Agent Profile、Project Memory 晋升、variant compare 和 trajectory/eval 可在 ResourceRef/run/apply 稳定后逐步增强。
- 如果未来出现真实跨进程共享 session、公共 SDK 或远程控制需求，应优先提升 runtime command/event contract；本 ADR 不作为引入 gateway/session router 的理由。
- TypeScript extension 和用户脚本能力必须另行设计，不从本 ADR 推导。

### 测试

- Contract tests：invocation envelope、refs、revision、idempotency、run/workItem、apply request 和 diagnostics。
- Routing tests：外部创作按钮不得 fallback 到当前 Agent conversation；Agent panel action 不得 fallback 到最近 document run。
- Idempotency tests：重复 invocation 不重复创建 provider 调用。
- Resource tests：`dataUrl`、Webview URI、blob URL、cache path、系统 temp path 不能进入 durable payload。
- Apply tests：revision match、stale target、deleted target、same-target lock、candidate apply、per-target batch failure。
- Runtime tests：run/workItem cancel、retry、timeout、cost/approval gate、provider capability mismatch。
- VS Code Webview 功能场景：只在触及 Webview 投影、CSP、resource reveal、apply controls 或 package UI 时需要，并通过真实 Extension Development Host 验证 UI、canonical path、产物和运行错误。

## 后果

- 外部创作按钮路径更短，避免为每次生成加载和路由 conversation history。
- 成本控制更早发生，重复点击和批量生成可以通过 idempotency 与 approval gate 管住。
- 生成结果从一开始就是 ResourceRef/artifact，而不是先进入 Webview/runtime-only payload 再补救。
- Agent 和创作包边界更清楚：Agent 负责调用与观察，owning package 负责事实写回。
- 未来仍可把结果投影到 Agent conversation，但 conversation 不再是外部创作调用的默认权威。

## 不做

- 不引入 gateway/session routing、通用 agent daemon、公共 SDK 或远程 control plane。
- 不默认把外部创作包按钮绑定到最近 conversation 或当前 Agent conversation。
- 不自动把 run/conversation 历史写入 Project Memory。
- 不让 Agent 直接修改创作包 Webview store 或项目文件。
- 不把 `dataUrl`、Webview URI、blob URL、cache path 或临时绝对路径作为稳定资源身份。
- 不在当前阶段设计 TypeScript extension、热加载脚本或任意本地脚本扩展。

## 需要同步收敛的既有设计

[`introduce-creative-ai-background-conversations`](../../openspec/changes/introduce-creative-ai-background-conversations/design.md) 中“外部 package invocation 路由到最近 source/document-associated background conversation”的方向应按本 ADR 收窄：

- 外部 package AI 按钮默认创建/复用 document-scoped run/workItem，而不是 background conversation。
- Agent conversation 只作为可选投影和显式继续创作入口。
- 最近 source/document association 可以用于 UI 提示、资源引用和 optional projection，但不能作为执行路由的默认成功路径。
- 第一条迁移路径仍应优先选择 Canvas 生成/编辑按钮，目标是从 `dataUrl` 写回转向 `ResourceRef` + package-owned apply。
