# W7 Entry To Workspace Composer Scope Evidence

Date: 2026-08-22

## Scope And Canonical Path

- Desktop Shell may preserve one Draft `agentSurfaceId` while changing its exact Scene from
  unbound Entry to Workspace or authoring scope.
- Desktop Renderer preserves the unsent Draft, invalidates the prior Composer configuration and
  reads the new projection through the existing sender-bound Host operation.
- Host remains the only Workspace/grant/Canvas/configuration authority. Renderer receives only the
  typed projection and does not create a Conversation during navigation.

## Agent Evaluation Disposition

- Decision: `reuse`.
- Selected behavior/suite: `session-workflows` / `agent-runtime.workflow-controller`, as required by
  `scripts/agent-eval/authoring/change-selector.mjs` for `DesktopAgentSurface` changes.
- The focused implementation delta is proven deterministically by the Desktop Renderer lifecycle
  test. Existing Workspace workflow-controller cases remain the real-provider regression owner for
  effective Workspace Session behavior; no Evaluation-only navigation operation or alternate
  session assembly will be added.
- Canonical path: user navigation -> Host Scene transition -> preserved Draft Surface ->
  sender-bound Composer configuration read -> exact Workspace/Canvas projection -> normal first
  submit and Conversation publication.
- Forbidden fallback: stale Entry/application configuration, active/recent Workspace inference,
  forced Agent Root remount, Draft loss, navigation-time Conversation publication or direct runtime
  submission.

## Deterministic Validation

- `pnpm --filter @neko/app-desktop exec vitest run src/renderer/DesktopAgentSurface.test.tsx src/renderer/DesktopShell.test.tsx`
  - PASS: 2 files / 63 tests.
  - Covers preserved Draft input and unchanged Workbench/Agent Surface across Entry -> Workspace,
    exact Scene refresh between two Workspace surfaces, visible Workspace/Canvas context, no
    navigation-time create/submit, and late Entry projection rejection.
- `pnpm --filter @neko/app-desktop test`
  - PASS: 102 files / 616 tests.
- `pnpm --filter @neko/app-desktop typecheck`
  - PASS.
- Focused ESLint for the four changed Desktop Renderer files
  - PASS with no warning or error.
- `pnpm exec openspec validate replace-pi-with-dsh-runtime-atomically --strict`
  - PASS.
- Scoped `git diff --check`
  - PASS.
- Evaluation selector check
  - PASS: `DesktopAgentSurface.tsx` selects `session-workflows` /
    `agent-runtime.workflow-controller`.
- `pnpm test:agent:eval`
  - PASS: 45 files / 314 key-free harness tests; all-suite dry-run passes 26 suites / 71 cases,
    including 11 `agent-runtime.workflow-controller` cases.
  - This proves Evaluation authoring/harness readiness, not real-provider Agent behavior. No
    provider/model/cost authorization was supplied, so no real-provider case was run.
- `pnpm check:agent-boundaries`
  - BLOCKED outside this slice: the dirty worktree has already deleted
    `packages/agent/contracts/src/tool-names.ts`, so
    `scripts/check-agent-tool-inventory.test.mts` fails with `ENOENT`. The preceding extension and
    Agent-boundary tests pass. This slice does not modify or restore that parallel contract cleanup.

## Visible Desktop Acceptance

- Authoritative runtime: the currently running development Electron app for this worktree at
  `localhost:5173`.
- PASS: opened the Entry scene and confirmed there is no conversation title bar.
- PASS: entered `保留这段未发送草稿` without submitting, then selected the `Blame` Workspace.
- PASS: the same input remained in the Workspace Draft Composer; `Blame` and `Workspace Board`
  appeared before submission; the sidebar conversation count remained unchanged.
- PASS: the Workspace showed `开始创作`, with no overlap, clipping, stale Entry context or visible
  loading/error residue at the inspected viewport.
- Cleanup: cleared the acceptance Draft and restored the previously selected completed Workspace
  Conversation.

## Foundational Matrix Disposition

- Directly affected and covered here: exact Scene scope isolation, Draft preservation, Workspace
  Composer context projection and late-result isolation before first submit.
- Existing workflow-controller cases remain the regression owner for Workspace session workflows.
- Multi-turn continuation, context compaction, application restart recovery, generation/artifact
  recovery, queue/approval and multiple durable Conversation switching are not behaviorally changed
  by this Renderer invalidation fix; their existing matrix ownership is unchanged.
