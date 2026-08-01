# ADR: Tool Call、Subagent 与领域 Job 生命周期边界

状态：Accepted

更新日期：2026-08-01

范围：Agent、Pi Tool bridge、Generation、Canvas/Cut/Assets、Electron Desktop、Subagent、页面关闭与恢复。

## 决策

OpenNeko 只保留三类执行身份：

| 身份 | Owner | 生命周期 |
| --- | --- | --- |
| Tool Call | 当前 Agent Run/Pi | Agent-owned，同 turn 等待结果或取消 |
| SubagentRun | 明确 parent/supervisor | 委派推理，结构化回传，不拥有领域项目事实 |
| Domain Job | Generation、Cut 等 owning domain | 可跨 turn、页面或重启恢复，独立查询/取消/重试 |

不存在通用 Agent TaskManager、BackgroundAgentRun 或跨领域 Job store。Tool Call 的 progress/result
进入同一 Agent Timeline；领域 Job 的 snapshot、checkpoint、provider/executor identity、reconcile、
retry 和结果提交由领域 repository 持有。

## 所有权规则

- Agent-owned 操作在 Tool Call 内完成，并连接 Pi `AbortSignal`；
- 只有具有独立业务 identity、持久事实和恢复需求的执行才创建 Domain Job；
- Tool 可以提交/观察 Job，但只保存 `JobRef` 与已观察 revision，不复制 Job 状态机；
- Renderer 只显示 Tool/Subagent/Job projection，关闭 card 或页面不等于取消；
- linked/detached 是调用策略，不改变 Domain Job owner；
- 终态 immutable，retry 创建明确 attempt/revision，不改写既有结果。

每个 instance-scoped command/event 携带 conversation、run、tool/job、owner 和 revision identity。
缺失、陈旧或不匹配时失败，不回退到 active/latest instance。

## Job 共享内核

共享 job-lifecycle 只提供 identity、phase、revision/CAS、终态不可变和 versioned observation。
它不定义通用 payload/result 表、provider registry、retry policy 或中央 Activity repository。
各领域通过自己的 application port 暴露 submit/describe/observe/cancel/retry。

## 验证

- Tool Call 取消、progress、terminal result 与 Timeline projection；
- Subagent parent/child identity、structured return 与 parent cancellation；
- Domain Job persistence、reconcile、retry、CAS、terminal immutability 和 atomic result commit；
- 页面关闭、renderer reload、应用重启与多窗口订阅；
- 路径测试证明 Tool、Subagent 与具体领域 Job owner 被准确命中。

相关决策见 [`adr-pi-agent-runtime.md`](adr-pi-agent-runtime.md)、
[`adr-agent-creative-invocation-run-boundary.md`](adr-agent-creative-invocation-run-boundary.md) 和
[`package-boundaries.md`](package-boundaries.md)。
