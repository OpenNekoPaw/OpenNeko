## Why

Desktop Agent 已以 Pi Tool Call 取代通用 TaskManager，独立长生命周期工作由具体领域 Job 拥有。
剩余工作是验证 packaged Electron 中的 Tool streaming、cancellation、View/window lifecycle 和
caller-owned Job projection。

## What Changes

- 前台 Agent work 使用 ToolCallExecution 并继承 Pi AbortSignal。
- 只有真正可独立存活/恢复的工作使用 owning-domain Job；不建立通用 Task authority。
- explicit ownership registry 只管理 owner-child cancel/release，不保存业务结果或恢复状态。
- Desktop close/reload uses exact conversation/run/Tool/job identities and never active-object fallback。
- 完成 packaged Electron lifecycle/streaming scenario。

## Capabilities

### New Capabilities

- `agent-tool-call-lifecycle`: Tool Call、Agent Run、Subagent 与 owning-domain Job 的唯一生命周期边界。

### Modified Capabilities

- `pi-agent-runtime`: Agent-owned Tools 等到终态；独立领域 Job 返回稳定 job identity。

## Impact

- Desktop Agent Main/preload/renderer、Pi event projection、Generation/Cut Jobs 和 cancellation。
- 不保留 TUI/VS Code Task projection、TaskManager/TaskRef compatibility 或 cross-domain Activity owner。
