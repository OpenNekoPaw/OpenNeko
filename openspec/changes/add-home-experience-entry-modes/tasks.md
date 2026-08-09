## 1. Window Navigation Contract

- [x] 1.1 Add a Desktop-owned pure projection from entry/management Scene to Assistant, Workspace, Character, or unavailable World presentation without persistent mode state.
- [x] 1.2 Map enabled modes to the existing exact Scene intents and keep World disabled until a World-owned Scene exists.
- [x] 1.3 Add path-level tests proving mode clicks do not bind Drafts, create business instances, infer active identities, or retain hidden Roots.

## 2. Desktop Top Selector

- [x] 2.1 Extend the shared segmented control with a backward-compatible neutral appearance and configurable width, preserving existing consumers.
- [x] 2.2 Compose the Codex-style selector in the stable Desktop title region for Agent Entry, Project Management, and Character Management only.
- [x] 2.3 Keep Project Workspace title controls and business Scenes unchanged; cover keyboard, disabled World description, desktop, and narrow layouts.

## 3. Canonical Agent And Workspace Paths

- [x] 3.1 Make unbound Agent Entry the single Assistant launch surface and preserve the canonical execution selector and first-submit transaction.
- [x] 3.2 Route Workspace to Project Management and reuse explicit Project selection or directory authorization with the exact existing Workspace Scene intents.
- [x] 3.3 Keep navigation and layout operable during validation and streaming; only consequential Agent actions use runtime-owned pending/cancel semantics.

## 4. Delete Replaced Paths

- [x] 4.1 Delete Agent Webview experience-mode type, presenter, selector, snapshot field, controller state, mode-switch binding, styles, copy, and tests.
- [x] 4.2 Delete the old Home `start-chat | roleplay` action dispatch and simplify EmptyState to the canonical Draft path.
- [x] 4.3 Delete the unused `bind-agent-assistant` Scene intent and `bind-assistant` Agent launch operation, parser/service branches, fixtures, and tests in one contract update.
- [x] 4.4 Add deletion/poison assertions proving removed paths are unreachable and the only successful routes are typed Scene transition and canonical first submit.

## 5. Deterministic Verification

- [x] 5.1 Run focused `@neko/ui`, `@neko/host`, Agent Webview, Desktop renderer tests and typechecks.
- [x] 5.2 Run `openspec validate add-home-experience-entry-modes --strict` and `pnpm check:openspec`.
- [x] 5.3 Reuse the indexed `agent-runtime.launch-binding` Assistant and Workspace first-submit cases; record the exact real-provider lane or explicit infrastructure/cost blocker.

## 6. UI Acceptance And Quality

- [x] 6.1 Run visible Electron acceptance for top placement, Assistant/Workspace/Character navigation, disabled World, Project selection, keyboard access, and narrow layout; inspect current screenshots directly.
- [x] 6.2 Run adjacent reopen, Conversation switching, background-task isolation, Workspace title controls, streaming navigation, and no-hidden-Root regression checks.
- [x] 6.3 Perform `neko-quality-review`, resolve or record ownership, dependency, user-data, fail-local, accessibility, verification, and residual-risk findings.
- [x] 6.4 Commit OpenSpec, shared UI/navigation, removed Agent paths, and verification evidence in reviewable batches without unrelated worktree changes.
