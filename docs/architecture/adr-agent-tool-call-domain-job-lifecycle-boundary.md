# ADR: Agent Tool Call、Subagent 与领域 Job 生命周期边界

状态：Accepted（部分实施）
日期：2026-07-23
范围：`neko-agent`、Pi Tool bridge、媒体生成、Canvas/Cut/Assets 创作入口、TUI、VS Code、拟议 Desktop、Subagent、页面关闭和执行恢复。

本文决定以 Tool Call 取代通用 Agent `Task`/`TaskManager`，同时保留真正具有独立产品生命周期的领域 Job/Session。它补充 [`adr-pi-agent-runtime.md`](adr-pi-agent-runtime.md)、[`adr-agent-runtime-architecture-comparison-boundary.md`](adr-agent-runtime-architecture-comparison-boundary.md)、[`adr-cut-otio-vscode-desktop-media-runtime-boundary.md`](adr-cut-otio-vscode-desktop-media-runtime-boundary.md) 和 [`package-boundaries.md`](package-boundaries.md)。

本文取代以下既有目标：

- [`adr-agent-message-task-queue-boundary.md`](adr-agent-message-task-queue-boundary.md) 中 `TaskManager`、`AgentWorkItem` 和通用 `TaskCard` 作为后台工具/媒体/subagent 权威的部分；消息队列与计划进度分离的原则继续有效。
- [`adr-agent-internal-continuation-boundary.md`](adr-agent-internal-continuation-boundary.md) 中 `task-result-continuation`、Task Group 和通用 Task 完成后续跑的部分；用户消息与 runtime-authored continuation 不得混为用户 transcript 的原则继续有效。
- [`adr-pi-agent-runtime.md`](adr-pi-agent-runtime.md) 和 `adopt-pi-agent-runtime` OpenSpec 中“长媒体 Tool 快速返回 `TaskRef`，由 OpenNeko Task runtime 观察”的部分。
- [`adr-agent-creative-invocation-run-boundary.md`](adr-agent-creative-invocation-run-boundary.md) 与 [`adr-canvas-creative-ai-candidate-actions.md`](adr-canvas-creative-ai-candidate-actions.md) 中由 Agent 通用 run/workItem/TaskManager 统一拥有 Canvas 直接创作动作的部分。Document/candidate/ResourceRef/package-owned apply 边界继续有效。

Agent 通用 TaskManager/TaskRef 已从当前 canonical Agent 路径删除。Generation 已实现最小
versioned lifecycle kernel、具体 coordinator、持久 store、重启恢复、Agent 领域 Job Tools、
TUI direct consumer 和 VS Code Host composition；Cut ExportJob 与 caller-owned projections 仍在
[`introduce-domain-job-lifecycle-kernel`](../../openspec/changes/introduce-domain-job-lifecycle-kernel/)
中实施。实现和 UI 不得把尚未接入的 VS Code 重启恢复或 Webview 管理误报为已经完成。

## 背景

Pi 已经为每次工具调用提供 Tool Call identity、参数校验、执行事件、结果和 `AbortSignal`。OpenNeko 又在其外建立通用 `Task`/`TaskManager`：媒体 Tool 提交后快速返回 `TaskRef`，第二套 runtime 再保存 provider identity、轮询进度、处理取消/恢复，并通过 continuation 把结果交回 Agent。

这使一个“由 Agent 发起、Agent 仍需结果、Agent 中断时也应停止”的操作拥有两套身份和状态机：

```text
Agent Run
  -> Tool Call
       -> TaskManager Task
            -> provider task
```

同时，Cut export、Canvas 直接生成、可恢复 provider job 等工作确实可能脱离当前 Agent 或页面继续。它们需要的是具体领域拥有的 Job，而不是 Agent 通用 Task。

## 五层分析

| 层   | 决策                                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------- |
| 职责 | 前台 Agent Run 拥有 Tool Call；明确 owner 拥有 Subagent；Generation/Cut/Assets 等领域拥有各自 Job/Session。 |
| 依赖 | Pi 只调度 Tool；领域通过窄 port 暴露 operation/job；Host 组合 owner，不把业务状态塞进 Webview 或全局 TaskManager。     |
| 接口 | Tool Call、Agent Run 和具体 Domain Job 使用不同 identity；底层只共享最小 ownership/cancellation primitive。            |
| 扩展 | 新增长任务先判断是否需要独立生命周期；只有满足条件才定义领域 Job，不新增通用 Task 类型。                               |
| 测试 | 必须证明 owner 级联、Pi signal、同一 Tool Timeline、后台存活、领域恢复和旧 TaskManager 未参与。                        |

## 决策

### 1. Agent 内不再存在通用 Task

Agent 发起且不需要独立存活的工作统一使用：

```text
AgentRun
  -> ToolCallExecution
       -> domain operation / provider adapter
       -> progress
       -> terminal Tool result
```

`ToolCallExecution` 必须携带 `agentRunId`、`conversationId`、`turnId`、`toolCallId` 和 tool identity。它继承 Agent Run 的取消信号，并在成功、失败或取消后释放临时资源。

“耗时长”不构成创建 Job 的充分条件。只要调用方需要终态结果、工作不应脱离 Agent 存活、也不需要跨进程恢复，Tool executor 就在调用内轮询 provider、投影进度并最终返回 `ResourceRef`、结构化结果或明确 diagnostic。

禁止以下路径：

```text
Tool Call
  -> create generic Task
  -> return TaskRef early
  -> TaskManager observes
  -> task continuation resumes Agent
```

### 2. 委派推理使用 SubagentRun

Agent 需要委派独立推理时，必须显式创建 `SubagentRun`。产品不保留独立
`BackgroundAgentRun`；它没有不同于前台 Agent 或 Subagent 的生产 owner 和生命周期。

创建成功后，明确 parent run 或应用级 supervisor 成为 live owner；原 Tool Call 只保留
`createdByAgentRunId`、`createdByToolCallId` 等 provenance。关闭 surface 时按 committed owner
policy 处理，用户通过精确 identity 显式中断。

spawn Tool Call 只负责创建 child run，不持续充当 child run 的 owner。child identity 提交前取消，不得留下孤儿运行；提交后 spawn Tool 取消，不得伪装成 child 也已取消。

### 3. 领域 Job 只在存在独立生命周期时使用

以下任一条件成立时，执行应成为 owning-domain Job/Session：

- 可以不经过 Agent，由 Canvas、Cut、Assets 或其他 UI/command 直接创建；
- 关闭调用页面后仍应继续；
- 需要跨进程重启恢复、重新附着或 provider reconciliation；
- 有独立排队、并发、重试、计费、产物提交或审计语义；
- 会提交领域事实，并需要领域级原子性。

典型 owner：

| 场景                                     | Canonical owner                                              |
| ---------------------------------------- | ------------------------------------------------------------ |
| 文档读取、搜索、局部解析、受限感知       | 当前 `ToolCallExecution`                                     |
| 所有媒体生成                              | Media/Generation `GenerationJob`                             |
| Canvas 直接 AI 按钮                      | Canvas operation + Generation domain                         |
| Cut 导出                                 | Cut `ExportJobPort` / `ExportJob`                            |
| 可脱离页面的批量素材导入                 | Assets `ImportJob`                                           |
| 角色/世界运行                            | `CharacterRun` / `WorldRun`，内部复用 Agent Run 与 Tool Call |
| 委派研究或长篇协作                       | `SubagentRun`                                                |

Agent 可以通过 Tool 创建、观察、取消或重新附着领域 Job，但不拥有 provider external id、领域进度、恢复 checkpoint、原子产物提交或最终领域事实。

### 4. 底层只统一生命周期机制，由各 owner 调用

`@neko/shared/job-lifecycle` 只负责 typed Job identity、phase、revision/CAS、终态不可变和
versioned observation；它没有 submit、payload/result、provider、artifact、retry policy 或
跨领域 handler registry。Generation/Cut 等领域各自拥有 snapshot schema、coordinator、
reconciliation 和结果提交。

Host-neutral `ExecutionOwnershipRegistry` 另只负责：

- 将 execution 附着到明确 owner；
- 显式 transfer ownership；
- 按 owner 级联取消；
- 释放 cancel/dispose handle；
- 拒绝缺失、陈旧或不匹配 identity。

它不得保存 provider task id、prompt、领域进度、结果、ResourceRef、重试策略或恢复 checkpoint。也就是说，底层统一的是资源 ownership/cancellation 机制，不是统一业务 Task 状态机。

```text
SurfaceOwner
  -> ForegroundAgentRun
       -> ToolCallExecution

ApplicationAgentSupervisor
  -> SubagentRun

GenerationDomain
  -> GenerationJob

CutDomain
  -> ExportJob
```

所有 owner 都调用同一机制，但各自维护领域状态。`activeTab`、`activeConversation` 或最近工作项只用于 UI 选择，不能成为 owner。

### 5. 页面关闭和应用退出按 owner 处理

- 关闭 Tab/Webview：取消由该 surface 创建且仍由它拥有的前台 Agent Run，以及其未终态 Tool Calls。
- 关闭 Window：取消该 Window 所有 surface-owned 前台运行。
- Quit：先取消 surface-owned 前台运行；Subagent 和 detached domain Job 按自己的 shutdown/recovery policy 处理。
- Subagent：按明确 parent/supervisor owner policy 处理，不根据创建页面或 active selection 猜测。
- Domain Job：提交时必须明确 `linked` 或 `detached/recoverable`；没有显式 detached contract 时默认随 caller/owner 取消。

关闭事件不能按当前选中的 Tab 或 conversation 猜测目标。取消、event 和 dispose 都必须携带精确 instance identity。

### 6. 中断 Tool Call 后不能恢复同一个调用

Tool Call 被取消后进入 terminal cancelled。同一个 `toolCallId` 不得复活。

若底层有稳定领域 Job，可以在新的 Agent Run 中用新的 Tool Call 重新附着：

```text
ToolCall A -> GenerationJob(jobId) -> observer detached
ToolCall B -> observe GenerationJob(jobId) -> terminal result
```

必须区分：

- `cancel`：停止并终结执行，不能恢复同一 execution；
- `detach`：观察者退出，Subagent 或领域 Job 按其 owner policy 继续；
- `recover/reattach`：通过新 observer/Tool Call 连接稳定 Job identity。

没有领域 Job identity 的普通 Tool Call 中断后只能重新调用；是否允许重试由 operation 幂等性和 provider outcome 语义决定。远端提交后连接丢失但没有 external id 时，应返回 outcome-unknown diagnostic，不能自动重提付费请求。

### 7. UI 取消泛化 Task 概念

UI 使用精确投影：

| UI                 | 权威语义                                                   |
| ------------------ | ---------------------------------------------------------- |
| Message Queue      | 尚未执行的用户输入                                         |
| Plan Progress      | Agent 计划/checklist，不是执行任务                         |
| Tool Execution     | 当前或历史 Tool Call，包括 Agent 发起的 GenerationJob 投影 |
| Agent Activity     | 前台 Agent Run、SubagentRun                                |
| Canvas action      | Canvas 直接生成的 JobRef、目标 revision 和 candidate 状态  |
| Cut editor/status  | Cut ExportJob 的进度、取消和结果                           |

`TaskCard` 应替换为 `ToolExecutionCard`、`AgentRunCard` 或领域卡片；`AgentTaskQueue` 应改为 `PlanProgress`。取消、重试、打开结果和恢复操作必须指向精确 owner，不提供语义不明的 `cancelTask`/`retryTask`。

产品不建立跨领域 Domain Activity authority、统一 Job command router 或常驻 Job 页面。调用方只
持有 JobRef、expected revision、目标关联和展示状态；领域 coordinator/store 仍是唯一生命周期权威。

### 8. Tool 流式输出只有一个 Timeline 权威

Tool 的确认、排队、提交、provider progress、部分观察、终态结果和错误全部锚定同一 `toolCallId` Timeline item：

```text
assistant turn
  -> ToolCall item
       waiting approval
       queued
       running 42%
       materializing artifact
       completed ResourceRef
```

不得追加第二条 assistant message、通用 TaskCard 或 Webview-only stream 作为另一事实源。高频 progress 可以节流，但必须有单调 version/sequence；取消后的迟到更新必须被拒绝。二进制产物不进入消息流，只返回稳定 `ResourceRef`。

## 面向内容创作的具体结论

### Agent 对话内生成

所有图片、视频、语音或音乐生成都提交 GenerationJob。linked Tool Call 订阅 Job revision、在同一
Timeline item 投影进度并等待终态；detached Tool Call 返回 JobRef。两者不建立第二条直接 provider
执行路径，也不需要 TaskRef。

### Canvas 直接生成

Canvas 按钮的 owner 是 Canvas document/action。它直接调用 Generation Job port，并按
candidate-first 规则写回；需要委派开放式推理时可显式创建 SubagentRun，但媒体执行本身仍由
GenerationJob 拥有。不能通过 Agent chat 转发 provider 调用。

### Cut OTIO 导出

Cut 已有明确 `ExportJobPort`，导出进度、取消、输入 revision、输出验证和原子提交继续归 Cut。Agent Tool 只能作为调用者/观察者，不能复制为 Agent Task。

### 批量创作

同一 Agent turn 中的小批量调用可以由多个 Tool Calls 或一个批量 Tool 完成，并随 Agent Run 取消。只有需要脱离 Agent、独立并发预算、跨进程恢复或由 UI 直接管理时，才使用具体领域 batch Job。

### Character/World

未来 `CharacterRun`、`WorldRun` 是领域运行身份；内部需要模型推理时复用 Agent Run/Tool Call。它们不创建第二套通用 Task runtime，也不把角色/世界事实交给 Agent transcript。

## 唯一迁移路径

1. 定义最小 `ToolCallExecution`、`AgentRunSupervisor`、领域 Job port 和 `ExecutionOwnershipRegistry` contract。
2. 让 media Tool 等待现有 media executor 的终态，接入 Pi `AbortSignal`，并将 progress/result 投影到同一 Tool item。
3. 让所有媒体生成入口统一建立 Media-owned `GenerationJob`，linked/detached 只作为调用策略。
4. 将 Canvas 直接动作接入 Generation domain port；保留 Canvas/domain owner。
5. 保留 Cut `ExportJobPort`，其他领域只在满足独立生命周期条件时增加具体 Job。
6. 删除独立 BackgroundAgentRun；真实 Subagent producer 出现时由明确 parent/supervisor 维护。
7. 先将 Canvas Board delivery 等非 Agent 使用者迁入 owning-domain ledger，再删除 TaskManager、TaskRef、task continuation、通用 task handler/storage/card/export 和 fallback。
8. 更新 TUI、VS Code 的 caller-owned projection、流式渲染和关闭生命周期。

迁移期间禁止 Tool + Task 双发、task/job 双写、新路径失败回退 TaskManager，或用兼容 adapter 让旧 TaskRef 继续成功。

## 验证要求

- deterministic：owner attach/transfer/cascade cancel/release、identity mismatch、迟到 progress、terminal state。
- Agent path：Pi `AbortSignal` 到 provider、Tool progress/result 同 item、TaskManager poison 未命中。
- 领域 Job：linked/detached cancel、以新 Tool Call 重新附着、provider reconciliation、原子产物提交。
- Host：Tab/Window close 取消前台 Agent/Tool，Subagent 按 owner policy 处理并可显式中断。
- Agent Evaluation：真实 TUI/Agent 路径证明没有 TaskRef、task continuation 或旧 TaskManager fallback。
- Webview：Extension Development Host 验证 Tool streaming/terminal phase、全局 Activity
  页面与协议不存在、关闭竞态和资源释放；普通浏览器不能替代。

已实现路径的确定性验证与剩余运行态验收记录在
[`introduce-domain-job-lifecycle-kernel`](../../openspec/changes/introduce-domain-job-lifecycle-kernel/)；
真实 Agent provider case 和 Extension Development Host Tool Timeline 尚未通过，因此不能
把单元测试或 key-free harness 描述为完整产品验收。

## 后果

### 正面

- Agent 内只有 Agent Run/Tool Call 一条执行路径，取消和流式状态不再分叉。
- 页面关闭、后台继续和显式中断可以从 owner graph 推导。
- Cut、Canvas、Generation 等领域保留正确事实 owner，不再被 Agent TaskManager 吞并。
- 恢复语义只出现在真正可恢复的领域 Job 上，不再承诺“恢复 Tool Call”。

### 代价

- 长 Tool Call 会占用当前 Agent turn 更久；UI 必须做好流式进度和中断。
- 需要明确区分普通 Tool、Subagent 和领域 Job，不能用一个 Task DTO 省略建模。
- 现有 TaskManager、TaskRef、continuation、TaskCard 和持久 task 数据需要一次破坏性迁移。
- provider 取消可能只能停止观察，远端 outcome-unknown 仍需领域 reconciliation。

## 被拒绝的替代方案

- **所有异步工作都保留为通用 Task：** 继续复制 Tool Call 生命周期并混淆领域 owner。
- **所有异步工作都强制为 Tool Call：** 无法表达 Cut export、Canvas direct job、跨进程恢复和 Subagent。
- **Tool 提前返回 taskId，但改名为 executionId：** 只是隐藏 Task，并未消除第二套生命周期。
- **Webview 管理任务存活：** 页面关闭即丢失事实，且违反 Host/领域 ownership。
- **Agent TaskManager 统一管理所有领域 Job：** Agent 会成为 provider、导出、素材和项目事实的错误 owner。
