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

The 9.9 qualification regression rerun added and passed focused path evidence for:

- restoring the exact Workspace Scene conversation through `DesktopAgentSurface` instead of showing
  the draft EmptyState;
- treating the exact active Project as an idempotent Host transition without grant restore, Scene
  mutation or conversation rebinding, while retaining the different-scope rejection;
- keeping the dedicated PrimarySidebar icon outside the brand in expanded and compact states;
- using one package-owned `PreviewPresentation` and viewer registry for Workspace and authorized
  Asset Center previews;
- restoring bounded Project/Extension management geometry and explicit empty states;
- deriving Workspace Resource Browser authority from the exact Scene, Agent View, Project and Tab.

The 9.10/9.11 regression rerun added path evidence for:

- atomically restoring a Workspace conversation's Project target, attached Workbench, Scene session
  phase and exact Agent adapter rather than rendering the session through the previous draft scope;
- closing the last Workspace Main View while retaining the exact Workspace Agent and Resources,
  removing only the Scene Main/Timeline refs and continuing renderer-epoch projection;
- preserving an error-only Pi assistant entry's persisted `errorMessage` in the canonical transcript
  projection instead of producing a label-only Error card.

Focused commands passed with Host `36 files / 315 tests`, Desktop `3 files / 37 tests`, Agent
projector `3 / 3`, Desktop and Agent Runtime typechecks, and `git diff --check`.

The final exact-session and management-composition rerun passed Agent Runtime `115 files / 1076
tests`, Agent Webview `90 / 691`, Desktop `65 / 335`, Assets Webview `5 / 35`, and the repository
typecheck. The added path assertions prove that Host bootstrap supplies the exact Scene conversation,
the bridge replaces a same-View connection when its conversation changes, the controller initializes
the exact active conversation and Tab at revision zero, and a missing conversation fails visibly.
The initial-turn regression also proves preflight checkpoint idempotency and preservation of an
existing Pi checkpoint after provider execution has started.

The final quality review found and removed one implicit owner-binding path in the Entry Draft:
changing creative mode no longer invokes Assistant selection or the legacy new-conversation path,
and unavailable Character/Room selection no longer opens the roleplay prompt menu before reporting
its diagnostic. The focused `ConversationController` regression passed `1 file / 50 tests` and
asserts zero Assistant transition, conversation creation, draft submit and roleplay search while
retaining the draft input.

The final full rerun passed `pnpm build`, `pnpm test`, `pnpm check` and `pnpm check:quality`. The
updated totals include Preview Webview `16 files / 85 tests`, Agent Webview `90 / 689`, Host
`36 / 313`, Assets Node `9 / 50` and Desktop `65 / 326`.

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

The 9.9 development Electron rerun passed after the final presentation changes:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-03T20-47-50.423Z-desktop-workbench-scenes-development/report.json`

The final development and packaged qualification reruns passed:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T00-03-59.499Z-desktop-workbench-scenes-development/report.json`

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T00-07-17.696Z-desktop-workbench-scenes-packaged/report.json`

It records the dedicated compact Sidebar control outside the brand, bounded 1006 px Project and
Extension management Roots inside a 1072 px Main, Asset Center Preview owned by `preview-webview`,
and aligned EmptyState/composer widths of 820 px in Agent-only and 334 px in the Workspace dock. The
isolated run exercised Workspace Resources, all display modes, exact recent Project restore and
application restart with `poisonedRequestCount: 0`, no console errors and no renderer exceptions.

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
- Asset and Project management switch to the shared 34/66 resizable Main split only when Preview or
  Detail exists, remain full-width otherwise, and preserve non-overlapping large/small geometry;
- explicit opaque directory grant activates the exact Workspace with Agent + creative Main + right
  Resources, all display modes, zero early conversations, restart restore and no renderer raw path;
- cancellation through the isolated Electron Main picker boundary leaves Window revision, Scene
  revision, exact Scene content and Project catalog unchanged before the subsequent successful grant;
- Assistant first submit activates session phase and the exact conversation immediately, renders the
  locally committed initial message despite provider preflight failure, and restores the same message
  and conversation after navigating through a management scene;
- `poisonedRequestCount: 0`, no console errors and no renderer exceptions.

The latest run records the Assistant composer at 820 px inside a 1190 px owner and the narrow
Workspace composer at 334 px inside a 358 px owner. Both remain within their Workbench surface, retain
mode/model/approval and compact tool controls, keep the toolbar within the composer, open with an
elevated shadow, and expose zero branch/local-runtime metadata. Assistant shows the integrated
`选择工作目录` action; Workspace shows only the safe fixture label `workspace`.

The 10.9-10.11 development and packaged qualification reruns passed after the corrected Agent
activation and panel chrome changes:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T07-40-08.681Z-desktop-workbench-scenes-development/report.json`

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T07-44-59.640Z-desktop-workbench-scenes-packaged/report.json`

Both isolated Electron runs record the Workspace Agent title `工作区已就绪` with zero owner-selection
actions, the Workspace layout control in the PrimarySidebar top brand controls and not the footer,
zero global refresh controls in Workspace Resources while its library control remains available, and
Workspace Preview chrome `content-only` with one outer Workbench tab strip and zero internal headers.
Assets Preview remains owned by `preview-webview`, keeps its descriptor header in the independent
tabless shell, and management/detail panel tab-header lists remain empty. Large/small layout,
management split resize, application restart and renderer error checks passed without touching user
state.

After the final explicit-owner routing fix, the complete development and packaged scenarios passed
again on the final code:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T08-45-33.509Z-desktop-workbench-scenes-development/report.json`

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T08-47-12.574Z-desktop-workbench-scenes-packaged/report.json`

The final qualification rerun passed `pnpm build`, `pnpm test`, `pnpm check`,
`pnpm check:quality`, `pnpm check:legacy-debt`, `pnpm check:unused`,
`pnpm check:application-boundaries`, the key-free Agent Evaluation harness and strict OpenSpec
validation. Agent Webview finished at `90 files / 698 tests`, Agent Runtime at `115 / 1076`, Host at
`36 / 318`, Preview Webview at `16 / 85`, Assets Webview at `5 / 36` and Desktop at `65 / 342`.
Quality and application-boundary findings were zero; the unused scan reported only 73 configuration
hints and no blocking production path.

A development launch against the existing user state also restored PrimarySidebar recent Projects and
conversations, the exact Workspace Agent/Canvas/Resources composition, and the integrated Composer
without a renderer exception. The Scene/Workbench and Resource Browser authority fixes preserve that
state instead of clearing or rewriting the user database.

The Electron fixture exercises cancellation through a one-shot fixture-only Main marker before the
normal contained Workspace grant. Production user state never reads this marker. The scenario proves
the production cancellation state contract and subsequent chooser recovery, but it does not claim an
OS dialog screenshot. Assistant provider execution is not claimed as accepted because no authorized
real provider/model case was available; the visible scenario proves only local commit, preflight
failure checkpointing, exact activation and restore.

## Agent Evaluation

`pnpm test:agent:eval` passed its key-free checks: `45 files / 284 tests`, with `22 suites / 53 cases`
selected in dry-run. This proves harness/schema/index readiness only. The five focused real Assistant
and directory cases remain infrastructure-blocked because the existing Desktop complete-session
driver does not expose Assistant draft submit, native directory authorization, scene/scope facts,
first-submit claim count or forbidden Project-resolution participation. See `evaluation.md`.

The focused real-run preflight for
`agent-runtime.workflow-controller/conversation-persistence-resume` returned
`infrastructure-blocked` before Desktop/API launch with the exact diagnostic that explicit provider,
model and cost authorization are required. No provider behavior is claimed from this preflight.

## Quality Review And Residual Risk

`neko-quality-review` found no new package-to-app dependency, Renderer Node/Electron import,
Desktop Main React import, raw-path Preview payload, management-in-dock path, Project fallback,
production `console.log`, or new production `any` in the change. Character/Chatroom remains
owner-qualified unavailable as designed.

Residual risk is limited to real provider/model Assistant first-submit behavior, existing voice
readiness, and Preview types beyond the currently supported authorized descriptors. Cross-scope
continuation remains intentionally deferred; an active conversation requires a new conversation
rather than in-place scope rebinding.
