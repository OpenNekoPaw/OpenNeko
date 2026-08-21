## Why

OpenNeko 的 DSH 会话已经由官方 `dsh-token-meter` 计算 `contextPressure`，但 ACP Host 会话投影没有传递该 read model，现有 Agent composer 因而始终以 `0` 渲染上下文用量。大量图片或长文档进入同一会话时，用户无法判断当前请求距离模型上下文上限还有多远。

## What Changes

- 从 DSH `sessionProjections` 的权威 `contextPressure` whole value 发布专用 ACP extension notification。
- 在 `@neko/agent-runtime` 的 exact DSH Session projection 中保存最新压力值，并通过 Desktop sender-bound 会话快照投影给 Renderer。
- 让现有 OpenNeko `UsageIndicator` 消费 `projectedTokens`、`pressureTokens` 与 `contextWindow`；不替换组件、不增加第二套压缩状态。
- 对非法 pressure payload 只拒绝当前 notification，并保持 sibling 会话与能力可用。

## Capabilities

### New Capabilities

- `dsh-context-pressure-projection`: 定义 DSH 权威上下文压力到现有 OpenNeko composer 用量展示的唯一投影路径。

### Modified Capabilities

无。

## Impact

- `packages/dsh-bridge`：DSH projection service 到 ACP 的 runtime boundary carrier。
- `packages/agent/contracts`：ACP extension 与 Desktop Session projection 的 canonical contract。
- `packages/agent/runtime`：exact DSH Session 的可重建 pressure read model。
- `apps/neko-desktop`：Electron Main sender-bound projection wiring；不拥有压力计算规则。
- `packages/agent/webview`：复用现有 `UsageIndicator` 的只读 consumer。
