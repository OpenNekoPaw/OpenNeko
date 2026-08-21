## Context

DSH `standard` preset 已安装官方 `dsh-token-meter`、自动 compaction 与 Tool result pruner。`contextPressure.projectedTokens` 是 provider usage 锚点加当前 surface 变化后的下一请求估值，`contextWindow` 来自最近 route；OpenNeko 不应从 transcript 重算这些值，也不应重复启用 compaction。

## Goals / Non-Goals

**Goals:**

- 传递 DSH 权威 `contextPressure` whole value。
- 保持 exact Session identity、单一 projection owner 和 fail-local decode。
- 复用现有 composer UI。

**Non-Goals:**

- 不实现 token estimator、手动压缩命令或第二套 compaction。
- 不把 usage 当作计费事实或执行门禁。
- 不修改 Agent Webview 布局和视觉结构。

## Decisions

### 1. DSH bridge 读取 projection，不重算 pressure

Owner 是 DSH `dsh-token-meter`。`@neko/dsh-bridge` 作为 runtime adapter，在 durable Session event 已提交并由 projection registry 同步 fold 后读取 exact Session snapshot；当 `contextPressure` 存在时，发送 `openneko/session/context-pressure` whole-value notification。该通知携带 exact `sessionId`、产生本次 snapshot 的 `sourceSequence` 和完整 pressure value。

`packages/dsh-bridge` 仅做 carrier 和结构化边界，不拥有 pressure 算法。缺少 optional `contextPressure` key 时不伪造 `0`，Host 继续投影会话的其他内容。

### 2. Agent runtime 拥有 Host 侧会话 read model

`@neko/agent-runtime` 按 exact `sessionId` 接收单调不旧于当前 pressure 的 whole value，并保存到现有 `DshAcpProjection`。非法字段或 stale notification 返回局部 diagnostic；不得清空 transcript、工具或 sibling Session。

Desktop Main 只把 runtime snapshot 转成 sender-bound `DshSessionHostProjection`。producer 是 DSH bridge，consumer 是当前 Agent Webview；canonical path 是 DSH projection registry → ACP extension → Agent runtime projection → Desktop Session Host → Webview。

### 3. UI 只读取 projected pressure

现有 `UsageIndicator` 的 `contextTokenCount` 使用 `projectedTokens ?? pressureTokens ?? 0`，`maxContextTokens` 使用 `contextWindow`。这保留 DSH 对 compaction 后 surface 缩减的表达，也保留 provider 尚未报告 usage 时的 unknown/zero 初始状态。UI 不声明手动压缩能力。

## Runtime Boundary and User Data

- DSH projection 是可重建只读数据，不写回 Session 或业务事实。
- ACP notification 是第三方 runtime 到 Desktop Host 的 typed boundary。
- 不迁移、不删除、不覆盖用户会话、图片、transcript 或配置。
- 被替代路径只有 Webview 中写死的 `contextTokenCount={0}`。
