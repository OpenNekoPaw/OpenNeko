## Evaluation Scope

- Change/feature: Cut Webview 中的 Clip/Track “发送到 Agent”入口使用显式 `.otio`
  document/session/revision/Track/Clip 定位，并通过共享 `AgentContextPayload` 与 Desktop
  Agent input queue 交付只读上下文。
- Decision and owning suite: 创建聚焦 Cut context-handoff case；现有 video-editing Skill
  suite 只验证剪辑方法，不拥有 Desktop Cut 到 Agent context chip 的宿主路由。
- Why real Evaluation is required: 确定性测试能证明 payload 投影和 Desktop host port
  调用，但不能单独证明完整 Desktop Agent session 收到可见 context attachment。
- Canonical path: Cut selection → revisioned Webview intent → Desktop Main 显式身份校验 →
  `AgentContextPayload` 投影 → Desktop Agent input queue → Agent context attachment。
- Forbidden fallback: `executeAIAction`、active/recent view 推断、Webview 直接调用模型、可写
  OTIO 快照、直接 turn runner、headless assembly、mock provider，以及缺失或陈旧 selection
  的 apparent success。

## Cases

- Positive: 在合成 `.otio` fixture 中选择一个 Clip，调用“发送到 Agent”，断言 attachment
  包含精确 document URI、session、revision、Track/Clip、时间范围和媒体摘要。
- Boundary: 使用陈旧 revision、缺失 Clip 或跨文档 selection，断言 Cut fail-visible，
  Agent 不收到 attachment。
- Deterministic evidence: owning Cut producer/consumer tests验证 payload、typed Desktop port
  和 no-fallback；Webview controller tests 验证只提交显式 selection。

## Missing Observability

- Desktop 当前没有 complete-session evaluation driver，可测试地驱动 Cut selection、
  context handoff 和真实 Agent session。
- 不得为通过 Evaluation 添加 eval-only Cut Tool、直接调用 Agent turn runner、模拟 active
  view 或直接注入 context chip。
- 在 Desktop 暴露生产 complete-session driver 前，focused real case 必须返回
  `infrastructure-blocked`/exit 2；key-free harness 仅证明 Evaluation 平台完整性。

## Verification

- Key-free validation: `pnpm test:agent:eval` 通过（35 files / 234 tests；22 suites /
  50 dry-run cases）。该结果只证明 harness/schema/dry-run 完整性。
- Real case: `scripts/agent-eval/local-run.mjs` 在凭据与本地配置 preflight 通过后返回
  `infrastructure-blocked`/exit 2；未调用 provider。
- Historical evidence: 2026-07-23 的 VS Code Extension Development Host 场景曾证明迁移前
  Cut/Agent handoff。该记录不是当前 Desktop 运行态验收，也不构成现行实现或发布要求。

## Residual Risk

- 自动化 focused real Agent Evaluation 仍因 Desktop complete-session driver 缺失而阻塞。
- Agent 收到上下文后的编辑建议质量不在本变更范围；本变更只负责结构化 handoff，不自动
  修改 Cut 文档。
