# W7 Canonical DSH Desktop Evaluation Driver

Date: 2026-08-20

## Implemented

The production Evaluation runner now defaults to the package-owned Desktop scenario backed by a
public DSH driver. The driver uses only `window.openNekoDesktop.dshSessions`,
`window.openNekoDesktop.dshPermissions`, `window.openNekoDesktop.dshRuntime` and the Shell
projection. It submits through the existing Composer for visible cases and uses the same typed DSH
Session bridge for hidden complete-Desktop cases.

The driver projects the exact `conversationId`, `dshSessionId` and DSH `turn` identity, polls the
package-owned Session projection for terminal idle, reads bounded DSH events/facts, and delegates
permission decisions through the DSH permission bridge. It does not read DSH storage, inject ACP
frames, create a second queue/transcript authority, or expose Pi `runId`/`branchId` identities.

Model configuration uses the same public Desktop product boundary. It requires the exact visible
Conversation surface and an idle Session, resolves one advertised Composer model option, invokes
`dshSessions.selectComposerModel`, verifies the returned effective model and proves the operation
did not create a DSH Turn. Running-Turn future configuration is not an alternate path.

Renderer reload and application restart recovery reconnect through the public bridge on the new
owner, verify that the visible Surface still names the exact requested Conversation and only then
read the Session snapshot. No active/recent Conversation fallback is accepted. Scenario lifecycle
requests and `desktop-lifecycle` assertions must match exactly; reload, focus and graceful-close
facts are all evaluated by a hard gate.

The retired `scripts/agent-eval/desktop/driver.mjs` and its tests were deleted after all production
references were removed. DSH built-in Agent loop, Session/history, Skill runtime, Tool scheduling and
permission behavior remain outside OpenNeko Evaluation coverage.

## Verification

- `pnpm test:agent:eval`: 45 files, 314 tests; all 26 suites and 65 dry-run cases discovered.
- DSH driver focused tests: public bridge-only expression, construction boundary and evaluator
  delegation pass.
- A real `nekoapi-chat / gpt-5.6-luna` case passed provider/model authorization and reached Desktop
  launch. Execution was blocked before the app started because another development process (PID 41047) owned the checkout Vite bundle lock. No provider request or success evidence was claimed.

## Remaining blocker

After the existing Desktop development owner is explicitly stopped, rerun the same focused case with
the configured `~/.neko/config.toml` and explicit provider/model/cost authorization. Then add visible
approval, application reopen, domain Tool, hidden batch, and pixel evidence before closing W7.
