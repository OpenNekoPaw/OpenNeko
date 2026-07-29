## Why

OpenNeko 已删除 Agent 通用 `TaskManager`，普通异步能力回到
`AgentRun -> ToolCallExecution -> terminal result`。但真正需要独立身份、跨页面或重启恢复、
精确查询/取消/重试和领域原子提交的工作，仍需要 `GenerationJob`、`ExportJob`、
`ImportJob`、`AnalysisJob` 等具体领域 Job。

当前媒体生成和 Cut 导出分别实现了 progress、polling、cancel 和结果处理，但没有统一的
revision、终态不可变、observer 重附着、identity mismatch 和 snapshot 权威语义。直接复制
这些机制会形成多个不一致的 Job runtime；建立能接收任意 payload/result 的中央
`GenericJobManager` 又会恢复刚删除的通用 Task 权威。

本变更提取一个最小、host-neutral 的 Domain Job lifecycle kernel，并以 Generation 与 Cut
两个真实 producer 验证公共边界。共享层只统一生命周期机械规则；submit、领域阶段、
provider/engine identity、reconciliation、retry policy、结果验证和原子提交继续由 owning
domain 负责。

## What Changes

- 在 `@neko/shared/job-lifecycle` 建立最小公共契约：typed `JobRef`、基础 phase、
  monotonically increasing revision、timestamps、failure summary 和 `retryOf`。
- 提供 versioned Job store port、严格 transition/CAS helper、终态不可变校验和测试用
  in-memory store；不提供通用 payload/result、通用数据库表或中央 dispatcher。
- 让每个领域建立自己的 Job Coordinator/Store/Provider 或 Engine adapter。公共 kernel
  由领域实例组合，不注册所有领域 handler。
- 为 Generation provider 将 submit、describe/subscribe 和 cancel 建模为显式 capability；
  不支持取消的 provider 不实现 cancel capability，不再使用静默 no-op。
- 让所有 Generation 执行与 Cut `ExportJob` 通过各自 public domain port 暴露
  submit、describe、observe、cancel、retry/reconcile 语义。
- Generation 的所有入口统一提交 `GenerationJob`。Agent linked Tool Call 订阅同一 Job 的
  versioned observation 并等待终态；detached Tool Call 返回稳定 JobRef。linked/detached 只
  定义调用关系和取消传播，不再选择第二条无 Job 的执行路径。
- Agent 仅通过 Tool Call 调用领域 port。一个仍在执行的 linked Tool Call 可以消费 Job 事件并
  更新同一 Timeline item；Tool Call 一旦返回，后续观察或命令必须使用新的 Tool Call。
- 调用方只保存自己的 `JobRef`、目标关联和展示投影：Agent 使用 Tool Timeline，Canvas 使用
  document/action 状态，Cut 使用 editor/status bar。调用方通过具体领域 port 查询、观察和命令
  Job，不建立跨领域 Activity authority 或常驻 Job 页面。
- Generation 持久化记录是恢复、provider reconciliation、revision/CAS 和结果提交所需的运行账本，
  不是用户可浏览的“生成历史”；生成产物与长期素材浏览继续由 `ResourceRef`、Canvas 和 Assets
  等 owning domain 负责。
- `FinishJob`、`FailedJob` 和 provider observation 只作为领域内部 transition/event，不作为
  Agent Tool 或 Webview command。
- **BREAKING**：禁止绕过 owning-domain Job coordinator 直接执行生成、中央
  `GenericJobManager`、泛化 `cancelTask/retryTask`、最近 Job fallback、共享
  `payload/result` JSON authority 和不支持能力的成功 no-op。

## Capabilities

### New Capabilities

- `domain-job-lifecycle-kernel`: 跨领域复用的最小 versioned lifecycle、observation 和
  ownership primitive，不拥有任何领域执行或结果。
- `generation-domain-job`: 可恢复媒体生成的领域 Job，拥有 provider reconciliation、产物验证
  和原子 `ResourceRef` 提交。

### Modified Capabilities

- `agent-tool-call-lifecycle`: Agent 通过 Tool Call 创建、描述、观察或命令领域 Job，但不成为
  Job 事实权威，也不恢复已终态 Tool Call。
- `cut-export-runtime`: Cut ExportJob 接入公共 lifecycle primitive，同时保留冻结输入 revision、
  Engine queue、frame progress、输出验证和提交所有权。

## Impact

- Shared: `packages/neko-types/src/job-lifecycle/` 与显式 package export。
- Generation: `packages/neko-generation/` 的 recoverable Job domain、
  provider capability 和持久 store adapter。
- Cut: `apps/neko-vscode/src/features/cut/services/ExportService.ts` 及其 host-neutral
  ExportJob coordinator/store 边界。
- Agent: 领域 Job Tool contribution、linked/detached Tool Call adapter、path facts 和
  no-direct-execution/no-Task fallback 验证。
- Extension/Webview: 删除跨领域 Activity attachment、聚合 Host 和常驻页面；Agent 仅保留
  conversation-scoped Tool Timeline 投影。
- TUI: 直接生成始终提交 GenerationJob，可选择等待终态或 detached 返回，并消费同一
  versioned snapshot。
- Evaluation: 更新 `agent-runtime.workflow-controller` 的 Job create/observe/cancel/retry
  路径证据；Webview 使用 Extension Development Host 验证。

本变更不建立云端调度器、跨设备 Job 服务、通用工作流 DSL 或所有异步工作的统一 Job。
