## Why

Electron Desktop 已组合 canonical Pi conversation runtime、Agent Root、application-level conversation/activity
summaries 和 sender-bound routes；剩余工作是补齐 deterministic Agent facts 与真实 Electron
conversation/Tool/Skill 生命周期验收。独立 Home composer、Home handoff 和 Home/Project layout 已由
`compose-desktop-workbench-scenes` 明确取代，不再属于本变更的成功路径。

## What Changes

- Desktop Main 使用一个 Agent message controller 和 exhaustive route classification。
- Pi conversation authority、Pi Session、catalog、CredentialStore、permission、Tool/Skill 与 Timeline
  projection 都由 Main 按显式 identity 组合。
- Renderer 只挂载 package-owned Agent Root，使用 fixed preload namespace，不拥有 transcript、secret、
  workspace IO 或 Job authority。
- Conversation restore 携带明确 scope/Workspace/Conversation identity，禁止 active
  conversation/workspace、demo/mock、legacy AgentSession 和 retired-host fallback；入口 draft、目录授权和
  Assistant scope 由 `compose-desktop-workbench-scenes` 拥有。
- 完成 focused facts、real-provider（适用时）与隔离 Electron scenario。

## Capabilities

### New Capabilities

- `desktop-agent-home-integration`: Desktop Agent runtime composition、route coverage、
  Conversation/Activity projection、恢复与 canonical-path 验收；产品 placement 由统一 Workbench scene
  capability 拥有。

### Modified Capabilities

<!-- None. -->

## Impact

- `apps/neko-desktop` Main/preload Agent composition 与 renderer adapter；不再拥有独立 Home Agent UI。
- Agent contracts/runtime/UI、Pi Session、CredentialStore 与 Evaluation harness。
- 不保留 VS Code/TUI product root 或第二套 Agent router/runtime。
