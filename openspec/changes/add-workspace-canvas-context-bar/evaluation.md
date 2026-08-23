# Agent Evaluation Disposition

## Decision

Update existing Agent Evaluation mappings:

- `agent-runtime.prompt-composition`
- `agent-runtime.creative-media-workflow`
- `agent-runtime.workflow-controller`

本次补充 Board/exact Canvas per-turn prompt routing，更新 `agent-runtime.prompt-composition` 的覆盖要求；
当前 Evaluation submit operation 不支持先选择 Canvas index，因此真实行为 case 保持
`infrastructure-blocked`，不能用不带 Canvas selection 的通用 prompt case 代替。

变更影响 Turn context 与 artifact routing，不得仅凭最终文本宣称真实行为通过。

Canvas catalog freshness 增量选择 `excluded`：它只在 Resource Browser 成功新增 `.nkc` 后使 Desktop Agent composer 重读已有 sender-bound configuration projection，不改变 Prompt、Tool/capability routing、provider/model 或 Turn admission。由 Main 发布条件、preload strict decode 与 Renderer consumer 确定性测试验证。原 Board/exact Canvas per-turn 路由继续 `reuse` 上述 suites 与既有 `infrastructure-blocked` 真实 provider 状态。

## Canonical path

Workspace Renderer composer selection -> initial/session submit canvasTurnTarget -> AgentControllerComposition.executeTurn required CanvasWorkspaceIndexService.resolveTurnContext -> immutable AgentTurnInput.canvasTurnContext -> terminal creator-visible artifact delivery -> DesktopWorkspaceBoardDelivery exact/Board target.

## Forbidden assertions

- 无 active/recent Canvas fallback。
- 无隐式 workspace。
- exact selection invalid 时不回退 Board。
- 无第二 bridge、无 Renderer 文件扫描、selection 不写入 binding/reference。
- 默认 Board catalog 读取或选择不创建 `workspace.nkc`。
- Workspace initial submit 不读取、配置或提交 Entry intent/receipt，不写 Entry snapshot。
- Canvas catalog 刷新不创建 Conversation、不提交 Turn，不把整个 catalog 注入 DSH Session/模型上下文。
- 在已有 Canvas 选项之间切换不重扫 Workspace；foreign Workspace invalidation 不刷新当前 Composer。
- Board/exact Canvas 相关请求不先走 `ListDirectory` / `Read` 重新发现所选 `.nkc`，也不回退其他 Canvas；Board 缺失不创建、不伪装为空成功。

## Evidence

- Canvas catalog freshness deterministic tests：Desktop Main publication、IPC sender projection、preload strict decode、Renderer matched/foreign Workspace 与 selection-no-query 覆盖通过；相邻 Desktop suite 共 `7` files / `138` tests 通过，Desktop typecheck、定向 ESLint、Webview boundary 与 strict OpenSpec 通过。
- 既有 per-turn target admission/prompt/artifact routing 回归：Desktop `2` files / `7` tests 与 Agent runtime `3` files / `18` tests 通过；该结果只证明确定性路由契约，仍不替代真实 provider 行为证据。
- 新增 `workspace-main-quick-creation` 可见 Desktop 断言：Canvas 创建后 Agent selector 必须出现 `Quick Board` 且仍选择 `Workspace Board`。本次执行未进入场景，因为 checkout 已有 Desktop process 持有唯一 Vite bundle owner；runner 报告为 CDP startup blocker，不得记为 UI 通过或功能失败。
- Key-free harness：`pnpm test:agent:eval` 45 files / 310 tests 通过。
- all-suite dry-run：`node scripts/agent-eval/all-suite-dry-run.mjs` 27 suites / 80 cases 通过。
- 可见真实 Electron + Computer Use 已验证 Workspace/Canvas 索引在 composer 上方左侧连续排列，selector 透明、无白底和高亮描边、宽度跟随内容，可在 `Workspace Board` 与 exact Canvas 间切换，窄 Agent 面板无重叠或溢出。
- 真实 provider run 未授权：未提供显式 provider/model 与 cost authorization；`~/.neko/config.toml` 可读，但缺少运行授权，不得读取/打印 secret。

## Residual unverified

- Canvas 新增后 selector 刷新的真实可见 Electron 场景尚未完成；需在当前 Vite bundle owner 释放后重跑 `workspace-main-quick-creation`。
- 真实 Electron UI 仍未覆盖 invalid catalog diagnostic 状态。
- 真实 API：A/B Canvas 连续 Turn 的 turn context 与 artifact routing 精确落点。
- 真实 API：模糊但可由 selected Board/exact Canvas 回答的请求，首个内容发现操作命中该 Canvas query capability，而非通用目录扫描。

## Status

`infrastructure-blocked`
