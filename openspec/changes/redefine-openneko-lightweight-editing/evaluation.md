## Evaluation Scope

- Change/feature: Cut Webview 中的 Clip/Track “发送到 Agent”入口改为显式 `.otio` document/session/revision/Track/Clip 定位，并通过共享 `AgentContextPayload` 与 `neko.agent.sendContext` 交付只读上下文。
- Decision and owning suite: `create` 一个聚焦 Cut context-handoff case；现有 video-editing Skill suite 只验证剪辑方法，不拥有 VS Code Custom Editor 到 Agent context chip 的宿主路由。
- Why real Evaluation is required: 该变更新增跨扩展 Agent 上下文路由。确定性测试能证明 payload 投影和 Host 命令调用，但不能单独证明真实 Agent 面板收到可见 context attachment。
- Canonical path: Cut selection → revisioned Webview intent → Cut Extension 显式身份校验 → `AgentContextPayload` 投影 → `neko.agent.sendContext` → Agent context attachment。
- Forbidden fallback: `executeAIAction`、active/recent editor 推断、Webview 直接调用模型、可写 OTIO 快照、缺失或陈旧 selection 的 apparent success。

## Cases

- Positive: 在合成 `.otio` fixture 中选择一个 Clip，调用“发送到 Agent”，断言 attachment 包含精确 document URI、session、revision、Track/Clip、时间范围和媒体摘要。
- Boundary: 使用陈旧 revision、缺失 Clip 或跨文档 selection，断言 Cut fail-visible，Agent 不收到 attachment。
- Deterministic evidence: `cutAgentContext.test.ts` 验证 payload 与 no-fallback；`CutOtioController.test.ts` 验证 Webview 只提交显式 selection；Extension Development Host 场景负责验证真实 VS Code/Agent 面板交互。

## Missing Observability

- 当前 indexed TUI Evaluation 平台没有可驱动 VS Code Cut Custom Editor selection 与 Agent context-chip 的生产绑定。
- 不得为通过 Evaluation 添加 eval-only Cut Tool、直接调用 Agent turn runner、模拟 active editor 或直接注入 context chip。
- 在平台获得该生产绑定前，focused real case 记录为 infrastructure-blocked；key-free harness 仅证明 Evaluation 平台完整性，不作为该行为验收。

## Verification

- Key-free validation: `pnpm test:agent:eval` 通过（39 files / 281 tests；24 suites / 52 dry-run cases）。该结果只证明 harness/schema/dry-run 完整性。
- Real case: 尚不可执行；需要生产 VS Code Host 绑定或等价的外部 Evaluation controller。
- Runtime acceptance: 2026-07-23 在隔离 `neko-test` fixture workspace 的 Extension Development Host 中通过：
  - 刷新后的 Cut Webview 使用当前 bundle；工具栏为共享 SVG icon，项目、Clip、Track Inspector 和中文右键菜单可见。
  - minimap 的三个 Video Clip 分别投影为独立的 left/width 范围，而不是合并成整轨背景。
  - 通过真实菜单完成 Clip copy/paste，Clip 数从 3 增至 4；随后 Undo 恢复为 3。通过属性面板把同一 Clip 从 21.27s 缩短到 18s、再拉长到 20s，并 Undo 恢复到 21.27s。
  - `Cmd+S` 成功保存有效 OTIO，原生状态栏从 dirty 的 `*` 状态恢复为 clean；没有出现 `Cannot serialize an invalid OTIO document`。
  - Clip Inspector 的“发送到 Agent”触发 `injectContext`，消息携带精确 document URI、session、revision、Track/Clip ID、时间范围、源路径、速度和音频状态。
  - Agent Webview 显示 `720P.mp4` context chip 及“理解内容 / 生成替换素材”建议，证明真实跨扩展 handoff 命中。
  - Cut/Agent Webview 控制台仅观察到 VS Code 已知的 `local-network-access` 警告；没有 Cut context 解析或路由错误。

## Residual Risk

- Extension Development Host 已证明真实 Agent 面板端到端交付；自动化的 focused real Agent Evaluation 仍因 indexed TUI 平台缺少 VS Code Custom Editor 生产绑定而处于 infrastructure-blocked。
- Agent 收到上下文后的编辑建议质量不在本变更范围；本变更只负责结构化 handoff，不自动修改 Cut 文档。
