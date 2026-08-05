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
Assets Preview remains owned by `preview-webview`; at this qualification point it still kept its
descriptor header in the independent tabless shell, while management/detail panel tab-header lists
remained empty. Large/small layout,
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

The 10.12-10.15 final development and rebuilt packaged qualification passed on the current code:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T09-53-37.943Z-desktop-workbench-scenes-development/report.json`

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T09-55-27.603Z-desktop-workbench-scenes-packaged/report.json`

Both visible Electron 43.2.0 / Chrome 150 runs prove that fresh and repeated Start Creating drafts
contain zero owner-choice cards and zero early conversations. Direct send transitions the exact
`unbound` draft into one Assistant conversation/session, renders the committed initial message and
restores the same conversation from PrimarySidebar. Directory selection still activates the exact
Workspace draft with no early conversation; Character/Room remains owner-qualified unavailable and
does not fall back to another scope.

Both reports also record `entry-draft-assistant-reference-ready` with `type: file` and label
`agent-reference.txt` before direct send. The exact Entry Draft grant is rebound to the committed
AssistantSpace, consumed by the canonical first-submit preflight and restored with the same session.
The producer regression additionally proves that one missing/cross-connection grant rejects the whole
binding set without partially changing a valid grant, while same-Assistant retry remains idempotent.

Asset Preview and the then-present Project Detail recorded `data-main-composition="independent-shells"`, exact Primary
and Secondary shell identities, a 10 px sibling gutter and no overlap. At 1440 x 960 the panels are
364/698 px; at 1040 x 700 Asset Preview remains visible at 228/434 px. The enclosing Main has no
border/radius/shadow and visible overflow, while both child shells have a 1 px border, 18 px radius,
surface shadow and hidden overflow. Preview remains owned by `preview-webview`, and neither shell
adds a Workbench tab strip. Both reports have `poisonedRequestCount: 0`, no console errors, warnings
or renderer exceptions.

The final repository qualification passed `pnpm build`, `pnpm test`, `pnpm check`,
`pnpm check:quality`, explicit `pnpm check:legacy-debt`, `pnpm check:unused` and
`pnpm check:application-boundaries`, `git diff --check`, key-free Agent Evaluation and strict OpenSpec
validation. Relevant full-test totals are Agent Contracts `41 files / 281 tests`, Agent Webview
`90 / 697`, Agent Runtime `115 / 1076`, Host `36 / 318`, UI `47 / 204` and Desktop `65 / 342`.
Application-boundary findings were zero across 1427 checked files; the unused scan reported only the
existing 73 configuration hints and no blocking production path.

The 10.16 development and rebuilt packaged qualification passed on the current code:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T10-28-07.173Z-desktop-workbench-scenes-development/report.json`

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T10-32-30.728Z-desktop-workbench-scenes-packaged/report.json`

Both Electron runs prove that Asset authorized Preview still renders through the canonical
`preview-webview` presentation and viewer registry, now with `content-only` chrome, zero descriptor
headers and zero synthetic panel tab strips. The Preview content background is transparent, while
the Primary and Secondary shell computed backgrounds both resolve to `rgb(255, 255, 255)`, so the
content inherits the shared Workbench theme instead of replacing it.

Project selection now records only `project-management` in Main, `mainSplit: none`,
`mainComposition: continuous`, no Secondary Main, no gutter and no `project-detail`. The selected row
retains a separate explicit open action; selection itself remains a management fact and does not open
Workspace. Focused Preview/Desktop regressions passed `4 files / 37 tests`, and the complete Desktop
suite passed `65 files / 342 tests`; Preview Webview build, Desktop typecheck, Desktop packaging,
`pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:quality`, `pnpm check:legacy-debt`,
`pnpm check:application-boundaries`, `git diff --check` and strict OpenSpec validation passed. The
first packaged scenario attempt reached the final Assistant activation check while still in draft;
an immediate isolated rerun passed the complete scenario, so this remains a non-deterministic Agent
activation residual rather than evidence of a Preview/Project regression.

The 10.17 first-submit handoff regression was reproduced again in the packaged application before the
fix:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T12-23-08.407Z-desktop-workbench-scenes-packaged/report.json`

That run committed the Entry Draft reference and reached the exact Workspace checks, but failed before
the Assistant activation checkpoint because the conversation lifecycle record existed while the
scope-owned Agent runtime conversation and session Scene were not yet available. The failure was not
accepted as timing noise.

The final development and rebuilt packaged scenarios passed on the corrected lifecycle and IPC path:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T12-26-49.100Z-desktop-workbench-scenes-development/report.json`

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T12-28-47.200Z-desktop-workbench-scenes-packaged/report.json`

Both runs prove direct Entry Draft submit activates the exact Assistant session, explicit directory
selection retains the exact Workspace scope, and the activated Assistant accepts a second message.
The scenario rejects `attachment-identity-mismatch` and endpoint-mismatch alerts after launch/session
adapter replacement. The final reports have `poisonedRequestCount: 0`, no console errors and no
renderer exceptions.

Focused path tests additionally prove that lifecycle replay materializes the exact conversation even
after the provider claim was consumed, concurrent materialization remains idempotent, provider context
resolution cannot delay session activation, resolution/provider failure becomes a durable failed-turn
diagnostic, and old/new renderer adapters send and subscribe through their own connection identities.
The final affected suites passed Agent Runtime `115 files / 1080 tests`, Agent Webview `90 / 697` and
Desktop `65 / 343`.

After the final async-boundary correction, `pnpm build`, `pnpm test`, `pnpm check` and
`pnpm check:quality` passed again. The Desktop production package was rebuilt and its darwin-arm64
output verified; application-boundary findings remained zero across 1427 files, dependency findings
remained zero across 1398 modules, and the unused scan reported only the existing 73 configuration
hints.

## Agent Evaluation

`pnpm test:agent:eval` passed its key-free checks: `45 files / 284 tests`, with `22 suites / 53 cases`
selected in dry-run. This proves harness/schema/index readiness only. The five focused real Assistant
and directory cases remain infrastructure-blocked because the existing Desktop complete-session
driver does not expose Assistant draft submit, native directory authorization, scene/scope facts,
first-submit claim count or forbidden Project-resolution participation. See `evaluation.md`.
The change-to-suite selector now maps `desktop-agent-launch-runtime` to the existing
`session-workflows -> agent-runtime.workflow-controller` owner; its focused selector regression passed
`5 / 5` and rejects default-suite substitution.

The focused real-run preflight for
`agent-runtime.workflow-controller/conversation-persistence-resume` returned
`infrastructure-blocked` before Desktop/API launch with the exact diagnostic that explicit provider,
model and cost authorization are required. No provider behavior is claimed from this preflight.

The 10.17 disposition remains `update` for
`session-workflows -> agent-runtime.workflow-controller`. The canonical evidence now also requires
exact scope-owned session materialization before provider claim and old-binding detach before the new
projection endpoint accepts a second message. `pnpm test:agent:eval` passed again at `45 files / 284
tests` and `22 suites / 53 cases` dry-run. A real provider-backed Entry Draft case remains
infrastructure-blocked because the complete-session driver does not expose Entry Draft submit,
materialization/claim ordering or projection endpoint replacement facts; deterministic tests and the
visible Electron scenarios are not presented as model-behavior acceptance.

## Quality Review And Residual Risk

`neko-quality-review` found no new package-to-app dependency, Renderer Node/Electron import,
Desktop Main React import, raw-path Preview payload, management-in-dock path, Project fallback,
production `console.log`, or new production `any` in the change. Character/Chatroom remains
owner-qualified unavailable as designed.

Residual risk is limited to real provider/model Assistant first-submit behavior, existing voice
readiness, and Preview types beyond the currently supported authorized descriptors. Cross-scope
continuation remains intentionally deferred; an active conversation requires a new conversation
rather than in-place scope rebinding.

## Workspace Region Layout Controls

Task 10.18 replaced the mixed layout Popover and Workspace Main-header actions with four compact
VS Code Codicon controls in PrimarySidebar top chrome. PrimarySidebar uses its independent sidebar
CAS; Agent, Main and resource management update only their Workbench presentation state. Agent and
Main cannot both be hidden, and resource visibility preserves the Agent position preference while
the renderer resolves the temporary right-dock collision.

Focused renderer/style tests passed `39 / 39`; the complete Desktop suite passed `65 files / 360
tests`, and `@neko/ui` passed `47 files / 204 tests`. Desktop and UI typechecks, affected ESLint,
`git diff --check`, strict OpenSpec validation and the renderer production Vite build passed. The
build retained existing browser-external and chunk-size warnings outside this layout path.

A visible development Electron run exercised Agent-only, Main-only, management-hidden and
all-regions-visible states through the actual PrimarySidebar buttons. Each toggle changed only its
owned region, the final business region control became disabled, Workspace Main retained only its
document tabs, and the user layout was restored to all regions visible after acceptance. Follow-up
macOS visual evidence found the initial compact `72px` offset overlapping the traffic-light controls;
the control row now starts at `90px`, with the corrected offset covered by the focused style test.
