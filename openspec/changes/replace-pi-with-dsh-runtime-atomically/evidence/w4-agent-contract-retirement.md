# W4 Agent Contract Retirement

本轮完成旧 Agent execution/transcript projection 子边界的原子删除：

- 删除旧 `ConversationProjection*`、`AgentTurnTimeline*`、`ConversationRunRegistry`、通用
  `ExecutionOwnershipRegistry` 与 creator-visible turn projection delivery；同步删除 Desktop
  Workspace Board 自动投递 wiring，避免从旧 Agent turn 事实产生第二 Canvas 成功路径。
- 删除 `@neko/agent-runtime` 对上述模块的 public exports/subpaths；retired source、empty
  projection directory 和 Desktop delivery entry 均由 boundary poison 保护，恢复任意文件会 fail。
- Agent Home activity contract 改为 DSH 派生的 `dshSessionId` + 数值 `turn`，Tool confirmation
  额外要求 exact `toolCallId`。旧 `turnId`/`runId`、nullable identity、普通 catalog activity 携带
  execution identity 均被 exact-key/semantic validator 拒绝。
- Evaluation change selector 改为 ACP/application owner：`dsh-acp-projection`、
  `dsh-session-host`、`generation-host-adapter` 和 `dsh-acp-application-client`；退休 projection
  不再被选为 canonical path。

## Verification

- `pnpm --dir packages/agent/contracts run typecheck`
- `pnpm --dir packages/agent/runtime run typecheck`
- `pnpm --dir apps/neko-desktop run typecheck`
- Agent contracts focused tests: 40 files / 204 tests passed
- Agent runtime focused tests: 2 files / 47 tests passed; full package suite remained green at 41 files / 340 tests
- Host shell focused tests: 3 files / 82 tests passed
- Generation architecture boundary: 4 tests passed
- `node --test scripts/check-neko-agent-boundaries.test.mjs`
- `pnpm check:agent-boundaries`
- `pnpm exec vitest run scripts/agent-eval/authoring/change-selector.test.mjs`

## Remaining boundary

`agent-trace`、`agent-runtime-scope`、Tool execution-owner metadata 和 Evaluation facts/driver 中的
`runId`/Pi fields 尚未迁移；它们仍被旧 Tool/Agent Evaluation authoring source 引用，需在 W6 Tool
inventory 与 W7 canonical Desktop facts/driver 原子迁移时处理。真实 provider/API、可见 Desktop UI
和 release/package 验收未执行。
