## Why

Electron Desktop 已使用 Workspace Board 作为 creator-visible Agent 结果的默认落点，但后台
delivery 恢复、真实 Electron 可见投影，以及 Canvas authoritative save 后的再次投递仍缺少
最终路径验收。

## What Changes

- 由 Desktop Main 组合唯一 typed artifact delivery contract；Agent core 只提交结果与 provenance。
- 未显式绑定普通 Canvas 的可审阅 artifact 投递到 `neko/boards/workspace.nkc`；显式 Canvas
  authoring 不镜像到 Workspace Board。
- LocalMetadata 只保存 delivery ledger/claim 状态，`.nkc` 始终是内容与布局权威。
- 使用稳定 delivery/projection identity、target-scoped fenced claim、当前 authoritative document
  校验和原子 save，禁止 active/recent Canvas 推断、last-write-wins 与 legacy handoff fallback。
- 完成恢复、可见关系图、用户布局保护、authoritative save 和后续 Generation delivery 的
  Electron Desktop 场景。

## Capabilities

### New Capabilities

- `workspace-board-artifact-delivery`: Desktop Agent artifact 的默认目标、ledger、幂等投影、
  single-writer、Canvas authority 与可见诊断。

### Modified Capabilities

<!-- None. -->

## Impact

- Desktop Main Agent/Canvas composition、LocalMetadata delivery ledger、Canvas `.nkc` writer。
- Agent typed result/provenance、Workspace Board renderer projection 与真实 Electron functional tests。
- 不保留 VS Code/TUI delivery adapter、active editor fallback 或 Extension-only writer。
