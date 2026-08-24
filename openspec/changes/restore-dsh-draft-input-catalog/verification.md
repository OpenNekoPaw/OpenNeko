## Verification Summary

Risk: L3。变更跨越 Desktop Main、Agent runtime ACP client 与 DSH bridge，并改变 Draft 阶段的 Agent command/Skill catalog 路由；没有改变用户持久化数据 shape，也没有新增第二个 Agent controller。

## Passed

- `pnpm --filter @neko/dsh-bridge test` — 5 files / 47 tests。
- `pnpm --filter @neko/dsh-bridge typecheck`。
- `pnpm --filter @neko/agent-runtime typecheck`。
- `pnpm --filter @neko/app-desktop typecheck`。
- `pnpm --filter @neko/app-desktop exec vitest run src/main/desktop-dsh-composer-configuration.test.ts src/main/desktop-dsh-agent-runtime.test.ts` — 2 files / 14 tests。
- `pnpm --filter @neko/agent-runtime exec vitest run src/acp/dsh-acp-application-client.test.ts src/application/conversation-dsh-session-client.test.ts` — 2 files / 35 tests。
- `pnpm --filter @neko/agent-webview exec vitest run src/dsh-session/root.test.tsx` — 1 file / 31 tests；command/Skill 菜单用显式 `conversationId={undefined}` 覆盖 Draft。
- `pnpm --dir scripts/dsh-q0 qualify:draft-input-catalog` — real DSH subprocess qualification passed；catalog 包含 `compact`、`feedback`、`goal`、`permission`、`plan`，Skill snapshot 完整，`persistedSessionCount: 0`，`providerContacted: false`。
- `pnpm exec openspec validate restore-dsh-draft-input-catalog --strict`。
- `pnpm check:application-boundaries` — 1368 files / 0 findings。
- `pnpm check:webview-boundaries`。
- `pnpm check:strict-tsconfig`。
- `pnpm check:openspec` — 170 passed。
- `git diff --check`，以及两个修改脚本的 `node --check`。

此前同一实现轮次还通过 Agent runtime 全包 54 files / 376 tests、Desktop 全包 109 files / 678 tests 和 Desktop composer focused 7 tests。

## Blocked Or Unrelated Failures

- `pnpm check:no-internal-versioning`：当前大型脏工作树有 92 个新命中及 19 个 stale allowances，分布在 Character、Project、Settings、Generation 等多项并行改动；本变更触及的既有 `-v4` model fixture 也因行位置变化被重新识别。没有修改共享 allowance ledger，避免覆盖用户的并行工作。
- `pnpm check:package-boundaries`：失败于无关的 `DesktopSettingsSurface.tsx` 未声明 `@neko/ai-contracts` workspace dependency；本变更没有修改该文件或依赖。
- `pnpm check:agent-boundaries`：自检通过，随后失败于并行 Tool inventory 改动（缺少 `submit-comfyui`）以及已删除的 `packages/agent/contracts/src/tool-names.ts`；均不属于 Draft catalog 路径。
- 完整 `scripts/dsh-q0` qualification 在新的 Draft isolation 断言通过后，失败于既有 standard ACP Prompt admission 并发 lane 的 release timeout；focused Draft qualification 独立通过，不能据此宣布完整 Q0 通过。
- 隔离可见 Electron 场景尚未执行：当前 checkout 的 PID 29293 持有 Development Vite bundle，且 Computer Use 两次确认 Mac 仍锁屏。

## Residual Risk

Draft catalog 的跨进程 contract、无持久 Session 泄漏和 React Draft 投影已有确定性证据；可见 Electron 中的宽/窄布局、真实 composer/provider 首次提交和精确一个 Conversation/Session 仍缺本轮运行证据，因此 UI/Agent 行为验收保持 blocked。
