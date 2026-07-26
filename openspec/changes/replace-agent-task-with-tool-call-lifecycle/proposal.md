## Why

当前 Agent 路径同时存在 Pi Tool Call、通用 `Task`/`TaskManager`、media task、run/workItem 和 subagent 等多套执行身份。长媒体工具会快速返回 `TaskRef`，再由 TaskManager 观察、恢复并触发 continuation。这样一个由 Agent 发起、调用方仍需等待结果、且应随 Agent 中断释放的操作，被人为拆成 Tool Call 和 Task 两个生命周期，造成取消、进度、卡片、恢复和 owner 重复。

通用 Task 也混淆了两类本质不同的工作：一类只是 Agent Run 内的一次工具执行；另一类是 Cut 导出、可恢复媒体生成等具有独立产品语义、可被 UI 直接创建或需要跨进程恢复的领域 Job。前者应由 Agent Run 直接拥有，后者应由具体领域拥有，不应由 Agent TaskManager 统一接管。

## What Changes

- **BREAKING**：移除通用 Agent `Task`/`TaskManager` 作为 Agent 工具执行的 canonical path。
- Agent 发起且不需要独立存活的工作统一建模为 `ToolCallExecution`；Tool Call 等到终态，继承 Pi `AbortSignal`，并随所属 Agent Run 取消和释放。
- 长耗时不再自动等于后台 Task。只要工作不需要脱离 Agent、重启恢复或直接 UI 控制，Tool Call 可以在内部轮询 provider，持续投影进度并最终返回 `ResourceRef`、结构化结果或明确 diagnostic。
- Agent delegation 只保留前台 `AgentRun` 与显式 `SubagentRun`，不用 Task 伪装。独立
  `BackgroundAgentRun` 没有生产 producer，必须从目标契约、投影和 UI 中删除；Subagent 的真实
  producer 仍需通过独立 OpenSpec 引入 owner、provenance 和精确中断。
- 需要跨 Agent、跨页面或跨进程独立存活、恢复或直接 UI 操作的执行，必须由 owning domain 通过独立变更定义具体 Job/Session。当前没有 detached/recoverable media producer，因此本变更不创建推测性的 `GenerationJob`；既有 Cut `ExportJob` 继续由 Cut 拥有。
- 引入最小、host-neutral 的 `ExecutionOwnershipRegistry` 管理临时 owner-child 关系、级联取消和释放；它不保存领域进度、结果、恢复状态或 provider identity。
- Tool Call 被取消后不能恢复同一个 `toolCallId`。若底层领域 Job 支持恢复，新 Agent Run 必须通过新的 Tool Call 和稳定 `jobId` 重新观察或接管。
- 将 UI 中泛化的 Task 名称收敛为 Plan Progress、Tool Execution、前台 Agent/Subagent 和
  caller-owned domain projection；操作必须指向精确 owner，不建立跨领域 Activity 页面。
- 明确页面关闭策略：Tab/Window/Webview 创建的前台 Agent Run 及其 Tool Calls 被取消；
  Subagent 与领域 detached Job 按各自 owner policy 继续或取消，直到完成或被精确中断。

## Capabilities

### New Capabilities

- `agent-tool-call-lifecycle`: 定义 Tool Call、前台 Agent Run、Subagent、领域 Job 和统一临时 ownership registry 的唯一生命周期边界。

### Modified Capabilities

- `pi-agent-runtime`: 长媒体工具不再默认快速返回 `TaskRef`；默认 Tool Call 等待终态，只有明确的领域 Job 才返回稳定 `jobId` 并保持领域所有权。

## Impact

- Agent runtime：`packages/neko-agent/packages/agent` 的 Tool bridge、Pi event projection、取消和 subagent/background-agent supervision。
- Agent platform：媒体 Tool、media executor、TaskManager、TaskRef、continuation 和恢复路径。
- Hosts/UI：TUI、VS Code、拟议 Desktop 的页面关闭、caller-owned Job、Tool/Agent Run 投影和显式中断操作。
- 创作领域：Canvas 直接 AI 动作、Cut `ExportJobPort`、Assets import/index 以及未来 Character/World run。
- 共享契约：删除泛化 Task 身份，新增精确 ToolCall/AgentRun/DomainJob owner identity；不把领域 Job DTO 提升为一个新的通用 Task DTO。
- 用户数据：现有预发布 Task 记录不迁移为新通用格式；实施变更必须明确删除、忽略或由具体领域重建，且不得静默损坏已生成资源。
- 验证：需要 deterministic path/cancellation tests、真实 Agent Evaluation 和宿主运行态验证，证明旧 TaskManager 未参与新路径。
