## 1. Entry Presentation Contract

- [x] 1.1 Add the package-owned Assistant, Workspace, Character, and World experience-mode type and strict presenter projection without changing cross-runtime Agent contracts.
- [x] 1.2 Extend the single Window Entry Draft snapshot with optional experience-mode presentation and canonical Assistant restoration while preserving valid unsent input.
- [x] 1.3 Add presenter and snapshot tests for the default, strict invalid-state isolation, exact Workspace binding requirements, and owner-qualified unavailable modes.

## 2. Home Launch Surface

- [x] 2.1 Replace the old Home start-chat/roleplay actions with an accessible four-mode segmented selector that does not create a business instance.
- [x] 2.2 Project mode-specific Home copy and unavailable diagnostics, preserving responsive Desktop and narrow layouts.
- [x] 2.3 Expose the existing Plan, Approve, and Auto execution selector on Entry Drafts without changing execution-mode semantics.

## 3. Canonical Binding And Submit Validation

- [x] 3.1 Wire mode switching through the existing Draft `bindTarget` path, retain input text, invalidate incompatible references, and keep binding-pending state local to send availability.
- [x] 3.2 Require exact Workspace identity, grant, current binding receipt, and effective configuration before first submit; reject stale or missing targets without active/current/recent Workspace fallback.
- [x] 3.3 Keep Assistant submission unbound and Project-independent, and prevent Character/World modes from invoking ordinary Agent Draft submit.
- [x] 3.4 Keep textarea, mode selection, navigation, and layout enabled while projecting one visible and accessible send-blocked reason.

## 4. Deterministic Verification

- [x] 4.1 Add controller and component tests for Assistant success, Workspace missing/authorized/stale targets, pending binding, Character/World unavailable, and no broad input lock.
- [x] 4.2 Add deletion/poison assertions proving the old start-chat/roleplay entry actions and Entry execution-selector suppression are unreachable.
- [x] 4.3 Run `pnpm --dir packages/agent/webview test`, `pnpm --dir packages/agent/webview typecheck`, and the focused Desktop producer/consumer tests for the reused Workspace chooser and binding projection.

## 5. Agent Evaluation And UI Acceptance

- [x] 5.1 Reuse the indexed `agent-runtime.launch-binding` Assistant and Workspace first-submit cases; record deterministic coverage and the exact real-provider lane or explicit infrastructure/cost blocker.
- [ ] 5.2 Run visible Electron acceptance from Home for all four modes, Assistant without Project, Workspace target validation, mode switching, input editability, execution selector, narrow layout, and fail-visible Character/World states; inspect current screenshots directly.
- [ ] 5.3 Run adjacent reopen, Conversation switching, background-task isolation, and Workspace Scene regression checks without using hidden Root or direct-runtime shortcuts as UI evidence.

## 6. Completion And Quality Gates

- [x] 6.1 Run `openspec validate add-home-experience-entry-modes --strict`, `pnpm check:openspec`, focused tests/typechecks, and record canonical-path plus no-fallback evidence.
- [x] 6.2 Perform `neko-quality-review`, resolve or record ownership, dependency, user-data, fail-local, accessibility, and verification findings, and list all residual risks.
- [x] 6.3 Commit the OpenSpec, presentation contract, Home UI, validation, and verification evidence in reviewable batches without including unrelated dirty-worktree changes.
