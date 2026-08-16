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

## Canonical path

Workspace Renderer composer selection -> initial/session submit canvasTurnTarget -> AgentControllerComposition.executeTurn required CanvasWorkspaceIndexService.resolveTurnContext -> immutable AgentTurnInput.canvasTurnContext -> terminal creator-visible artifact delivery -> DesktopWorkspaceBoardDelivery exact/Board target.

## Forbidden assertions

- 无 active/recent Canvas fallback。
- 无隐式 workspace。
- exact selection invalid 时不回退 Board。
- 无第二 bridge、无 Renderer 文件扫描、selection 不写入 binding/reference。
- 默认 Board catalog 读取或选择不创建 `workspace.nkc`。
- Workspace initial submit 不读取、配置或提交 Entry intent/receipt，不写 Entry snapshot。
- Board/exact Canvas 相关请求不先走 `ListDirectory` / `Read` 重新发现所选 `.nkc`，也不回退其他 Canvas；Board 缺失不创建、不伪装为空成功。

## Evidence

- Key-free harness：`pnpm test:agent:eval` 45 files / 310 tests 通过。
- all-suite dry-run：`node scripts/agent-eval/all-suite-dry-run.mjs` 27 suites / 80 cases 通过。
- 可见真实 Electron + Computer Use 已验证 Workspace/Canvas 索引在 composer 上方左侧连续排列，selector 透明、无白底和高亮描边、宽度跟随内容，可在 `Workspace Board` 与 exact Canvas 间切换，窄 Agent 面板无重叠或溢出。
- 真实 provider run 未授权：未提供显式 provider/model 与 cost authorization；`~/.neko/config.toml` 可读，但缺少运行授权，不得读取/打印 secret。

## Residual unverified

- 真实 Electron UI 仍未覆盖 invalid catalog diagnostic 状态。
- 真实 API：A/B Canvas 连续 Turn 的 turn context 与 artifact routing 精确落点。
- 真实 API：模糊但可由 selected Board/exact Canvas 回答的请求，首个内容发现操作命中该 Canvas query capability，而非通用目录扫描。

## Status

`infrastructure-blocked`
