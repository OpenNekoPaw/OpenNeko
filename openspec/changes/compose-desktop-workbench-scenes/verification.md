# Verification

Date: 2026-08-04

## Deterministic Evidence

The following focused producer/consumer checks passed during this change:

- `pnpm --filter @neko/host test`
- `pnpm typecheck` (the Host package has no package-local `typecheck` script)
- `pnpm --filter @neko/ui test`
- `pnpm --filter @neko/agent-contracts test`
- `pnpm --filter @neko/agent-runtime test`
- `pnpm --filter @neko/agent-webview test`
- `pnpm --filter @neko/assets-domain test`
- `pnpm --filter @neko/assets-node test`
- `pnpm --filter @neko/assets-webview test`
- `pnpm --filter @neko/preview-domain test`
- `pnpm --filter @neko/preview-webview test`
- `pnpm --filter @neko/canvas-webview test`
- `pnpm --filter @neko/cut-webview test`
- `pnpm --filter @neko/app-desktop test`
- affected package typechecks and renderer production builds

The final focused rerun passed with Host `36 files / 312 tests`, Assets Webview `5 files / 34
tests`, Desktop `65 files / 323 tests`, and the repository typecheck. Tests assert the Host
scene/sidebar codecs and CAS path,
package-owned Root delegation, exact directory grant and Workspace restore, Assistant first-submit
idempotency, AssetCenter selection/Preview lifecycle, one Workbench/PrimarySidebar structure, and
poisoned Home/raw-path/active-first-recent-Project fallback paths.

The Host focused regression additionally proves that Workspace Workbench mutations atomically update
the Scene Main/Timeline refs, renderer epoch projection advances both aggregates together, and startup
restoration rebuilds the Scene refs from the restored authoritative Workbench. The Desktop Resource
Browser regression proves that its controller authorization is derived from the exact Workspace Scene,
Agent View, Project and Tab identities; leaving that Scene fails closed even if the retired active target
still names the Project.

The stored-state startup regression additionally passed:

- `pnpm --filter @neko/host exec vitest run src/desktop-shell-state.test.ts` (`12 / 12`)
- `pnpm --filter @neko/app-desktop exec vitest run src/main/desktop-state-sqlite-integration.test.ts`
  (`9 / 9`)

These tests prove exact version 5 migration of `project-catalog`, `asset-catalog`,
`extension-catalog` and `assistant-resources` into canonical v6 slots. The current v6 codec and
unknown version 5 Manager Surface kinds remain fail-visible.

## Repository Gates

The following repository gates passed during qualification:

- `pnpm build`
- `pnpm test`
- `pnpm check`
- `pnpm check:quality`
- `pnpm check:legacy-debt`
- `pnpm check:unused` (configuration hints only; no blocking unused production path)
- `pnpm check:application-boundaries`
- `git diff --check`
- `pnpm exec openspec validate compose-desktop-workbench-scenes --strict`

These gates cover package producer/consumer integration, dependency direction, Renderer-to-Node or
Electron and Main-to-React prohibitions, removed Home management paths, and OpenSpec consistency.

## Electron Evidence

On 2026-08-04, `pnpm dev` also started against the existing user authority row containing the
observed version 5 `project-catalog` and `assistant-resources` scenes. It reached, in order,
`Desktop Electron runtime is ready`, `Desktop Host ports initialized`,
`Desktop AppHost and IPC initialized`, and `Desktop renderer loaded` without the prior
`desktop-shell-invalid-state` failure. A read-only SQLite query confirmed that startup did not
rewrite the user row: it remains version 5 at storage revision 894 until a later normal state CAS
persists the parsed v6 projection.

Both development and current packaged application paths passed in a real, visible Electron 43.2.0 /
Chrome 150 window on macOS arm64:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-03T17-50-42.078Z-desktop-workbench-scenes-development/report.json`

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-03T17-58-17.728Z-desktop-workbench-scenes-packaged/report.json`

The Composer refinement rerun also passed in the current development runtime:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-03T20-03-09.111Z-desktop-workbench-scenes-development/report.json`

The scenario proves:

- exactly one Workbench and PrimarySidebar in Agent, Assets, Extensions, Project Management,
  Settings and Workspace scenes;
- Agent-only draft retains composer, model/tool controls and explicit directory entry without an
  empty Main or early conversation;
- PrimarySidebar compact/expanded hit targets, width CAS from 240 to 360, recent sections and exact
  recent Project restore;
- Asset Management remains Main at large and 960 x 720 windows; an authorized PNG Preview loads
  through one `openneko-resource` request in Secondary Main;
- Extension Management remains Main rather than a detail/preview surface;
- explicit opaque directory grant activates the exact Workspace with Agent + creative Main + right
  Resources, all display modes, zero early conversations, restart restore and no renderer raw path;
- `poisonedRequestCount: 0`, no console errors and no renderer exceptions.

The latest run records the Assistant composer at 820 px inside a 1190 px owner and the narrow
Workspace composer at 334 px inside a 358 px owner. Both remain within their Workbench surface, retain
mode/model/approval and compact tool controls, keep the toolbar within the composer, open with an
elevated shadow, and expose zero branch/local-runtime metadata. Assistant shows the integrated
`选择工作目录` action; Workspace shows only the safe fixture label `workspace`.

A development launch against the existing user state also restored PrimarySidebar recent Projects and
conversations, the exact Workspace Agent/Canvas/Resources composition, and the integrated Composer
without a renderer exception. The Scene/Workbench and Resource Browser authority fixes preserve that
state instead of clearing or rewriting the user database.

Native picker cancellation and Assistant first-submit/provider execution are covered by deterministic
Desktop producer/consumer tests. They are not claimed as provider-backed Electron acceptance because
the isolated Electron fixture intentionally selects its contained Workspace and no authorized real
provider/model case was available.

## Agent Evaluation

`pnpm test:agent:eval` passed its key-free checks: `45 files / 284 tests`, with `22 suites / 53 cases`
selected in dry-run. This proves harness/schema/index readiness only. The five focused real Assistant
and directory cases remain infrastructure-blocked because the existing Desktop complete-session
driver does not expose Assistant draft submit, native directory authorization, scene/scope facts,
first-submit claim count or forbidden Project-resolution participation. See `evaluation.md`.

## Quality Review And Residual Risk

`neko-quality-review` found no new package-to-app dependency, Renderer Node/Electron import,
Desktop Main React import, raw-path Preview payload, management-in-dock path, Project fallback,
production `console.log`, or new production `any` in the change. Character/Chatroom remains
owner-qualified unavailable as designed.

Residual risk is limited to real provider/model Assistant first-submit behavior, native picker cancel
interaction in a visible Electron dialog, existing voice readiness, and Preview types beyond the
currently supported authorized descriptors. Cross-scope continuation remains intentionally deferred;
an active conversation requires a new conversation rather than in-place scope rebinding.
