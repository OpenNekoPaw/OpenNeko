## Why

Electron Desktop 已采用 Pi 作为唯一 Agent loop、Tool execution、Skill disclosure 与 transcript
runtime，但生产包体、启动成本、provider license、CredentialStore/OAuth 和路径泄露边界仍未完成
最终验收。活动提案只应跟踪这个当前 Desktop gate，不再保存已退休 Host 的迁移记录。

## What Changes

- 固定 Electron Main 中唯一的 Pi conversation authority；renderer 只消费 sender-bound projection。
- 保持 Pi Session 为 transcript authority；将用户可迁移的 Conversation title/branch/export topology
  放入版本化 conversation manifest，将 lease/checkpoint/permission/Tool/Job、Resource identity 与
  可重建 UI projection 留在 OpenNeko product owners 和统一 `neko.db` namespace。
- 保持每 turn 的扁平 `purpose -> model + parameters` 快照、program-owned CredentialStore、显式
  permission 和 provider/model fail-visible 语义，禁止 legacy Agent/provider/session fallback。
- 完成 production Desktop Agent bundle/startup、license、secret/OAuth/cancellation 与 path-disclosure
  审计，记录不能在本机完成的 packaged target 风险。

## Capabilities

### New Capabilities

- `pi-agent-runtime`: Electron Desktop 中唯一的 Agent loop、Tool execution 与 event projection。
- `pi-skill-host`: Pi Skill disclosure 与 OpenNeko trust/locator 边界。
- `pi-session-authority`: Pi Session transcript 与 OpenNeko product metadata 的唯一职责分工。
- `agent-model-policy`: 每 turn 冻结的扁平 purpose/model 参数快照。

### Modified Capabilities

<!-- None. -->

## Impact

- `packages/agent/runtime` program-level conversation/Pi application authority；`apps/neko-desktop`
  只保留 Agent public-port composition、Main/preload/renderer Electron 生命周期与打包。
- Agent runtime、Pi provider/auth、Skill、Session、CredentialStore 和 Evaluation diagnostics。
- `govern-local-storage-authorities` 定义的 portable conversation、canonical SQLite 与 secret/log
  authority；本变更最终验收必须消费该唯一边界。
- 不保留 VS Code、TUI、旧 AgentSession/Executor、Platform chat 或旧 transcript 兼容路径。
