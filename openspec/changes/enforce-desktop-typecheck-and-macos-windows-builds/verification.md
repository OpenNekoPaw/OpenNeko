## Verification

Date: 2026-08-01

Host: `darwin-arm64`

### Completed Evidence

- `pnpm exec openspec validate enforce-desktop-typecheck-and-macos-windows-builds --strict`
  passed.
- `git diff --check` passed.
- `pnpm test:functional:headless` passed 10 Desktop Main/preload/composition files and 86 tests
  without a graphical Electron process or provider credentials.
- CI/Evaluation/UI reachability tests passed, proving the required headless functional job is in
  both aggregate gates while `test:agent:eval`, `test:local:api`, and `test:local:ui` remain
  unreachable from workflows and generic CI scripts.
- `pnpm check:test-orchestration` passed 64 tests plus the complete 28-workspace ownership and
  coverage-owner audits.
- `pnpm check:legacy-debt`, `pnpm check:unused`, and `pnpm check:deps` passed. Knip reported
  configuration hints only, while dependency-cruiser found no violations across 1,031 modules and
  3,212 dependencies.
- The current GitHub `actions/runner-images` catalog maps `macos-15` to arm64 and `windows-2025` to
  x64. The Forge entry-point guard independently rejects a runner whose actual
  `process.platform/process.arch` does not match the supported target set.

### Earlier P0 Evidence Before The Parallel Migration

Before `retire-resource-ref-contract` entered its current breaking intermediate state, the same P0
platform implementation passed:

- `pnpm check:static-build`, including format, lint, all 15 explicit workspace typecheck tasks, and
  all five browser-safe UI builds;
- `pnpm test` across all 28 workspace test tasks;
- `pnpm check` and `pnpm check:quality`;
- focused platform/CI/Sharp/media orchestration, Agent input/prompt, and media runtime tests;
- `pnpm typecheck` across all 15 explicit typecheck tasks; and
- `pnpm test:agent:eval` with 35 harness files (234 tests) plus the 22-suite/50-case dry run.

The final command in that list is key-free harness evidence only, not real Agent behavior
Evaluation. These earlier results demonstrate that the P0 build-gate implementation had closed,
but they do not override the current-worktree failures recorded below.

### Evaluation Disposition

Disposition: `excluded`.

This change only separates deterministic build/test orchestration and local launch ownership. It
does not change Prompt or Skill content, Tool/capability routing, provider/model selection,
AgentSession behavior, asynchronous recovery, or Desktop Agent event projection. The focused
orchestration and launcher-contract tests are sufficient; no real provider API case was run and no
AI behavior claim is made.

### Graphical UI Disposition

The local launcher contract was verified deterministically, including the explicit functional
argument, isolated functional home, and separate Electron user-data directory. The graphical
application was not launched because this change does not alter UI behavior. Future renderer,
focus, IPC, CSP, or lifecycle changes must run `pnpm test:local:ui` locally and record visible
Electron evidence.

### Current Worktree Blocker

`pnpm check:static-build`, `pnpm typecheck:desktop`, `pnpm check:build`, `pnpm build`, and
`pnpm package:desktop` cannot currently complete because the parallel
`retire-resource-ref-contract` change is in an intentionally breaking intermediate state:
`DocumentArchiveResourceRef`, `ArtifactResourceRef`, and their guards were removed before all
Agent, Canvas, Content, Preview, and shared-type consumers were migrated. The direct Desktop
typecheck now fails on the resulting `ContentLocator`/`ResourceCacheSource` mismatch and removed
exports. The package command reaches Forge on `darwin-arm64`, then fails at the same boundary when
Vite imports `parseDocumentArchiveResourceRef` from the already-migrated shared entry point.

The aggregate static-build command currently stops even earlier at `format:check`, which reports 15
files owned by that parallel migration. Those files were not reformatted here because doing so
would modify another active change and would not close its producer/consumer contract.

The P0 platform change does not restore a compatibility export or add a fallback because that
would violate the other change's canonical migration design. Before the parallel edits reached
this intermediate state, `pnpm check:static-build` completed successfully. Native package
verification must be repeated after that active migration closes its producer/consumer boundary.

### Native Platform Evidence

- macOS Apple Silicon: the package command reached the new host assertion and identified
  `darwin-arm64`, then stopped in the unrelated Vite import failure described above. No inspected
  package artifact is claimed yet.
- Windows x64: not run locally and not cross-packaged. A real `windows-2025` CI runner must produce
  the `win32-x64` package and packaged-startup evidence before Windows platform qualification can
  be claimed.

### Residual Risk

- The Windows Electron archive checksum and CI graph are covered by deterministic orchestration
  tests, but native dependency loading, ASAR/fuses, filesystem behavior, and startup remain
  unverified until the real Windows job runs.
- Windows media uses the explicit software capability floor. Hardware acceleration, installer,
  signing, update channels, and complete product-flow qualification remain outside this P0 change.
