## Context

`neko-desktop` and `refactor-monorepo` diverged after commit `4f7eec8c`. The Desktop branch contains
the current host-neutral Agent/Canvas/Cut/Assets integrations and 51 additional product commits.
`refactor-monorepo` contains three commits: it defines and implements a single VS Code Extension
workspace, moves reusable second-level packages to first-level directories, and moves Extension
implementations into `apps/neko-vscode`.

A normal merge is not a valid migration path. The simulated merge reports content, rename/delete,
rename/rename and file-location conflicts across Agent, Assets, Canvas, Cut, documentation and
quality configuration. More importantly, resolving those conflicts in favor of the old branch would
make VS Code the composition owner, directly contradicting the Desktop-only requirement.

The repository is prelaunch. Unpublished workspace package paths, app entry points, VS Code
messages and test fixtures may change without compatibility shims, but project files, Desktop
settings and creator content remain protected user data.

## Goals / Non-Goals

**Goals:**

- Retain exactly one application composition root: `apps/neko-desktop`.
- Move every retained workspace package to a first-level `packages/*` directory.
- Preserve the latest Desktop branch behavior and stable npm package names/public exports.
- Delete VS Code Extension, TUI and VSIX paths instead of wrapping them with compatibility adapters.
- Keep runtime/domain/Webview state instance-scoped and keep Electron Main/preload/renderer
  boundaries explicit.
- Make nested packages and removed host dependencies fail repository validation.

**Non-Goals:**

- Keeping `apps/neko-vscode` as a dormant sample, release target or fallback host.
- Keeping `apps/neko-tui` as a debug or evaluation product entry.
- Renaming every retained npm package solely to match its directory name.
- Replacing Desktop with a generic multi-host framework.
- Rewriting domain logic, UI behavior, project formats or provider protocols unrelated to host
  removal.
- Migrating unpublished VS Code extension state or TUI-local state into Desktop.

## Five-Layer Analysis

- **Responsibility:** first-level packages own one stable domain/runtime/UI responsibility;
  `apps/neko-desktop` alone owns product composition, filesystem permission, Electron lifecycle and
  renderer authorization.
- **Dependency:** host-neutral packages do not import Electron, VS Code or application code;
  Webviews remain browser-safe; Desktop adapters depend on package public entries, never package
  internals.
- **Interface:** existing npm package names and public subpath exports remain canonical. Filesystem
  locations, VS Code Extension APIs, TUI commands and VSIX artifacts are removed contracts.
- **Extension:** a future application host requires a new OpenSpec and adapters around existing
  host-neutral ports. The repository does not preserve speculative host registries or compatibility
  shims.
- **Testing:** path guards prove topology/removal; producer/consumer tests and package builds prove
  moved package resolution; Desktop tests/package inspection prove the only supported runtime.

## Decisions

### 1. Record the old branch with a superseding merge, not a content merge

After the new OpenSpec artifacts are committed, merge `refactor-monorepo` with the `ours` strategy
and an explicit message that its single-extension implementation is superseded. This records branch
ancestry and prevents future repeated merge attempts without importing its obsolete application
tree.

The first-level package mapping is then applied to the current Desktop tree. This preserves later
Desktop fixes and allows Git to recognize the same conceptual renames. A manual conflict-by-conflict
normal merge was rejected because most conflicts ask whether code belongs to VS Code or Desktop,
which the product decision already answers.

### 2. Flatten by responsibility while preserving package identity

Retained packages move as complete ownership units:

| Current path                               | Target path                       | Disposition |
| ------------------------------------------ | --------------------------------- | ----------- |
| `packages/neko-agent/packages/agent`       | `packages/neko-agent-runtime`     | retain      |
| `packages/neko-agent/packages/agent-types` | `packages/neko-agent-types`       | retain      |
| `packages/neko-agent/packages/ai-sdk`      | `packages/neko-ai-sdk`            | retain      |
| `packages/neko-agent/packages/platform`    | `packages/neko-platform`          | retain      |
| `packages/neko-agent/packages/webview`     | `packages/neko-agent-webview`     | retain      |
| `packages/neko-agent/test-utils`           | `packages/neko-agent-test-utils`  | retain      |
| `packages/neko-canvas/packages/domain`     | `packages/neko-canvas-domain`     | retain      |
| `packages/neko-canvas/packages/webview`    | `packages/neko-canvas-webview`    | retain      |
| `packages/neko-cut/packages/domain`        | `packages/neko-cut-domain`        | retain      |
| `packages/neko-cut/packages/node`          | `packages/neko-cut-node`          | retain      |
| `packages/neko-cut/packages/webview`       | `packages/neko-cut-webview`       | retain      |
| `packages/neko-preview/packages/contracts` | `packages/neko-preview-contracts` | retain      |
| `packages/neko-preview/packages/webview`   | `packages/neko-preview-webview`   | retain      |
| `packages/neko-tools/packages/contracts`   | `packages/neko-tools-contracts`   | retain      |
| `packages/neko-tools/packages/webview`     | `packages/neko-tools-webview`     | retain      |

All nested `extension` packages are deleted. Aggregate roots that exist only to compile/package an
Extension are deleted after their retained children and package-owned documentation are moved.
Package `name` and `exports` fields remain unchanged unless they expose a removed VS Code entry.

### 3. Desktop is the only concrete host

Delete `apps/neko-vscode`, `apps/neko-tui`, package-local Extension implementations, `host-vscode`
directories and shared VS Code L1 helpers. Host-neutral behavior currently located beside VS Code
code must be moved to its owning retained package before deletion; it must not be copied into
Desktop merely to avoid identifying an owner.

Desktop Main owns Node/Electron adapters, workspace I/O, provider credentials, media processes and
resource authorization. Preload owns typed IPC projection. Renderer owns browser UI state. Removed
hosts do not leave no-op registration, dynamic optional imports, aliases or fallback bridges.

### 4. Remove product and toolchain compatibility at the source

Root workspaces become only `apps/*` and `packages/*`. Root scripts, Turbo tasks, dependency-cruiser
inputs, Knip entries, package groups, CI workflows and release scripts lose VSIX/Extension/TUI
routes. Dependencies such as `@vscode/vsce`, `@vscode/test-*` and `@types/vscode` are removed when
no retained package consumes them.

Historical archived OpenSpec evidence may still name VS Code. Active architecture, current changes,
root documentation, validation scripts and production code must describe Desktop as the sole host.
Repository guards scan executable/configured surfaces rather than treating historical text as a
runtime dependency.

The following changes are superseded as complete design paths and are archived with `--skip-specs`
so their VS Code/VSIX requirements cannot enter stable specs:

- `consolidate-vscode-single-extension-package`
- `finalize-platform-packaging-and-removal`
- `close-embedded-runtime-dependencies`
- `standardize-vscode-test-workspace`

Their validation notes remain historical evidence only. Any still-useful native dependency closure
or fixture isolation requirement must be reintroduced through a Desktop-owned OpenSpec rather than
continuing an unfinished Extension Development Host task.

### 5. Webview contracts become host-neutral, not Desktop-local

Retained Webview packages must not call `acquireVsCodeApi`, import `vscode`, or depend on Extension
message bootstrap. They consume injected package-owned host runtime contracts already used by
Desktop. CSS compatibility variable names may only remain temporarily where they are inert theme
inputs provided by Desktop and have no VS Code runtime dependency; each remaining use must be
inventoried and either renamed in this change or recorded as an explicit styling-only follow-up.

### 6. Removal is fail-visible and data-safe

Unknown old messages, removed app commands, missing Desktop adapters and nested-package references
fail build or tests. There is no dual-read or fallback into removed hosts. The migration does not
delete project content or Desktop settings. Removed VS Code/TUI state is ignored because those
unpublished hosts are no longer executable; the release note states this breaking boundary.

## Risks / Trade-offs

- **[Large rename obscures behavior changes]** -> Commit topology moves separately from host
  deletions and configuration rewrites; use rename-aware diffs and path-level guards.
- **[Host-neutral code is accidentally deleted with an Extension]** -> Audit Desktop imports and
  package exports before each deletion; moved package builds and Desktop producer/consumer tests are
  mandatory.
- **[Lockfile/workspace resolution drifts]** -> Regenerate through `pnpm install --lockfile-only`
  after all moves, then run strict package/type resolution checks.
- **[Historical docs still mention VS Code]** -> Restrict runtime guards to active code/config; update
  stable architecture and active conflicting changes, while leaving archives as historical facts.
- **[Evaluation loses its TUI driver]** -> Move only generally reusable evaluation orchestration to a
  script-owned Desktop session driver if one exists; otherwise mark real Agent evaluation blocked
  and keep key-free harness tests without pretending they are runtime acceptance.
- **[Desktop package build is slow or platform-specific]** -> Run deterministic tests/typecheck/build
  first, then the host-platform Electron package inspection; record unsupported-platform evidence
  as residual risk.

## Migration Plan

1. Add the new topology/removal guard tests and commit this OpenSpec.
2. Merge `refactor-monorepo` with `ours`, explicitly superseding its single-extension tree.
3. Move retained second-level packages to the target first-level paths without content changes.
4. Update path-based configuration and prove package resolution before deleting hosts.
5. Delete VS Code/TUI apps, Extension/host-vscode code, packaging/release routes and dependencies.
6. Update Desktop composition, root scripts, CI, quality guards and current architecture docs.
7. Regenerate the lockfile and run focused moved-package tests, Desktop tests/build/package,
   repository checks, legacy/unused gates and Agent evaluation disposition.

Rollback is commit-based because no project data migration occurs. Reverting the topology and host
removal commits restores the previous prelaunch tree; the superseding merge commit remains a
historical record and does not contain old branch files.

## Open Questions

- Whether styling-only `--vscode-*` token aliases should be renamed in this change depends on their
  count and whether third-party Webview components consume them. They cannot retain any runtime
  bridge semantics.
- Real Agent evaluation currently uses the TUI as complete session owner. Before removing TUI, the
  implementation must either identify an existing Desktop-owned driver or record real evaluation as
  blocked with key-free harness coverage only.
