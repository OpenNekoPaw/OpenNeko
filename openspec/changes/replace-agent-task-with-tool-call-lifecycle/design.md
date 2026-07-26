## Context

Pi 已经拥有 Tool Call 调度、严格参数校验、事件、结果和 `AbortSignal`。OpenNeko 又在 Tool 外建立了通用 `Task`/`TaskManager`，让媒体 Tool 提交后快速返回 `TaskRef`，由第二套 runtime 保存 provider task identity、轮询进度、取消、恢复并把结果续投给 Agent。

这套拆分对“Agent 调用后仍要等待结果，Agent 中断时工作也应释放”的场景没有独立价值，却增加了两套状态机和两次结果交付。与此同时，Cut export、Canvas 直接生成和可恢复 provider job 的确可能需要独立于当前 Agent 存活。它们需要的是领域 Job，而不是 Agent 通用 Task。

## Goals / Non-Goals

**Goals:**

- 让 Agent 内普通异步工作只有一条 `AgentRun -> ToolCallExecution` canonical path。
- 让取消、页面关闭、后台存活和恢复都能由明确 owner 推导。
- 保留真实领域 Job/Session，但将其状态、恢复和结果归还 owning domain。
- 允许内容创作的长耗时 Tool 持续流式投影进度并返回终态结果。
- 删除 TaskManager、TaskRef、task continuation 和泛化 TaskCard 的长期必要性。

**Non-Goals:**

- 把所有领域 Job 改名后塞回 Agent。
- 在没有生产 producer 时预先实现 GenerationJob 或 application Agent supervisor。
- 建立云端调度器、通用工作流引擎或跨设备任务服务。
- 让 Webview 保存后台执行事实或通过 active tab 推断 owner。
- 声称本次文档变更已经完成 runtime 迁移。

## Decisions

### 1. Agent 内的执行单位是 Tool Call，不再是通用 Task

Agent 发起的一次能力调用使用：

```text
ForegroundAgentRun
  -> ToolCallExecution
       -> domain operation/provider adapter
       -> progress events
       -> terminal Tool result
```

`ToolCallExecution` 必须携带 `agentRunId`、`conversationId`、`turnId`、`toolCallId` 和 tool identity。它继承所属 Agent Run 的取消信号，并在成功、失败或取消后释放临时句柄。实现不得在 Tool 内创建一个语义相同的通用 Task，再用 `TaskRef` 提前结束 Tool Call。

耗时长本身不是拆出 Job 的理由。只要调用方仍需要最终结果、工作不应脱离 Agent 存活、且不要求跨进程恢复，Tool executor 就等待 provider 终态，并通过 Tool/Timeline 事件投影排队、提交、轮询、下载和物化进度。

### 2. Tool Call 不能恢复；领域 Job 可以由新 Tool Call 重新附着

Tool Call 是某次 Agent Run 中的一次调用。取消后该 `toolCallId` 进入 terminal state，不得复活或复用。

恢复语义只存在于具有稳定领域身份的 Job：

```text
ToolCall A -> submit GenerationJob(jobId) -> detached/disconnected
ToolCall B -> observe GenerationJob(jobId) -> terminal result
```

`ToolCall B` 是新调用。它通过领域 port 和稳定 `jobId` 观察或接管既有 Job；provider external id、idempotency、恢复校验和结果物化仍由 Generation domain 拥有。没有领域 Job 时，中断后的工作只能重新调用，并按 operation 的幂等契约决定是否允许重试。

必须区分：

- `cancel`：请求 owner 停止工作并进入 terminal cancelled；不能恢复同一执行。
- `detach`：观察者结束，但领域 Job 或 Subagent 按其 owner policy 继续；必须由显式 contract 创建，不能由页面丢失隐式触发。
- `recover/reattach`：进程或观察连接丢失后，以新 Tool Call/Host observer 连接稳定领域身份。

### 3. 后台继续运行使用 Agent Run，不使用 Task

Agent delegation 只创建 `SubagentRun`。独立 `BackgroundAgentRun` 没有不同于前台 Agent 或
Subagent 的稳定职责和生产入口，因此从目标模型删除。

Subagent 创建成功后，明确的 parent run 或未来 application supervisor 成为 live owner；原始
Tool Call 只保留 creator/provenance 关系。显式“中断 Subagent”调用精确 cancel operation。

spawn Tool Call 只负责创建和返回 child run identity，不应持续充当 child run 的生命周期容器。若 spawn 在 child identity 提交前被取消，则不得产生孤儿运行；提交后取消 spawn 不得伪装成 child 已取消。

### 4. 领域 Job/Session 由领域维护

以下条件任一成立时，执行应建模为 owning-domain Job/Session，而不是 Tool Call 内部状态：

- 可以由 Canvas、Cut、Assets 等 UI/command 在没有 Agent 的情况下直接创建；
- 关闭前台页面后仍应继续；
- 需要跨进程重启恢复、重新附着或 provider reconciliation；
- 有独立的排队、并发、重试、计费、产物提交或审计语义；
- 其结果会成为领域事实，且需要领域级原子提交。

示例：

| 场景 | Canonical owner |
| --- | --- |
| 读取文档、搜索、局部解析、受限感知 | 当前 `ToolCallExecution` |
| 仅 Agent 使用且随 Agent 取消的图片/视频生成 | 当前 `ToolCallExecution` |
| 需要跨页面/重启恢复的媒体生成 | Media/Generation `GenerationJob` |
| Canvas 直接 AI 按钮 | Canvas operation + Generation domain；不是隐式 Agent Task |
| Cut 导出 | Cut `ExportJobPort` / `ExportJob` |
| 批量素材导入且允许脱离页面继续 | Assets `ImportJob` |
| 角色/世界互动 | `CharacterRun` / `WorldRun`，内部复用 Agent Run 和 Tool Call |
| 委派研究、长篇创作协作 | `SubagentRun` |

领域 Job 可以被 Tool 创建、观察或取消，但 Tool 只是调用者。Agent transcript、TaskManager、Webview store 和通用 SQLite task table 都不是领域 Job 的事实源。

### 5. 底层统一的是 ownership 机制，不是业务状态机

Host-neutral `ExecutionOwnershipRegistry` 只维护运行时资源关系：

```ts
interface ExecutionOwnershipRegistry {
  attach(owner: ExecutionOwnerRef, child: CancellableExecutionRef): Disposable;
  transfer(child: ExecutionRef, nextOwner: ExecutionOwnerRef): void;
  cancelOwned(owner: ExecutionOwnerRef, reason: CancellationReason): Promise<void>;
  releaseOwned(owner: ExecutionOwnerRef): Promise<void>;
}
```

正式 contract 应保持同等最小语义，不预设这一示例的具体类型名。Registry 可以记录 owner/child identity、cancel handle、dispose handle 和短期 terminal observation；不得保存 prompt、provider task id、领域进度、ResourceRef、重试策略、结果或恢复 checkpoint。

各 owner 调用统一机制：

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

`transfer` 只用于显式 ownership handoff，例如 Subagent 创建成功后从 spawn 调用转移给其
committed owner。它不能把任意 Tool Call 静默转为后台工作。

### 6. 页面关闭按 owner 级联，而不是按 active selection 猜测

- 关闭 Tab/Webview：取消该 surface 创建且仍由它拥有的前台 Agent Run，以及 Run 下未终态 Tool Calls。
- 关闭 Window：取消该 window 的所有 surface-owned 前台运行。
- Quit：先取消 surface-owned 前台运行；Subagent 和 detached domain Job 按各自 shutdown
  policy 处理。需要跨进程恢复的 Job 必须先持久化稳定身份，不能仅靠内存 registry 继续。
- Subagent：按明确 parent/supervisor ownership 处理，不根据 active surface 猜测。
- Domain Job：按提交时明确的 linked/detached policy 处理；没有显式 detached contract 时默认 linked cancel。

所有 operation 和 event 必须携带精确 owner/instance identity。缺失、陈旧或不匹配时 fail-visible，不得回退到 active tab、active conversation 或最近 task。

### 7. UI 不再展示泛化 Task

UI 投影收敛为：

| 投影 | 含义 | 操作 |
| --- | --- | --- |
| Message Queue | 尚未执行的用户输入 | edit/cancel/promote message |
| Plan Progress | Agent 的计划/checklist | 展开、查看、更新计划 |
| Tool Execution | 当前/历史 Tool Call | approve/cancel/view result |
| Agent Activity | 前台 Agent Run、SubagentRun | open/interrupt |
| Caller-owned domain projection | Agent Tool Timeline、Canvas action、Cut editor/status | owning-domain cancel/retry/open result |

`TaskCard` 应替换为 `ToolExecutionCard`、`AgentRunCard` 或领域卡片；`AgentTaskQueue` 应改为 `PlanProgress`。不得提供一个不知道实际 owner 的 `cancelTask` 或 `retryTask`。
不得为了集中显示领域 Job 再建立跨领域 Activity authority、summary DTO 或 command router。

### 8. 流式输出以同一 Tool Call Timeline item 为权威

Tool Call 的状态、确认、进度、部分结构化观察、终态结果和错误全部锚定同一 `toolCallId` Timeline item。不得为进度建立第二条 assistant message、第二个 TaskCard 或 Webview-only stream。

进度事件必须有序、可丢弃陈旧版本，并在取消后拒绝迟到更新。高频 provider progress 可以节流为 UI projection，但 owning executor 必须保留明确的 terminal state 和 diagnostic。二进制产物不进入 event stream，只返回稳定 `ResourceRef`。

### 9. 迁移只有一个 canonical path

实施顺序：

1. 定义 `ToolCallExecution`、Agent Run supervisor、领域 Job ports 和 ownership registry 的最小 contract。
2. 让 media Tool 直接等待 media executor 终态并消费 Pi `AbortSignal`；加入同一 Timeline item 的 progress/result projection。
3. 当真实 provider 路径需要恢复/脱离时，通过独立 OpenSpec 建立 Media-owned `GenerationJob`，不复用通用 Task DTO/table。
4. 将 Canvas 直接动作接入同一 Generation domain port；保留 surface/domain owner，不绕行 Agent TaskManager。
5. 保留 Cut `ExportJobPort`，并让其他领域只在满足独立生命周期条件时定义具体 Job。
6. 当生产入口需要委派推理时，通过独立 OpenSpec 引入 SubagentRun producer/supervisor。
7. 先把 Canvas Board delivery 等非 Agent 使用者迁入 owning-domain ledger，再删除 TaskManager、TaskRef、task continuation、通用 task handlers/cards/storage 和 fallback；旧入口必须 poison 或 fail-visible。
8. 更新 TUI/VS Code/Desktop 投影和关闭生命周期，并完成真实运行态验收。

迁移期间不得双发 Tool Call + Task、双写 task/job storage，或在新路径失败时回退旧 TaskManager。

## Risks / Trade-offs

- **长 Tool Call 占用 Agent turn 更久**：这是调用者需要终态结果的真实语义；用流式 Tool
  progress、领域 Job 或显式 Subagent delegation 解决交互，而不是隐藏 Task。
- **部分 provider 天生异步**：adapter 可以在 Tool 内轮询；只有需要独立恢复/脱离时才提升为 GenerationJob。
- **领域 Job 类型增多**：它们拥有不同事实、恢复和原子提交语义，强行统一为 Task 会增加耦合；共享的仅是 ownership/cancellation primitive。
- **页面关闭和 spawn 存在竞态**：用 identity 提交点和显式 ownership transfer 测试，禁止“可能创建成功”的静默状态。
- **旧 task 数据处置**：项目处于预发布阶段，可删除通用 task runtime；已生成资源不得删除，领域可重建索引或提供明确 orphan diagnostic。

## Verification Strategy

- Deterministic contract tests：owner identity、attach/transfer、级联取消、迟到事件拒绝、Tool terminal state。
- Pi path tests：`AbortSignal` 到 provider、Tool progress/result 同 item、TaskManager poison 未命中。
- Domain tests：GenerationJob/ExportJob 的提交、观察、取消、恢复、原子产物提交和 owner 隔离。
- Host tests：Tab/Window close 取消前台 Tool；Subagent 按 owner policy 处理并可精确中断。
- Agent Evaluation：真实 TUI/Agent 路径证明 Tool 等到终态、取消不产生 Task continuation、旧 TaskRef/TaskManager 未参与。
- Webview runtime：Extension Development Host 验证 streaming、Tool card、Activity 和关闭竞态；普通浏览器不能替代。
