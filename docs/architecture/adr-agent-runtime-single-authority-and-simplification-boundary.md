# ADR: Agent Runtime 单一权威与架构收敛边界

状态：Accepted（目标架构，尚未实施）
日期：2026-07-23
范围：`neko-agent` runtime、platform、Extension、Webview、Prompt、Capability、External Processor、Chara/World 与 Quality 领域编排。

本文决定继续收敛 Agent 周边的重复状态权威、平行实现和提前泛化的扩展框架。目标不是按文件大小拆分更多层，而是删除 shallow module、恢复 owning responsibility，并让每类运行状态只有一个 canonical path。

本文补充：

- [`adr-pi-agent-runtime.md`](adr-pi-agent-runtime.md)：Pi 继续是唯一 Agent/LLM/Skill/Session runtime。
- [`adr-agent-tool-call-domain-job-lifecycle-boundary.md`](adr-agent-tool-call-domain-job-lifecycle-boundary.md)：Agent 内工作继续使用 Tool Call，本文不得重新引入通用 Task/TaskManager。
- [`adr-agent-runtime-architecture-comparison-boundary.md`](adr-agent-runtime-architecture-comparison-boundary.md)：竞品参考只用于验证本地职责和协议，不照搬远程平台复杂度。
- [`adr-agent-prompt-skill-validator-boundary.md`](adr-agent-prompt-skill-validator-boundary.md)：提示词、Skill、Validator 和 capability 的语义边界继续有效，本文收敛的是重复实现路径。
- [`adr-agent-sandbox-and-external-processing-boundary.md`](adr-agent-sandbox-and-external-processing-boundary.md)：路径、资源、trust、approval 和进程隔离约束继续有效；其中五类来源、通用 package registry 和完整 processor extension framework 改为需要真实产品消费者证明的条件性架构。
- [`adr-neko-desktop-home-project-profile-ux-boundary.md`](adr-neko-desktop-home-project-profile-ux-boundary.md) 及 Character/World 聚合 OpenSpec：Chara/World 领域拥有角色和世界工作流，Agent 保持领域中立。

在对应 OpenSpec 完成前，现有 legacy stream message、Prompt 平行实现、Agent-owned 领域 controller、Platform façade 和 External Processor registry 仍可能是代码的实际行为；不得把本文目标误报为已经实施。

## 背景

Task/TaskManager 收敛后，Agent 仍存在另一类复杂度：相同状态由多套结构维护，或为尚未出现的变化点预先建立完整框架。典型表现包括：

- 同一 Pi 流式事件同时写入 Timeline projection、可变 Message/ContentBlock 和 legacy Webview stream message。
- Webview 同时消费 projection snapshot/patch 和 `streamText`、`toolCall`、`toolResult` 等旧消息。
- Prompt 同时存在 Builder、Composer、Orchestrator、Registry、Cache 和两个 PromptManager，但真实宿主主要使用其中一条路径。
- Agent Extension 拥有角色对话、Embody、证据、Quality Gate 和 remediation 等领域工作流。
- 同一内容在显示前经过 TimelineItem、Message、ContentBlock、Composite projection、RichContent 和多层 presenter。
- Platform 只是转交多个 manager，而 ConfigManager 又拥有过宽的配置、媒体 override、导入导出、状态投影和诊断职责。
- External Processor 类型、runtime、registry 和 Host adapter 已形成完整框架，但仓库内当前只发现一个具体 processor。
- Capability 动态 provider seam 已有真实多领域消费者，但部分可选 profile、card、静态 manifest 和 registry fan-out 缺少 producer。

这些问题不能靠继续拆文件解决。更多 interface、factory、registry 或 adapter 会增加概念数量，却不会提高 leverage 或 locality。

## 判断原则

本文使用以下原则区分必要复杂度与过度设计：

### Deep module

一个 module 可以内部复杂，但必须通过窄而稳定的 interface 隐藏复杂度。调用方不应为了使用它而理解其内部 manager、registry、缓存和状态机。

### 单一权威

同一时刻、同一 identity、同一语义的可变状态只能有一个 live owner。其他结构只能是不可变快照、派生 projection、终态持久记录或显式 adapter，不能成为第二套可写事实来源。

### Deletion test

删除一个 abstraction 后：

- 如果复杂度真正消失，且调用方没有接管同等状态机，该 abstraction 是优先删除候选；
- 如果复杂度只是被推入多个调用方，说明该 module 仍有 leverage，应深化而不是删除；
- 如果 abstraction 保护 Webview、文件、进程、provider、trust、用户数据或异步取消等真实边界，不得以“简化”为由删除。

### 真实变化点

只有已经存在两个以上生命周期、领域语义、错误模型和变化方向一致的实现，或已有明确发布契约时，才建立通用 extension seam。仅名称相似、可能有插件或未来也许需要，不构成充分理由。

## 五层分析

| 层 | 当前问题 | 目标 |
| --- | --- | --- |
| 职责 | Agent Extension、Platform 和 Webview 同时承担 runtime、领域编排、配置投影与显示状态 | Runtime、Host、Webview 和领域 package 各自拥有明确状态；组合根只装配 |
| 依赖 | 调用方需要理解多个 manager、presenter、registry 和 legacy message | 依赖稳定 contract 和不可变 projection，不穿透内部 implementation |
| 接口 | 同一语义存在多个 DTO、stream message、ContentBlock 和 presenter projection | 每个运行边界只有一个 canonical contract，adapter 只存在于真实 host seam |
| 扩展 | 为未实现 provider、processor 和 profile 预建可选 registry | 已有多实现的 seam 保留；无 producer 的 extension point 删除或延后 |
| 测试 | 最终 UI 成功不能证明使用哪套 stream、renderer 或 Prompt 路径 | 同时断言结果和 canonical path，并 poison 被替代路径 |

## 决策

### 1. 活跃 Agent Turn 只允许 Timeline projection 作为显示权威

流式 canonical path 统一为：

```text
Pi Agent event
  -> AgentTurnTimelineOperation
  -> ConversationProjectionStore
  -> versioned snapshot / patch
  -> Webview timeline renderer
```

约束：

- 文本、thinking、Tool Call、Tool result、approval、diagnostic 和终态都投影为同一 Timeline 的有序 item。
- `ConversationProjectionStore` 是活跃 Turn 的唯一可变显示权威。
- Conversation/transcript 持久化只能接收终态或明确 checkpoint，不得与 Timeline 并行累积同一流式文本。
- Webview 不得再通过 `streamText`、`streamThinking`、`toolCall`、`toolResult`、`streamComplete` 等消息维护第二套 conversation state。
- Webview attachment、资源授权、Host command 等不属于 Timeline 的消息继续保留，但不得携带另一份活跃对话内容。
- Extension 不得同时维护 `activeStreams` 和 `activePiStreams` 两套可成功处理同一 Pi Turn 的 runtime。
- 中断、恢复和重新附着只针对明确的 conversation/turn/run identity 读取 projection，不回退到当前 active tab 或旧消息累积结果。

此决策优先级最高，因为它是流式顺序错误、重复渲染、Tool 状态漂移和恢复不一致的共同上游。

### 2. Transcript、Timeline projection 和 Render representation 必须分离

只保留三类职责不同的表示：

| 表示 | Owner | 用途 |
| --- | --- | --- |
| Transcript / conversation record | Session/persistence owner | 用户消息和已提交的终态记录 |
| Timeline projection | 当前 Agent Turn runtime | 流式、有序、可取消、可重放的显示状态 |
| Render representation | Webview renderer | 由 projection 派生的 Markdown、Tool、资源、媒体和 composite 显示节点 |

约束：

- 不得把同一活跃内容依次复制为 TimelineItem、Message、ContentBlock、Composite projection 和 RichContent 后再渲染。
- Tool Call 的 runtime identity、Timeline item 和显示节点可以有不同职责，但不得各自维护可变执行状态。
- Markdown、资源引用、媒体和 composite artifact 的格式复杂度应隐藏在一个 deep rendering module 后。
- Renderer registry 只选择显示 implementation，不参与 Tool 状态、资源持久化、领域 apply 或 Agent continuation。
- `MarkdownRenderer`、resource presenter 和 composite presenter 的具体收敛 contract 由实施 OpenSpec 定义；本文不要求为了减小文件而继续拆分 package-local adapter。

### 3. Prompt 只保留一条 composition path

Prompt canonical path 必须能够组合：

- 默认系统行为；
- locale；
- workspace/project `AGENTS.md`；
- 激活的 Skill content；
- owning package capability prompt fragment；
- 当前 Host/模型可用性和明确 diagnostics。

Agent 不再同时维护 Builder 与 Composer 两套成功路径。实施时必须：

- 以当前 Pi Extension/TUI 实际调用链为基线选择唯一 composition module；
- 删除或内化无生产调用方的 PromptManager、Composer、ModuleOrchestrator、ModuleRegistry 和 SectionCache；
- 保留 Skill、capability 和 validator 的职责分层，不把运行时工具 schema 搬入 Skill content；
- 对 Prompt cache 只在有可测的性能收益、明确 key 和失效规则时保留；
- 用 Agent evaluation 证明最终 Prompt 来源、Skill/capability 注入和 canonical composer 被命中。

### 4. Agent Extension 不拥有 Chara、World 和领域 Quality 工作流

Agent Extension 只拥有通用 Agent Host adapter、会话连接、Tool/Capability 装配和 Timeline 投影，不拥有：

- 角色候选选择、thin profile 补全、角色证据组装；
- Character/World memory 事实和领域 artifact 保存；
- Embody/roleplay 状态机；
- Canvas/Cut/媒体领域的 Quality Gate、remediation plan 和领域 apply；
- 其他可由 owning package 直接调用的创作工作流。

目标路径是：

```text
Owning domain module
  -> domain operation / run
  -> thin Agent capability adapter
  -> Pi Agent Run / Tool Call
```

如果两个以上领域确实共享相同 Quality 语义和生命周期，可以提取中立 Quality module；仅有类似命名或评分步骤不足以把它们集中到 Agent。

### 5. Platform 只能是组合结果，不得成为可变 manager 容器

`Platform` 可以作为 Host composition root 的构造结果存在，但不得要求消费者穿透访问 config、prompt、media 和 tool manager。

实施方向：

- 将配置读取投影为不可变 snapshot，将修改收敛到明确 mutation path；
- provider/model/MCP、assistant preference、media runtime override、导入导出和 diagnostics 按真实 owner 分离；
- media generation 生命周期遵循 Tool Call/Domain Job ADR，不由 Platform 创建新的通用 Task；
- 删除几乎没有生产调用方的旧 `IAgentRuntime`、`IPlatform`、`IService` 和重复 Prompt façade；
- 移除 `@neko/agent`、`@neko/platform`、`@neko/ai-sdk`、`@neko-agent/types` 等无约束 wildcard export，改为显式 public entry；
- barrel 只导出受支持 contract，不把内部 registry、manager 和 implementation 变成公共接口。

是否保留 `Platform` 名称不是本 ADR 的目标；判断标准是删除 façade 后复杂度是否真正消失，以及调用方是否仍需要理解内部 manager。

### 6. External Processor 保留安全模型，通用扩展框架需要消费者证明

以下约束继续无条件保留：

- typed processor 优先于任意 shell；
- PathAccessPolicy、ResourceRef、受管输出目录；
- executable、cwd、env、network、timeout、trust 和 approval 校验；
- 用户数据、project/personal manifest 和已安装 package 不得静默删除；
- 未知 schema、非法 root、缺失 executable 和权限不匹配必须 fail-visible。

以下结构不再因为“未来可能有插件”而自动成为必须实现的 canonical framework：

- 五类来源同时存在的统一 package discovery；
- 没有真实 contribution 的静态 manifest 扫描；
- 为单个 developer processor 建立的通用 registry/runtime/host adapter 链；
- 没有已发布消费者的 registration update、catalog fan-out 和 package lifecycle。

实施前必须审计：

1. 实际已发布或已安装的 project/personal/market/extension processor；
2. 是否存在需要保护的本地 manifest、设置和产物；
3. 至少两个 processor 是否共享相同的注册、解析、审批、执行和恢复语义；
4. 直接 developer-only adapter 是否能够在不削弱安全边界的前提下完成当前需求。

若缺少真实消费者，当前 `developer-mode.one-shot-command` 应使用直接、受限的 Host adapter；完整 registry 延后。若审计证明已有真实多来源消费者，则保留 registry，但必须通过删除平行 runtime、缩小 public interface 和集中 policy 提高 module depth。

### 7. Capability seam 保留真实贡献，删除空扩展点

Capability 动态 provider 已服务 Assets、Content、Entity、Search、Engine、Cut、Canvas 和 TUI，属于真实 seam，不得整体删除。

保留条件：

- 至少一个真实 producer 和 consumer；
- 明确的 source/trust/host requirement；
- 独立测试能够证明 registration、resolution 和 diagnostic；
- 不要求 Agent runtime理解 owning package 内部 schema。

没有 producer 的 provider card、artifact profile、expression profile、静态 package manifest 或 optional registry 不得仅因类型已经存在而长期保留。实现变更必须逐项审计；有真实消费者则深化现有 capability module，没有则删除类型、registry fan-out、export 和测试 fixture。

## 明确不做

- 不以行数、文件数或类数量单独判断过度设计。
- 不删除 Pi Agent runtime、动态 capability provider 或真实多 Host adapter。
- 不削弱 Webview sandbox、文件路径、External Processor、provider、approval 和用户数据边界。
- 不新增另一套 `AgentTask`、RenderTask、PromptTask、WorkflowRun 或通用 BackgroundTask 解决收敛问题。
- 不为了“整洁”同时叠加 interface、factory、registry、provider 和 adapter。
- 不在一次变更中同时重写流式协议、Prompt、领域迁移、Platform 和 processor；每次只替换一个可验证的 canonical path。

## 实施顺序

| 优先级 | 变更 | 原因 |
| --- | --- | --- |
| P0 | 统一 Timeline projection，删除 legacy active stream authority | 直接影响流式正确性、内容渲染、中断和恢复 |
| P1 | 删除 Prompt 平行成功路径 | deletion test 明确，影响面可独立限定 |
| P1 | 将 Chara/World/Quality 工作流移回 owning domain | 恢复依赖方向和 Agent 中立性 |
| P2 | 收敛 render representation 与 renderer registry | 应建立在稳定 Timeline contract 上 |
| P2 | 缩小 Platform/config/public export | 降低跨宿主耦合和公共表面积 |
| P3 | 审计并简化 External Processor 与空 capability extension point | 必须先保护潜在用户数据和真实插件消费者 |

每一项非平凡实施都必须建立独立或明确分阶段的 OpenSpec。后续项不得作为前一项的 compatibility fallback。

## 路径级验收

### Streaming

- 一个 Pi Turn 只通过 Timeline operation 更新活跃显示状态。
- Webview 只通过 versioned snapshot/patch 消费对话 Timeline。
- legacy `streamText`、`streamThinking`、`toolCall`、`toolResult` 和 `streamComplete` 路径被删除或 poison，且不能为新请求返回成功。
- 文本、thinking、Tool、approval、error、cancel 和 complete 的顺序、重复事件、断线重附着均有聚焦测试。
- Extension Development Host 场景验证真实 Webview 的流式 Markdown、Tool Timeline、中断和恢复。

### Prompt

- Extension 和 TUI 只构造同一种 Prompt composition path。
- 测试断言 AGENTS、Skill、capability fragment 和 locale 的来源与顺序。
- 被替代 Composer/Manager/Registry 不再通过 barrel 或 wildcard export 可达。
- 按 `neko-agent-evaluation` 运行聚焦真实 Agent evaluation。

### Domain ownership

- Character/World/Quality 的 runtime identity 和持久事实由 owning domain 创建和维护。
- Agent Extension 只注册 capability adapter，不再保存领域可变状态。
- 关闭 Agent 页面与领域 Run/Job 的行为遵循 owner lifecycle，而不是 active tab。

### Rendering

- 同一 Tool Call 只有一个可变状态 owner。
- Markdown、资源、媒体和 composite 内容从 Timeline projection 派生，不从 legacy Message block 旁路恢复。
- renderer 未注册、未知节点或非法 resource projection 必须 fail-visible。

### Platform、Processor 与 Capability

- public export 只包含受支持 contract。
- 删除 Platform façade 后调用方没有复制配置状态机。
- External Processor 简化前完成本地 manifest 和用户数据审计；保留或迁移结果有明确 diagnostic。
- capability extension point 逐项证明真实 producer/consumer；空路径不再由 fixture 或 export 假装存活。

## 后果

正面后果：

- 流式输出、Tool 状态、内容渲染和中断恢复共享同一顺序事实；
- 删除平行 Prompt 和 stream path 后，测试矩阵与竞态面显著缩小；
- Agent 恢复为领域中立 runtime，Chara/World/Quality 可以独立演进；
- public interface 更窄，内部 implementation 可以重构而不波及所有宿主；
- External Processor 和 Capability 的复杂度由真实消费者驱动。

代价与风险：

- 流式协议迁移会同时影响 Extension、Webview、会话恢复和测试，必须分阶段 poison 旧路径；
- 终态 transcript 与活跃 Timeline 分离后，需要明确 checkpoint 和崩溃恢复策略；
- 领域 controller 迁移可能暴露此前隐藏在 Agent Extension 中的 package contract 缺口；
- External Processor 简化前若忽略用户 manifest，会造成用户数据或已配置工具损失，因此必须先审计和迁移；
- 删除 wildcard export 会产生显式破坏性编译修改，但项目处于 prelaunch，应一次性迁移本次边界内调用方。

## 结论

Agent 当前最需要的不是更多抽象，而是减少可写事实来源和没有消费者证明的扩展层。目标结构是：Pi Agent Run 和 Tool Call 负责推理执行，Timeline projection 负责活跃显示，Transcript 负责终态记录，Webview renderer 负责纯显示，领域 package 负责创作工作流和持久事实，Host composition root 只负责装配与真实边界适配。
