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
- 将 durable `ContentLocator` 和 transient representation handle 通过 owning content runtime 投影为
  绑定当前 Renderer 的短生命周期 `openneko://resource` URL，使 EPUB/CBZ 内部图片和文档派生页在
  Agent 卡片中显示真实像素；Workspace Board、durable transcript 与 `.nkc` 只保存 `ContentLocator`。
- 完成恢复、可见关系图、用户布局保护、authoritative save 和后续 Generation delivery 的
  Electron Desktop 场景。
- 当 canonical Workspace Board 已在 Canvas 中打开时，通过同一 Main-owned document mutation
  串行边界保护 clean/dirty session：clean session 在 delivery 原子提交后立即收到 authoritative
  projection，dirty session 在文件写入前返回可见冲突，禁止旧内存快照覆盖 Agent 产物。
- 修复 Canvas 异步 loading 后才挂载编辑器 Root 时的 keyboard focus ownership，并使工具栏、
  context menu 展示的快捷键与实际 dispatcher binding 使用同一行为集合。

## Capabilities

### New Capabilities

- `workspace-board-artifact-delivery`: Desktop Agent artifact 的默认目标、ledger、幂等投影、
  single-writer、Canvas authority 与可见诊断。

### Modified Capabilities

<!-- None. -->

## Impact

- Desktop Main Agent/Canvas composition、LocalMetadata delivery ledger、Canvas `.nkc` writer。
- Agent typed result/provenance、content display projection、Workspace Board renderer projection 与真实
  Electron functional tests。
- Canvas Webview keyboard/focus lifecycle 与 Desktop Main 活动 Canvas session coordination。
- 不保留 VS Code/TUI delivery adapter、active editor fallback 或 Extension-only writer。
