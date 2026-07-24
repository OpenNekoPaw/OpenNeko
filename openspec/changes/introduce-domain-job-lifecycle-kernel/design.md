## Context

现有 accepted ADR 已确定三类执行：

```text
Agent-owned linked work   -> ToolCallExecution
Delegated reasoning       -> SubagentRun
Independent domain work   -> GenerationJob / ExportJob / ...
```

`ExecutionOwnershipRegistry` 已统一 transient owner-child cancellation，但它不保存领域状态。
媒体 `MediaGenerationExecutor` 支持 `AbortSignal` 和 progress callback，却仍可被 Tool、direct
command 和领域 package 绕过 Job coordinator 直接调用，形成多条生成编排路径；provider adapter
大接口强制所有实现提供 status/cancel。Cut `ExportService` 已有 Engine jobId、
轮询和 UI progress，但使用 VS Code EventEmitter、进程内 Map、最近 Job fallback 和静默
no-op/null，不能作为公共 Job contract。

## Goals / Non-Goals

**Goals:**

- 只提取两个以上真实领域共享的 lifecycle、revision、observation 和 ownership 机械能力。
- 保持 Job snapshot 为事实权威，事件只作为 commit 后通知。
- 让 Agent、direct command 和领域 package 通过同一个领域 port 创建和管理 Job。
- 让 Webview 只消费 versioned Activity projection，不拥有后台生命周期。
- 让 identity mismatch、stale revision、非法 transition 和缺失 capability fail-visible。
- 用 Generation 与 Cut 两个不同执行后端证明共享抽象没有吞并领域语义。

**Non-Goals:**

- 将普通非生成 Tool Call、Subagent、计划步骤或用户消息建模为 Job。
- 建立中央 `GenericJobManager`、通用 payload/result codec 或跨领域 retry policy。
- 在第一阶段把所有 provider、导入、分析和 processor 路径迁入 Job。
- 让 Webview 直接订阅 provider、Engine、SQLite 或领域 EventEmitter。
- 自动重试付费或 outcome-unknown 的外部请求。

## Five-layer analysis

| Layer          | Decision                                                                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Shared kernel owns lifecycle mechanics; each domain owns commands, detailed state, external identity, reconciliation and atomic result commit; Host owns Activity projection and command routing.                 |
| Dependency     | Domain coordinators depend on `@neko/shared/job-lifecycle`; shared never imports Agent, Platform, Cut, VS Code, React, provider SDK or Engine client. Webview depends only on projection contracts.               |
| Interface      | Shared exposes narrow typed refs/snapshots/store/transition helpers. Each domain exposes its own port. Agent Tools and UI commands adapt to domain ports instead of a generic manager.                            |
| Extension      | New domains reuse the kernel only after they have a concrete managed lifecycle. Provider push/poll/cancel are capability ports; read-only Activity sources can be aggregated without registering executors.      |
| Testing        | Kernel transition/CAS tests, per-domain path tests, provider capability tests, Host projection tests, no-Task/no-generic-manager poison, real Agent Evaluation and Extension Development Host Webview acceptance. |

## Decisions

### 1. Shared package shape

The initial public entry is:

```text
@neko/shared/job-lifecycle
  contracts
  transition
  in-memory-store (test/runtime-neutral reference)
```

It remains in `@neko/shared` while the implementation is small and has no runtime dependency. A separate
`@neko/job-runtime` package is allowed only when at least two production coordinators need substantial
shared scheduling or persistence code that would make `@neko/shared` an implementation bag.

The shared base contains no `payload`, `result`, provider id, output path, prompt, artifact or checkpoint.
Concrete snapshots extend it with typed domain fields.

### 2. Lifecycle contract

```ts
type JobPhase = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'outcome-unknown';

interface JobRef<K extends string> {
  readonly kind: K;
  readonly jobId: string;
}

interface JobSnapshotBase<K extends string> {
  readonly ref: JobRef<K>;
  readonly phase: JobPhase;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly retryOf?: JobRef<K>;
  readonly failure?: JobFailureSummary;
}
```

`succeeded`、`failed` 和 `cancelled` 是 immutable terminal phase。
`outcome-unknown` 表示外部请求可能已经提交但本地无法判断结果，它只能由 owning-domain
reconciliation 转到 `running` 或 terminal phase。它不能触发共享层自动 retry。

Job retry 总是创建新 `jobId` 并记录 `retryOf`；旧 Job snapshot 不复活。

### 3. Store and observation

每个领域定义自己的 snapshot 和持久 schema，并实现：

```ts
interface VersionedJobStore<S extends JobSnapshotBase<string>> {
  create(initial: S): Promise<S>;
  get(ref: S['ref']): Promise<S>;
  commit(input: { ref: S['ref']; expectedRevision: number; next: S }): Promise<S>;
  observe(ref: S['ref'], afterRevision: number): AsyncIterable<S>;
}
```

公共 helper 校验 ref、revision、timestamps、phase transition、terminal immutability 和
`retryOf` identity。事件只能在 commit 成功后发布。首次显示和重连使用 `get`，运行中使用
`observe(afterRevision)`；revision gap 或 stale command fail-visible，并通过重新获取 snapshot
恢复，不回退 Webview 本地状态。

共享层可以提供测试用 in-memory store，但不提供所有领域共享的 JSON row/table。生产 store
由领域拥有 codec、migration、cleanup 和 recoverable scan。

Production persistence uses the existing user-global LocalMetadata database because recoverable Job
state is valuable local state, not a project fact or rebuildable cache. LocalMetadata exposes only a
transaction-scoped SQL statement executor (`run`/`all`) to domain adapters. Generation owns its
`generation-jobs` migration namespace, strict snapshot codec, workspace partition, CAS statements and
recoverable scan in `@neko/generation`; LocalMetadata MUST NOT add `DomainJobRecord`, generic
`payload_json/result_json`, kind dispatch or a Generation snapshot type.

The statement executor is available only inside `LocalMetadataStore.transaction`, so Node and Bun retain
the same connection, locking, backup and transaction semantics. Domain code cannot close, back up or
replace the connection. A domain migration continues to use `migrateNamespace`, including checksum and
backup policy.

### 4. Per-domain coordinator, not a central manager

```text
GenerationJobCoordinator
  submitGeneration
  describeGeneration
  observeGeneration
  cancelGeneration
  retryGeneration -> new GenerationJob
  reconcileGeneration

ExportJobCoordinator
  submitExport
  describeExport
  observeExport
  cancelExport
  retryExport -> new ExportJob
  reconcileExport
```

Coordinator 是领域内唯一 command/state transition owner。应用 composition 可以持有并 dispose
多个 coordinator，但不得通过 `kind -> handler` registry 提供泛化业务执行。

跨领域 Activity 使用只读 `DomainActivitySource`，只暴露 summary snapshot/observe/open target；
它不暴露 submit/cancel/retry handler，也不持有领域 snapshot。

### 5. Provider and Engine adapters

Generation provider 使用 capability composition，而不是一个强制大接口：

```text
GenerationSubmitter
GenerationDescriber
GenerationSubscriber (optional)
GenerationCanceller (optional)
```

当前 provider 审计没有发现真实 SSE/WS Job observation producer，因此第一阶段只提取已有的
image/video/audio submit、describe 和 cancel capability，不建立空 `GenerationSubscriber`
接口。后续 provider 确实提供 push observation 时，再以其真实协议补充该 capability。

支持 SSE/WS 的 adapter 优先 subscriber；否则 coordinator 调用 describer polling。无论采用
push 还是 polling，observation 都必须先经过 Generation transition/reconciliation 并提交
GenerationJobStore，随后才发送本地事件。

不支持 cancel 时不注册 `GenerationCanceller`。取消命令返回明确
`generation-cancel-unsupported` diagnostic；禁止成功 no-op。

Cut Engine adapter 保持自己的 enqueue/progress/cancel protocol，不伪装成 Generation
provider。公共交集到 versioned Job lifecycle 为止。

### 6. Agent Tool Call and direct-domain boundary

Linked media Tool:

```text
AgentRun -> ToolCallExecution -> GenerationJobCoordinator.submit
                              -> observe revisions
                              -> terminal Tool result
```

Detached Job:

```text
ToolCall A -> GenerationJobCoordinator.submit -> stable jobId
ToolCall B -> describe/observe/cancel/retry(jobId)
```

Generation 的 Agent、TUI、Canvas、Cut 或 Character 入口都只调用领域 port，不直接调用
`GenerationExecutionPort` 或 provider。linked/detached 只决定调用方是否等待和取消传播，
不决定是否创建 Job。Tool Call 一旦返回，后续 observation/command 必须使用新的 Tool Call；
同一个 `toolCallId` 不得恢复。`FinishJob`/`FailedJob` 不是 Tool。

`observe(ref, afterRevision)` 是调用方唯一持续反馈接口。它先加载权威 snapshot，再通过 commit
后的事件推送后续 revision。provider 有 push 能力时由 adapter 驱动 transition；只有 status
query 时由 coordinator 内部轮询。调用方不得轮询 provider 或合成 progress。

领域 package 通过 Host 注入的 purpose-bound Generation application port 直接提交 Job。Host
解析 immutable effective provider/model binding；领域只拥有 target/revision/idempotency 与
JobRef 的关联及 candidate/apply，不通过 Agent chat 或 Agent Extension media service 转发。

Agent Evaluation disposition:

- `update`: `agent-runtime.workflow-controller`;
- canonical path: canonical TUI input -> Pi Tool Call -> domain Job Tool adapter ->
  owning coordinator -> versioned store -> Tool result/observation;
- forbidden fallback: generic TaskManager/TaskRef/task continuation、直接读写 JobStore、
  Webview command 代替 Tool、调用方绕过 Job coordinator 直接执行生成、领域媒体经 Agent 转发；
- deterministic evidence: Tool invokes exact domain port, revision and identity checks, legacy poison;
- real evidence: configured media provider case proves stable job identity, progress observation,
  terminal `ResourceRef` and no generic Task path.

### 7. Webview projection

Linked Tool progress remains in the existing conversation Timeline Tool item.

Independent Job activity uses a separate Host-owned attachment:

```text
Domain Job stores
  -> DomainActivityProjector
  -> immutable snapshot + acknowledged ordered patches
  -> Webview DomainActivity replica
```

Activity summary carries concrete `jobKind`, `jobId`, phase, revision, label, progress summary and
stable result refs. It does not copy provider external id, prompt, output path, credentials or detailed
domain snapshot.

Webview sends an exact command intent:

```ts
{
  type: 'domainJob.command',
  jobKind: 'generation',
  jobId: '...',
  expectedRevision: 12,
  command: 'cancel'
}
```

Extension routes explicit supported combinations to the owning port. Unknown kind/command, stale
revision and unsupported operation fail visibly. No active/latest Job fallback is allowed.

### 8. Ownership and shutdown

Linked Job is attached to its caller owner and cascades cancellation. Detached/recoverable Job transfers
to the owning domain supervisor before submit returns. Closing a Webview only releases its observer;
it does not cancel a detached Job. Application shutdown asks each domain coordinator to persist/reconcile
according to its own policy.

The existing execution ownership primitive can move to a neutral package only after Generation or Cut
actually consumes it across the package boundary. This change does not add a compatibility re-export from
the Agent package.

### 9. Generation restart recovery

Generation startup performs one exact recoverable scan for its workspace and transfers each recovered Job
to the Generation coordinator before presentation or Agent tools can observe it:

- `pending` has not crossed the submitting transition and can resume the original frozen request once.
- `running` or `outcome-unknown` with a persisted provider task identity is reconciled through the exact
  provider adapter and continues provider polling until terminal state or shutdown.
- `running` without provider task identity becomes `outcome-unknown`; it is never resubmitted because the
  paid provider request may already have been accepted.
- `outcome-unknown` without provider task identity remains unchanged and requires explicit user action.
- terminal Jobs are excluded from the recoverable scan and remain immutable.

Recovery is idempotent within one coordinator: an already supervised `jobId` cannot acquire a second
loop. Coordinator disposal aborts local observers and polling but does not rewrite a detached Job as
cancelled. A later Host instance resumes from the persisted snapshot.

## Risks / Trade-offs

- [Kernel becomes another TaskManager] -> shared API has no submit/dispatch/payload/result/retry policy;
  architecture tests reject a central handler registry and generic manager exports.
- [Common phase hides domain state] -> domain snapshots keep typed stage/progress; common phase only
  supports Activity and invariant checks.
- [One shared table couples migrations] -> each domain owns persistence schema and recoverable scan.
- [Retry duplicates paid work] -> outcome-unknown never auto-retries; retry is domain command creating
  a new Job with provenance.
- [Push events are lost] -> snapshot is authoritative; restart and reconnect always call reconciliation/get.
- [Cut and Generation semantics diverge] -> extraction stops at lifecycle mechanics; neither domain imports
  the other's coordinator or adapter.
- [Webview duplicates Timeline] -> linked Tool stays only in Timeline; Activity contains independent Job
  summaries and stable result refs, not active Tool state.

## Migration Plan

1. Add the shared lifecycle contract, transition helper and deterministic tests.
2. Add Generation provider capability interfaces and remove silent cancel no-op from the migrated provider set.
3. Make GenerationJob coordinator/store the only generation execution path and remove linked direct execution.
4. Extract Cut's host-neutral ExportJob coordinator and replace latest-job/no-op behavior with exact identity.
5. Add read-only Domain Activity projection and exact Extension command routing.
6. Add concrete Webview cards/commands; retain linked progress in ToolExecutionCard.
7. Add Agent Tools and direct-domain adapters over the same concrete Job ports.
8. Poison generic manager/task aliases and complete deterministic, Agent and Webview runtime verification.

Migration is vertical by concrete Job kind. A stage cannot claim completion while its old path can still
return success for migrated requests.
