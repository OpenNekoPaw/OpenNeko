## Why

Electron Desktop 已组合 canonical Pi conversation runtime、Agent Root、Home summaries 和 sender-bound
routes；剩余工作是补齐 deterministic Agent facts 与真实 Electron conversation/Tool/Skill 生命周期验收。

## What Changes

- Desktop Main 使用一个 Agent message controller 和 exhaustive route classification。
- Pi conversation authority、Pi Session、catalog、CredentialStore、permission、Tool/Skill 与 Timeline
  projection 都由 Main 按显式 identity 组合。
- Renderer 只挂载 package-owned Agent Root，使用 fixed preload namespace，不拥有 transcript、secret、
  workspace IO 或 Job authority。
- Home handoff 携带明确 Project/Workspace/Conversation identity，禁止 active conversation/workspace、
  demo/mock、legacy AgentSession 和 retired-host fallback。
- 完成 focused facts、real-provider（适用时）与隔离 Electron scenario。

## Capabilities

### New Capabilities

- `desktop-agent-home-integration`: Desktop Agent composition、route coverage、Home/Conversation/Activity
  projection、恢复与 canonical-path 验收。

### Modified Capabilities

<!-- None. -->

## Impact

- `apps/neko-desktop` Main/preload/renderer Agent/Home composition。
- Agent contracts/runtime/UI、Pi Session、CredentialStore 与 Evaluation harness。
- 不保留 VS Code/TUI product root 或第二套 Agent router/runtime。
