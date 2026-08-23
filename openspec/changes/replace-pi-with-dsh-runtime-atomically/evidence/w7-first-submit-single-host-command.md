# W7 First Submit Single Host Command Evidence

## Canonical path

- Unbound Entry/Workspace Draft sends one strict sender-bound `create(initialInput)` request.
- Desktop Main publishes and attaches the exact Conversation, then `DesktopDshSessionHost` routes that same input through the canonical subsequent-input implementation.
- Message, Command and Skill first inputs therefore use the same DSH binding and execution owners as later input.
- Renderer consumes the projection returned by `create`; a poisoned `submit` mock proves that it does not send the first input twice.
- A DSH/Provider failure after publication propagates from the same request. No delete, replacement Session, Pi first-submit lifecycle or implicit retry path was added.

## Evaluation scope

- Decision: reuse the existing `agent-runtime.launch-binding` suite.
- Cases:
  - `entry-assistant-first-submit`
  - `workspace-bound-first-submit`
- Behavioral claim: one visible Draft action materializes one exact Conversation/DSH Session binding and produces a non-empty terminal answer without owner fallback.
- Forbidden path evidence: focused Renderer tests poison any second `dshSessions.submit` call; Host tests assert one create publication followed by the exact canonical Message, Command or Skill operation.
- Runner support: both indexed cases and their current assertions completed key-free dry-run validation.
- Real execution: not run. No explicit provider/model/cost authorization was supplied for a visible Desktop run, so this remains `infrastructure-blocked` behavior evidence rather than an inferred pass.

## Verification

- `pnpm --dir apps/neko-desktop exec vitest run src/main/desktop-dsh-session-host.test.ts src/renderer/DesktopAgentSurface.test.tsx`
  - Passed: 2 files, 51 tests.
- `pnpm --dir apps/neko-desktop run typecheck`
  - Passed.
- `pnpm --dir apps/neko-desktop exec eslint src/main/desktop-dsh-session-host.ts src/main/desktop-dsh-session-host.test.ts src/renderer/DesktopAgentSurface.tsx src/renderer/DesktopAgentSurface.test.tsx`
  - Passed.
- `openspec validate replace-pi-with-dsh-runtime-atomically --strict`
  - Passed.
- `pnpm check:openspec`
  - Passed: 146 items.
- `node scripts/agent-eval/all-suite-dry-run.mjs --suite agent-runtime.launch-binding --case entry-assistant-first-submit`
  - Passed: 1 suite, 1 case.
- `node scripts/agent-eval/all-suite-dry-run.mjs --suite agent-runtime.launch-binding --case workspace-bound-first-submit`
  - Passed: 1 suite, 1 case.

## Residual gate

- `pnpm check:agent-boundaries` did not complete because the current repository gate test reads the absent baseline path `packages/agent/contracts/src/tool-names.ts`. The first boundary stage passed 11/11 tests and the production Tool inventory positive case passed before that unrelated `ENOENT`. This task did not change Tool contracts or inventory and does not mask the failure.
