# Validation evidence

## Automated

- `packages/agent/runtime`: full suite passed (51 files, 347 tests); terminal collector/service rerun passed
  (10 tests); typecheck passed.
- `packages/canvas/domain`: full suite passed (37 files, 299 tests); Workspace Board projection test passed
  (13 tests); typecheck passed.
- `packages/canvas/webview`: full suite passed (63 files, 409 tests); preview lifecycle, File preview, and fullscreen
  preview subset passed (17 tests); typecheck passed.
- `apps/neko-desktop`: DSH Board request/fingerprint adapter plus Canvas runtime tests passed (32 tests); typecheck
  passed.
- Desktop Vite production build passed (1,354 modules). Existing Radix `use client` and chunk-size warnings remain.
- `check:openspec`, Agent boundaries, package boundaries, content-access boundaries, and Webview boundaries passed.
- `check:no-internal-versioning` test harness passed, but the repository audit failed on pre-existing dirty-worktree
  baseline drift (76 occurrences and stale allowances); none of the reported paths belong to this change.
- Agent Evaluation all-suite dry-run passed for `content-locator-document-images`; this proves only scenario authoring
  readiness, not real Agent or Canvas behavior.

## Agent Evaluation

The existing visible Desktop evidence adapter rejects `workspace-board-projection` as unsupported and its facts command
does not expose Canvas Workspace Board projection facts. The content-locator image scenario therefore remains focused on
the real document/read-image path; no unsupported Board assertion is added. A real visible Electron Board projection and
replay check remains blocked until the public Evaluation evidence boundary can observe Canvas facts without direct IPC,
database reads, or a test-only runtime shortcut.

## UI validation inventory

- Existing Workspace Board is open; a later terminal analysis reads the same locator after its content changes; expected:
  same node/layout, refreshed visible text or media content.
- Existing source fingerprint is unchanged; expected: no preview lease churn and no node mutation.
- Source is unavailable; expected: current delivery fails locally with a diagnostic and sibling Canvas content remains.

The owning Desktop runtime requires a real provider turn and an open Canvas Board to capture the complete visible state.
That graphical run is not available in this implementation session, so visual validation is recorded as blocked rather
than inferred from component tests.
