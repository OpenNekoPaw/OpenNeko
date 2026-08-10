# Verification

## Renderer Reload Surface Identity Handoff

Date: 2026-08-10

The renderer now treats `renderer-loading` as an identity fence. It invalidates pending Shell
projection work and unmounts the current Scene before package-owned Roots can issue requests with the
retired renderer identity. A matching same-document `renderer-ready` performs one canonical Shell
snapshot refresh; a new renderer document continues to use its normal initial snapshot. Resource
Browser owner validation remains strict and does not retry, rebase to an active Workspace or accept a
retired identity.

Deterministic verification passed:

- focused Desktop renderer and Resource Browser owner-identity suite: `2 files / 50 tests`;
- focused ESLint for the implementation and regressions;
- application boundaries: `1572` files, no findings;
- strict OpenSpec validation and `git diff --check`.

The Desktop package TypeScript check is currently blocked by unrelated in-progress Automation bridge
edits: `src/main/index.ts` imports the missing
`createDesktopAutomationHostPermissionPort`, while
`src/renderer/DesktopExtensionManagementSurface.tsx` installs a bridge without the newly required
`automationPermissions` member. This check is not counted as passed and task 14.3 remains open.

The isolated visible development Electron `canvas-openneko-consumer` run reached the canonical Canvas
and completed its EPUB, rich-text and connection checkpoints with zero console errors, warnings or
exceptions. It then failed on the existing Canvas-control hit-test assertion before Resource Browser,
Cut and renderer-reload checkpoints. The report is
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-10T00-07-11.438Z-canvas-openneko-consumer-development/report.json`; task 14.4 therefore remains open rather
than treating partial UI evidence as acceptance.

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
absent Home/raw-path/active-first-recent-Project fallback paths.

The Host focused regression additionally proves that Workspace Workbench mutations atomically update
the Scene Main/Timeline refs, exact request-owned projection advances both aggregates together, and startup
restoration rebuilds the Scene refs from the restored authoritative Workbench. The Desktop Resource
Browser regression proves that its controller authorization is derived from the exact Workspace Scene,
Agent View, Project and Tab identities; leaving that Scene fails closed even if the retired active target
still names the Project.

The stored-state startup regression additionally passed:

- `pnpm --filter @neko/host exec vitest run src/desktop-shell-state.test.ts` (`12 / 12`)
- `pnpm --filter @neko/app-desktop exec vitest run src/main/desktop-state-sqlite-integration.test.ts`
  (`9 / 9`)

These tests prove canonical `project-catalog`, `asset-catalog`, `extension-catalog` and
`assistant-resources` slots restore independently. A non-canonical Manager Surface remains untouched,
fails only at its exact Workbench instance boundary, and does not select a migration/compatibility path.

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
  removing only the Scene Main/Timeline refs and continuing exact request-owned projection;
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

## Same-Workspace Agent Surface Reuse

The current implementation covers the same-active-Workspace slice of tasks 11.4-11.6. Host tests
prove that opening a fresh draft for an already open Project, attaching its new conversation and
restoring a second conversation for the same exact `workspaceId` preserve the existing Project Tabs,
Workbench layout/revision and Main View identities. Only the Agent Scene phase and conversation
identity change. Renderer tests prove that both same-Workspace `AgentWebviewRoot` instances remain
mounted and switching changes only their `hidden` state; removed conversations are pruned and
cross-Workspace conversation identities are not retained in the active Workspace deck.

Main/preload projection tests additionally prove exact connection-scoped attachment ownership,
bounded retired endpoints and fail-visible forged attachment identity. Projection cleanup may use
its retired owning connection, while user business messages remain fenced to the exact active Scene.
This removes the prior endpoint mismatch without routing a hidden conversation through the visible
one.

The rebuilt packaged Electron scenario passed on 2026-08-05:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-05T10-08-20.185Z-desktop-workbench-scenes-packaged/report.json`

It completed Workspace activation/reload, Agent draft, Assistant activation/restore, management and
Preview checkpoints with `consoleErrors: []`, `consoleWarnings: []`, `exceptions: []` and
`poisonedRequestCount: 0`. A focused AppHost regression also proves that an Asset Center
`preview.detach` arriving after Scene exit still cleans up its exact runtime session but no longer
projects Preview state into the newly active Scene.

This was an intermediate checkpoint. Tasks 11.5 and 11.7-11.9 were subsequently implemented and
qualified; the final task 11.10 evidence and remaining cross-change gate are recorded below.

## Invalid Stored Desktop State Recovery

Task 11.3 now uses the Local Metadata repository as the only recovery boundary for an invalid
Desktop presentation authority. Normal reads remain strict. During explicit startup recovery, a
codec rejection atomically writes the exact original JSON and storage revision to
`desktop_application_state_quarantine`, then replaces only that authority with its canonical empty
state. Shell and Application Settings recover independently; quarantine or replacement failure still
rolls back and blocks startup.

Host projects the recovery as an owner-qualified, read-only startup diagnostic. Renderer acceptance
proves the new Entry Draft Workbench and Agent composer remain usable while the banner reports that
the old Workspace state was isolated and that Project, conversation and other data were not reset.
The bootstrap Main boundary now also constructs the minimal host projection explicitly, preventing
package-internal identity fields from crossing typed IPC.

Focused verification passed on 2026-08-05:

- Local Metadata: `21 files / 96 tests`, including exact JSON/revision retention and transactional
  rollback when quarantine storage is unavailable.
- Host: `37 files / 331 tests`, including valid sibling retention and startup diagnostic projection.
- Desktop focused: `5 files / 60 tests`, including Shell/Settings authority isolation, renderer
  warning presentation and strict bootstrap producer/consumer parsing.
- `@neko/local-metadata` typecheck, Host TypeScript check, Desktop typecheck, Desktop production
  package build, root `pnpm build`, root `pnpm test`, root `pnpm check`, `git diff --check` and
  strict OpenSpec validation passed.

A visible isolated Electron fixture started from the stable SQLite authority with one invalid Shell
child record carrying an unknown field. Startup completed without `Desktop startup failed`; the full
Workbench and Agent composer rendered under the record-local diagnostic. The stored invalid bytes
remained unchanged while valid sibling state restored. A separate normal Desktop cold start also
rendered the current persisted Workbench after clearing a stale generated Vite dependency cache; no
product data was deleted or migrated.

The repository-wide `pnpm check:quality` remains blocked at `check:no-internal-versioning` by 310
new audit-baseline occurrences across the broader in-progress Agent/Canvas/Host/Desktop worktree.
`pnpm check:legacy-debt` likewise reports the existing 208 blocking migration/current-bridge ledger
matches. No baseline or allowance was changed to mask either result; both are residual repository
gate work outside this focused recovery path.

## Task 11.10 Final Qualification Attempt

Date: 2026-08-06

The current Workbench implementation passed the focused and repository-wide executable gates:

- `pnpm typecheck`
- `pnpm build`, including the verified darwin-arm64 production package
- `pnpm test`
- `pnpm test:agent:eval` (`45 files / 290 tests`, `22 suites / 53 cases` dry-run)
- `pnpm check` (`check:unused` produced only 73 configuration hints; dependency scan found zero
  violations across 1426 modules and 4861 dependencies)
- `pnpm check:application-boundaries` (1454 files, zero findings)
- `git diff --check`
- strict validation for both `compose-desktop-workbench-scenes` and
  `remove-internal-versioning-and-product-migrations`

Current affected suite totals include Host `37 files / 332 tests`, Desktop `64 / 378`, Agent
Contracts `42 / 268`, Agent Runtime `116 / 1091`, Agent Webview `91 / 714`, UI `49 / 217`, Assets
Domain `17 / 140`, Assets Node `10 / 54`, Assets Webview `6 / 49`, Canvas Domain `28 / 256`, Canvas
Node `2 / 8` and Canvas Webview `61 / 337`. The large-file Assets Node and InputArea UI tests also
passed under the repository's standard concurrency after isolated reruns proved earlier failures were
parallel resource contention, not product behavior failures.

The rebuilt packaged executable has SHA-256
`c031715b2c770fdaa811ccf4671bee4073833f8e8dfe0055f85c546085bdc205`. Three fresh visible Electron
scenarios passed against that package:

- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-05T20-05-59.873Z-desktop-agent-provider-ui-packaged/report.json`
- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-05T20-06-13.938Z-desktop-workbench-scenes-packaged/report.json`
- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-05T20-06-27.202Z-canvas-openneko-consumer-packaged/report.json`

The visible Agent scenario used the actual composer and configured real provider/model, proved Entry
Draft materialization, transcript-scoped live execution state and a completed response, and recorded
zero console errors, warnings, renderer exceptions or poisoned requests. The Workbench scenario
covered Agent, Assets management + canonical Preview, Extensions, Projects, Settings, explicit
Workspace activation, display modes, exact recent Project restore, renderer reload, small-window
layout and Assistant session restore. The Canvas scenario covered two retained Canvas roots, node
authoring/inspection, video and audio playback, exact root/resource release, empty Main, application
restart restoration, resize and theme surfaces.

Packaged hidden real-provider Evaluation sample
`sample-e4d37cbfc97c15ce1637ed75` passed all seven hard gates for Pi runtime identity, canonical turn,
application/session-owner restart, SQLite conversation persistence, restored history, continuation,
terminal idle and non-empty final answer:

`reports/agent-eval/agent-runtime.workflow-controller/conversation-persistence-resume/sample-e4d37cbfc97c15ce1637ed75/`

The matrix aggregate is `non-comparable` only because the shard embeds a machine-specific absolute
result path; the sample outcome is `pass` with zero retries. A preceding development-lane attempt
completed the first turn, restart and second submit but lost its CDP target before terminal reading;
it is retained as `infrastructure-fail` and is not counted as Agent acceptance.

At that qualification point, task 11.10 remained open because repository quality gates were shared
with the active `remove-internal-versioning-and-product-migrations` change. On the
current combined worktree `pnpm check:quality` stops at 489 unapproved internal-versioning audit
occurrences, and `pnpm check:legacy-debt` reports 126 migration/current-bridge blockers. No baseline,
allowance or gate was weakened. All Workbench-specific executable evidence above passed, but the task
cannot be marked complete until that dependent change reaches its zero-unapproved-occurrence gate.

## Task 11.10 Combined Scenario Addition

Date: 2026-08-06

The registered visible scenario `desktop-workbench-retention-provider-ui` now composes the missing
acceptance matrix in one isolated Electron fixture: two Workspace projects, one real-provider
conversation per Workspace, background execution while Asset Management is active, Workspace
Resource Browser availability, one selected Canvas node/retained inspector per Workspace,
Workbench suspend/resume, renderer-network-offline local switching and full application restart.
It asserts two exact Workspace instances and two exact conversation owners before and after restart,
and resolves each provider response through its exact
`workspaceId -> conversationId -> agentSurfaceId` chain before checking the retained/restored Agent
Root. The Canvas assertion captures the exact Workspace A outer Root, proves there is only one such
View instance, verifies the same Root enters `suspended` with its heavy child removed while a
management Workbench is active, then verifies the same Root returns to `active` and restores the
selected node inspector. This replaces the earlier weak global-text check and incorrect expectation
of two DOM roots for one Canvas View.

Fixture self-tests, the shared runner discovery regression, scenario syntax/ESLint, focused Canvas
lifecycle tests and the Desktop production package build passed. The real scenario was retried after
these assertion corrections and stopped before Electron launch and before any API request because
this process did not provide
`OPENNEKO_AGENT_EVAL_PROVIDER_ID`, `OPENNEKO_AGENT_EVAL_MODEL_ID` and explicit cost authorization.
The scenario did not read or print configuration contents. Task 11.10 therefore remains open; the
historical single-feature Agent, Workbench and Canvas reports above are not promoted to combined
acceptance evidence. The current combined-worktree `pnpm check:quality` also remains blocked by 545
unapproved internal-versioning audit occurrences, while `pnpm check:legacy-debt` reports 52 blocking
current-bridge/migration occurrences. A targeted audit reported no occurrence in the new retention
scenario, ErrorBoundary, Entity read-isolation, fixture-queue or offline-repair files.

## Invalid Persisted Agent Surface Recovery

Date: 2026-08-06

Task 11.11 qualifies persisted session Agent Surfaces before renderer bootstrap. The Host now removes
only a Surface whose exact `conversationId + owner` is absent from the canonical Agent Home catalog,
retains valid sibling Surfaces and Workbenches, and activates a fresh draft under the same
AssistantSpace or Workspace owner when the rejected Surface was active. Bootstrap remains strict and
does not provide an active/recent Conversation fallback.

Focused verification passed on the final Surface-recovery and launch-identity path:

- Host startup/recovery regressions: `2 passed | 37 skipped`. This includes a new Window claim before
  renderer-session establishment: `emitAll` now projects only to Window runtimes with an exact claimed
  renderer session, while snapshot, mutation and IPC paths continue to reject a missing or stale
  `rendererSessionId`.
- Desktop AppHost, preload launch bridge, retained Agent Surface, renderer startup and i18n: `5 files /
62 tests`.
- Agent launch runtime exact-Surface isolation: `1 file / 4 tests`; Agent launch/Home contracts: `3 files
/ 10 tests`.
- Earlier full focused runs before unrelated concurrent repository-signature edits: Host `39 tests`,
  Host full `37 files / 333 tests`, Desktop AppHost + renderer `2 files / 46 tests`, Agent catalog
  `24 tests`, combined i18n/renderer/Host `3 files / 56 tests`, Agent Evaluation key-free `45 files /
290 tests`, dry-run `22 suites / 53 cases`, application boundaries `1446 files / 0 findings`,
  `git diff --check` and strict OpenSpec validation.

The real local SQLite authority contained four Conversation rows. Their `context_json` SQLite
SHA3-256 values after recovery exactly matched the startup baseline (`3C11082D...`, `04962F24...`,
`BF98C302...`, `D2C9854E...`), proving the recovery did not migrate, delete or rewrite Conversation
authority.

A fresh development Electron run rebuilt Main, preload and renderer together, initialized Host ports,
claimed the Window and loaded the renderer without `bootstrap does not match`, `Agent launch attach
does not match`, `Agent launch Host payload contains unsupported fields` or renderer bootstrap
exceptions. Launch attachment now qualifies the retained hidden Agent Root by exact Window + Workbench

- Agent Surface identity instead of requiring the active Scene; a forged Surface remains
  `desktop-agent-identity-mismatch`. The visible Workbench remained usable under the localized
  invalid-state banner. With the application locale following `zh-CN`, the banner rendered Chinese;
  changing Settings to English updated the same banner and Settings Surface immediately. Reloading the
  renderer while Settings was active restored Settings and the hidden Agent Root without launch,
  bootstrap or attachment identity errors; restoring system language returned the interface to Chinese.
  The raw Host diagnostic remained available only as supplemental `title` text.

The current full Host run is `330 passed / 3 failed`: the remaining assertions still expect the
superseded numeric or fixture-provided `viewInstanceId` instead of the current owner-generated identity.
They are outside persisted Agent Surface recovery, and the focused recovery/startup path is green.
Task 11.10 remains open for that repository-wide convergence and its combined
multi-Workspace/provider/Canvas acceptance.

## Management Main Minimum Width

Date: 2026-08-06

Task 11.12 changes only management/detail split ownership. Assets, Extensions and Projects now start
at `0.5`; the management resize binding uses `0.5` as its minimum while ordinary Workspace Main
splits retain their existing limits. Renderer tests cover the equal default, the minimum boundary and
the no-Secondary-Main full-width case.

The visible development Electron `desktop-workbench-scenes` run recorded the following isolated
checkpoints before an unrelated later Assistant fixture failure:

- 1440x960 default: management `536px`, Preview `526px`, ratio `50%`, no overlap.
- Drag right: management `728.95px`, Preview `333.04px`, ratio `68%`.
- Drag left toward `34%`: clamped to management `536px`, Preview `526px`, ratio `50%`.
- 1040x700 compact: management `336px`, Preview `326px`, ratio `50%`, no overlap.

The report is
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-06T10-41-35.232Z-desktop-workbench-scenes-development/report.json`.
It recorded zero renderer exceptions, console errors, console warnings and poisoned resource requests.
The overall scenario later failed because its isolated Agent configuration projected no available
model and an Extension Management request no longer matched the active Agent Scene; that later failure
does not invalidate the already committed large/compact management-layout checkpoints and is not
counted as Agent acceptance.

## Entry Target Commit-On-Submit Verification

Date: 2026-08-07

The final deterministic implementation and quality gates passed:

- Agent Draft contract `1 file / 5 tests`; Agent Runtime controller `3 files / 10 tests`.
- Agent Webview composer/controller/presenter `3 files / 121 tests` and package type build.
- Desktop typecheck plus AppHost, launch/bridge/controller, preload and renderer coverage `7 files /
78 tests`.
- Headless Desktop functional coverage `11 files / 128 tests`.
- Agent Evaluation key-free harness `44 files / 285 tests`; all-suite dry-run `22 suites / 52 cases`.
  These are harness and deterministic workflow evidence, not real-provider behavior acceptance.
- `pnpm check:unused` completed with configuration hints only; `pnpm check:legacy-debt` passed with
  zero blocking production occurrences; full `pnpm check:quality` passed, including internal
  versioning, canonical-path, package/application/Agent/Webview boundaries, strict TypeScript,
  storage authorities, test orchestration and all strict OpenSpec validation.
- `git diff --check` and the Desktop functional scenario syntax check passed.

Visible development Electron evidence:

- `desktop-conversation-navigation` passed through the actual Entry composer, created exactly one
  Assistant Conversation only after send, projected the running state, retained the unified composer
  shell, restored conversation-only mode/approval/command/usage controls, and reopened the exact
  Conversation after visiting management navigation. Report:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-07T14-08-19.545Z-desktop-conversation-navigation-development/report.json`.
- `desktop-workbench-scenes` rendered and asserted both `1440x960` and `1040x700` Entry layouts before
  its adjacent management stage. Both layouts show one centered empty state and composer, the
  bottom-toolbar `打开项目` selector and model configuration, with no Session mode, execution mode,
  command/Skill shortcuts, usage indicator or top Workspace divider. Screenshots:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-07T14-04-37.001Z-desktop-workbench-scenes-development/screenshots/03-agent-only-large.png`
  and `04-agent-only-small.png` in the same directory. The overall scenario remains failed because
  the pre-existing Assets management + Preview assertion requires non-`none` shadows while both
  independent shells currently render `none`; that unrelated assertion was not weakened.

The current darwin-arm64 production package built and its canonical executable was verified. Packaged
`desktop-conversation-navigation` did not produce complete acceptance: one attempt materialized the
Assistant session and submitted transcript but missed the short-lived running selector, and two
subsequent attempts exceeded the runner's 120-second scenario limit. These attempts remain
infrastructure failures, not passing evidence. The current process also has no explicit provider,
model and cost authorization, so no real-provider run was started and no model-quality claim is made.
Task 12.8 remains open for packaged and authorized real-provider closure.

## Workspace Directory First-Submit Regression

Date: 2026-08-07

The visible Entry composer path initially reproduced the production failure after selecting a
directory: lifecycle session materialization attempted to resolve the new Workspace through the
Project catalog before the first-submit Shell commit had created that Project. The materializer now
resolves the exact live `workspaceGrantId + workspaceId` through the Host grant authority; Project,
Tab and Workspace Scene composition still occurs only after lifecycle commit and exact conversation
materialization succeed.

Focused deterministic verification passed:

- Host grant and Shell coverage: `2 files / 52 tests`; full Host: `36 files / 287 tests`.
- Desktop AppHost: `1 file / 37 tests`; full Desktop: `67 files / 421 tests`.
- Headless Desktop functional coverage: `11 files / 129 tests`.
- Agent Contracts `42 files / 263 tests`, Agent Runtime `109 / 984` and Agent Webview `89 / 698`.
- Desktop and Host TypeScript checks, application boundaries (`1428 files / 0 findings`), legacy
  debt (`0` blocking), `git diff --check`, strict OpenSpec validation and the Agent Evaluation
  key-free harness (`44 files / 285 tests`, `22 suites / 52 cases`) passed. Key-free evidence does
  not represent real-provider acceptance.

The isolated visible development Electron scenario exercised the actual composer controls. Its first
directory action cancelled without mutation; the second selected `workspace` while preserving the
same unbound Scene and leaving Project, Tab and Conversation counts at zero. Sending from that exact
draft created one Project, one Tab and one Conversation, retained the same `draftId`, activated the
Workspace session with Main and Resources, and made exactly one functional-provider request. The run
recorded no console errors, warnings, renderer exceptions or poisoned requests:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-07T15-56-00.925Z-workspace-directory-first-submit-regression-development/report.json`

Both captured states were inspected directly. The selected-target Entry remained centered and
Agent-only; the committed screenshot displayed the exact user message, provider response, Workspace
Main and Resource Browser. The narrow Workspace Agent composer shows existing dense toolbar
truncation in the committed screenshot; this fix changes submission ownership rather than layout, so
that advisory visual issue remains outside this regression. Packaged and explicitly authorized real
provider coverage remains part of open task 12.8.

## Canvas Selected Node Without Property Dock

Date: 2026-08-08

`@neko/canvas-webview` remains the browser presentation owner. The canonical public Canvas Root,
Canvas store and node-local selection controls are unchanged; the removed path was only
`selected node -> CreativeWorkbenchShell.rightDock -> PropertyPanel`. No Desktop contract, host
resource lifecycle, persisted Canvas facts or user data shape changed.

Deterministic verification passed:

- `pnpm --filter @neko/canvas-webview test`: `57 files / 326 tests` after removing the obsolete
  PropertyPanel/PortEditor implementations and their test-only coverage.
- `pnpm --filter @neko/canvas-webview build`.
- `pnpm check:application-boundaries`: `1428 files / 0 findings`.
- `pnpm check:unused`; the removed panel entries were also deleted from `knip.config.ts`.
- `pnpm test:local:ui:contract` and
  `pnpm exec openspec validate compose-desktop-workbench-scenes --strict`.
- `git diff --check` and the Canvas Desktop scenario syntax check.

The isolated visible development Electron run selected the video node through user-operable Canvas
controls and recorded `nodeLocalActionCount: 3` with `propertyDockCount: 0`. Direct inspection of
`screenshots/02-canvas-node-selected-without-property-dock.png` confirmed a continuous Canvas layout
without the former property column, blank reserved space, clipping or overlap; the expected Workspace
Resource dock remained visible. Clearing selection removed the node-local actions, and the adjacent
storyline/media playback, View teardown, restart restoration and Resource dock checkpoints completed.

The report is
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-07T16-38-30.830Z-canvas-openneko-consumer-development/report.json`.
The overall UI result remains failed because the run observed four `Canvas Webview Host is disposed`
renderer exceptions from the Canvas operation/host-message path. That stack does not traverse the
removed right-dock path, but runtime diagnostics are fail-visible and therefore the complete UI
scenario is not reported as passed. A compact selected-node screenshot was not executed separately.

## Workspace Resize And Compact Conversation Composer

Date: 2026-08-08

Host Workbench mutation now derives its optional Project attachment from the exact current Workspace
Scene rather than the legacy navigation target. Non-Workspace Scene layout commits remain Window
owned; Workspace Views are still rejected when their Project or Workspace identity differs from the
active Scene. The package-owned Desktop dock presentation omits its empty session Header and uses a
compact conversation composer without the locked Workspace label, Agent mode selector or `/` and
`$` shortcut buttons. This Workbench evidence does not establish Draft/Session command or Skill
availability; that behavior is owned and must be verified by `unify-agent-launch-and-domain-bindings`.
No Desktop Shell CSS or `.project-dock-panel` chrome was changed.

Deterministic verification passed:

- Host: `36 files / 287 tests`; Agent Webview: `89 files / 700 tests`; Desktop: `67 files / 421 tests`.
- Headless Desktop functional coverage: `11 files / 129 tests`.
- Host TypeScript, Agent Webview build, Desktop typecheck, application boundaries, legacy debt,
  `check:quality`, `git diff --check` and strict OpenSpec validation.
- Agent Evaluation was excluded because provider selection, prompts, capabilities, session/turn
  behavior and Desktop Agent event projection were unchanged.

Visible development Electron evidence passed through the native directory picker, exact Workspace
Scene activation and both user-operable dock resize handles. Agent width changed from `360` to `494`
and Resources width from `320` to `520`; the Workbench and Workspace identities remained exact, with
no alerts, console errors, warnings or Renderer exceptions. Direct screenshot inspection confirmed
the Agent and Resources Shells retained four `1px` borders, `18px` radius and hidden overflow without
clipping or overlap. Report:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-07T16-46-41.879Z-desktop-workspace-resize-development/report.json`

The focused Assistant conversation scenario also passed with no inner Header divider and a compact
session composer while preserving the Shell's four borders and radius:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-07T16-39-00.768Z-desktop-conversation-navigation-development/report.json`

The broader `desktop-workbench-scenes` run remains failed before reaching Workspace because its
existing management + Preview assertion requires a non-`none` shadow while both independent shells
currently render without shadows. That unrelated assertion was not weakened. Packaged and explicitly
authorized real-provider coverage remains part of open task 12.8.

## Main-Below Cut Panel

Date: 2026-08-08

Workspace Main now keeps Canvas, file Preview or Editor in the upper area while a separately resizable
Cut Panel occupies the lower area. The canonical Host layout stores only lightweight Cut View refs,
active View identity, presentation and height. Cut Views are rejected from Main, Main Views are
rejected from the Cut Panel, and the Scene projects only the active owner-qualified `workspace-cut`
Surface. Opening an OTIO document focuses a Cut Panel tab without replacing the active upper Main.
Only the active Cut Root mounts; hiding the panel or switching tabs unmounts the prior Root. The
package-owned Cut Root composes Preview above Timeline and remains the single target for authorized
Workspace resource drag payloads.

Deterministic verification passed:

- Host Workbench/Scene/Shell: `3 files / 66 tests` plus direct TypeScript check.
- Shared Workbench: `2 files / 13 tests` plus `@neko/ui` TypeScript check.
- Cut Webview: `33 files / 248 tests` plus TypeScript build.
- Desktop Cut/Shell/styles/boundaries: `4 files / 74 tests` plus Desktop typecheck.
- Desktop functional runner contract: `14 tests`.
- Application boundaries: `1449 files / 0 findings`; legacy debt: `0` blocking findings; unused
  analysis, focused ESLint, `git diff --check` and strict OpenSpec validation also passed. Focused
  ESLint retained nine existing Cut warning-level findings and reported no errors.

The authoritative visible development Electron scenario passed through native playback, midpoint
seek, dirty export/reopen, three OTIO tabs, complete panel hide/restore, trusted Workspace resource
drag/drop and a `1280x760` compact layout. Hiding the panel increased upper Main height from `362` to
`782`, removed every Cut Root, and preserved the exact Canvas Main View. Dragging
`motion-with-audio.mp4` added exactly one clip (`3 -> 4`) without changing sibling Cut tabs. The run
recorded no console errors, warnings, Renderer exceptions or poisoned requests:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T03-41-17.886Z-cut-openneko-consumer-development/report.json`

All seven screenshots were inspected directly. The large and compact states keep Canvas above the
Cut Panel, Preview above Timeline, OTIO tabs within the panel, and Resource management as an
independent right panel without overlap or clipping. The hidden state gives the reclaimed height to
Canvas and contains no hidden Cut UI. The black Preview in tab-return/resource-drop captures is the
document's settled zero-time frame; current midpoint captures and runtime media-time evidence show
the decoded video frame separately. UI validation result: passed. Packaged coverage remains part of
open task 12.8 and the independent top-chrome control qualification remains task 12.10.

## Workspace Top Chrome Controls

Date: 2026-08-08

Workspace-only Agent, Main, Cut Panel and Resource management presentation controls now occupy a
zero-height absolute overlay in the existing `ControlledWorkbenchShell.titleBar` chrome. The
PrimarySidebar keeps only its own visibility control. Resource management no longer exposes a second
close action in its panel header; the top Resource management toggle is the single presentation
command and does not mutate resource facts or sibling Workbench regions. The controls follow the
visible spatial order Agent, Main, Cut Panel and Resource management. Selection is a read model of
the exact Scene slot plus current layout presentation; a hidden region is unselected, while an
attached hidden Cut View remains enabled for restoration.

Deterministic verification passed:

- Desktop Shell and renderer styles: `2 files / 46 tests`; DesktopApplication: `1 file / 29 tests`.
- Host Workbench contract: `1 file / 9 tests`; direct Host TypeScript check.
- `@neko/ui` TypeScript check and Codicon public/style coverage: `2 files / 2 tests`.
- Focused ESLint and Prettier checks, application boundaries (`1436 files / 0 findings`), legacy debt
  (`0` blocking), `git diff --check` and strict OpenSpec validation.
- The Desktop renderer structure test asserts that the resource panel header has no
  `Close resource management` action. The isolated Electron scenario also rejects either the English
  or Chinese close control before continuing through Resource Browser facets.
- Desktop typecheck, the UI validation Skill self-test (`6 tests`), Cut/Desktop functional scenario
  syntax checks, `git diff --check` and strict OpenSpec validation passed.

The current Cut development Electron run reached the exact Workspace controls and recorded
`controlOrderCorrect: true` for `agent -> main -> cut-panel -> management` and
`controlStateTracksPanel: true`. Cut was selected while docked, became unselected but remained enabled
after hiding, and returned to selected after restoration. Hiding removed the Cut Root, increased Main
height from `362` to `782`, and retained the exact active Canvas View. The run recorded no console
errors, warnings, Renderer exceptions or poisoned requests. Direct pixel inspection of the hidden
and restored screenshots confirmed that Cut changes from a muted unselected icon to the selected
foreground/background, the four controls remain aligned in the existing chrome, and they do not
overlap the Resource management title:

- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T06-02-22.480Z-cut-openneko-consumer-development/screenshots/03-cut-panel-hidden.png`
- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T06-02-22.480Z-cut-openneko-consumer-development/screenshots/04-cut-qualification-tab-visible.png`

The task-specific Cut control acceptance passed, but overall advisory UI validation remains blocked
for the complete four-control matrix. `desktop-workbench-scenes` stopped before Workspace because an
existing management + Preview assertion still requires panel shadows, while the current shells use
`box-shadow: none`. `desktop-workspace-resize` reached Workspace but stopped at its pre-existing dock
resize assertion before exercising display modes. A second Cut run completed the control checkpoint
but later failed its unrelated trusted media interaction assertion; the immediately preceding full
Cut run passed the same native playback/seek path. These failures were preserved rather than weakened.
Direct inspection of the adjacent `1280x760` Cut screenshot also shows dense spacing between the
playback time output and volume controls; it does not affect the top control order or selection state
and remains a separate Cut presentation follow-up.
Reports:

- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T05-46-52.639Z-desktop-workbench-scenes-development/report.json`
- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T05-47-54.706Z-desktop-workspace-resize-development/report.json`
- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T05-56-36.412Z-cut-openneko-consumer-development/report.json`
- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T06-02-22.480Z-cut-openneko-consumer-development/report.json`

## Unnamed Cut Draft

Date: 2026-08-08

Risk classification: L4 core creative workflow. `@neko/cut-domain` owns the canonical empty OTIO
model, dirty state and document identity; `@neko/cut-node` owns the exact draft session, Save As
rebind and release lifecycle. Desktop Main remains the Electron trust adapter for sender-bound IPC,
Workspace path authorization and native dialogs. Preload validates the canonical request and result
shape, while renderer only submits the exact Workbench intent and renders the returned projection.
The Workbench retains a lightweight Cut View ref and does not become a second document authority.

When a Cut-capable Workspace has no Cut tab, its unselected Cut control now creates one unnamed
in-memory draft and opens the existing Main-below Preview + Timeline composition. Concurrent create
requests converge on the same opening operation. No `.otio` file is created until the first save;
Save As accepts only a normalized `.otio` target inside the exact Workspace, rebases media refs,
writes through the authorized Workspace writer and rebinds the same session/View to the saved
document identity. Cancelling the picker keeps the exact draft. Closing a dirty draft requires the
native discard adapter; cancellation keeps it and confirmation removes only that View/runtime.
Missing Save As or discard adapters now fail visibly instead of looking like user cancellation.

Deterministic verification passed:

- Cut domain: `51 tests`; Cut Node: `17 tests`; Cut Webview: `248 tests`.
- Desktop Cut contract/runtime/Shell: `3 files / 42 tests`; Desktop typecheck.
- Cut domain, Node and Webview TypeScript checks.
- Application boundaries: `1446 files / 0 findings`; legacy debt: `0` blocking findings; unused
  analysis completed with only existing configuration hints.
- `git diff --check` and strict OpenSpec validation.

The authoritative visible development Electron scenario passed and recorded one active empty Cut
Root, a selected Cut control, canonical empty OTIO tracks with no synthetic empty-state overlay,
panel hide/restore, multiple OTIO tabs, trusted Workspace resource drag/drop, native media
playback/seek and export, with no console errors, warnings or Renderer exceptions:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T06-51-04.892Z-cut-openneko-consumer-development/report.json`

The empty-draft screenshots were inspected directly. At the large viewport and `1280x760`, Preview
remains above Timeline, the ordinary ruler, empty track, playhead and track controls retain their
existing geometry, and no additional title, guidance text or overlay covers the Timeline. The
selected control matches the actual docked panel. This corrective evidence supersedes the earlier
`06-33-29.014Z` screenshots, which exposed the removed synthetic empty-state presentation:

- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T06-51-04.892Z-cut-openneko-consumer-development/screenshots/01-cut-empty-draft.png`
- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T06-51-04.892Z-cut-openneko-consumer-development/screenshots/02-cut-empty-draft-compact.png`

Focused UI states passed, but the advisory UI inventory remains partially unexecuted: this Electron
scenario did not exercise the native first-save picker or dirty-draft discard dialog. Their owner,
cancel and success behavior is covered by focused Main/runtime tests, not graphical evidence. A full
Desktop test run also retains an unrelated Agent Draft first-submit expectation that conflicts with
the current automatic Assistant binding; it was not changed for this Cut work. Packaged Desktop
coverage remains part of open task 12.8.

Residual risk: an unnamed draft is intentionally process-memory authority until Save As. Its View ref
can outlive a renderer Root, but an abnormal full application-process exit has no Cut-owned shadow
document recovery in this slice. Adding crash recovery requires a separate Cut persistence design
that preserves the no-premature-OTIO-file rule and does not turn Workbench presentation into document
authority.

## Cut Tab Quick Add And Sticky Ruler

Date: 2026-08-08

The existing Cut tab row now owns a compact `+` command after `WorkbenchEditorTabs`. It calls the
same sender-bound Cut draft creation path as the empty-panel control, while the top Cut Panel control
continues to hide or restore an existing panel. Each completed request creates and selects a new
exact in-memory draft with a non-conflicting localized label; requests concurrent for the same exact
Window/Workbench still share one opening operation. Save As derives its suggested filename from the
exact draft View label. No renderer document, placeholder Timeline or premature `.otio` file was
introduced.

The canonical Timeline ruler row is sticky at the top of its existing scroll container. It remains
in the same horizontal coordinate space as tracks and clips; no second overlay ruler or alternate
empty Timeline presentation exists.

Deterministic verification passed:

- `pnpm --filter @neko/cut-webview test`: `33 files / 248 tests`.
- `pnpm exec vitest run src/main/desktop-cut-runtime.test.ts src/renderer/DesktopShell.test.tsx src/renderer-styles.test.ts` from `apps/neko-desktop`: `3 files / 61 tests`.
- Desktop and Cut Webview TypeScript checks; functional scenario syntax check.
- Application boundaries: `1446 files / 0 findings`; legacy debt: `0` blocking findings; unused
  analysis completed with only existing configuration hints.
- `git diff --check` and strict OpenSpec validation.

The visible development Electron scenario passed with no console errors, warnings or Renderer
exceptions:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T07-07-46.436Z-cut-openneko-consumer-development/report.json`

It records two unique unnamed tabs (`未命名剪辑`, `未命名剪辑 2`), the second tab selected, one active
Cut Root, canonical empty OTIO tracks, no synthetic empty overlay, and the ruler still visible and
pinned to the scroll viewport top at `scrollTop = 120`. The large and `1280x760` screenshots were
inspected directly: the `+` remains at the tab row's right edge without adding a header, overlapping
the tab title, or conflicting with Workbench and Resource controls.

Residual risk remains unchanged from the unnamed draft slice: native Save As and dirty-discard
dialogs are covered by focused Main/runtime tests rather than this graphical scenario, and abnormal
process exit does not recover an unsaved in-memory draft.

## Expired Cut Draft Presentation Recovery

Date: 2026-08-08

The missing default Video track and `realpath .../cut-draft:*` close failure were traced to one
expired Workbench presentation ref retained after its unnamed in-memory Cut session ended with the
previous application process. The canonical Cut document factory still created `Video 1`; no OTIO
track implementation had been removed.

Desktop Shell startup now removes only expired `cut-draft:*` Views from the active Workbench and all
Project presentation snapshots before Scene composition. A real OTIO sibling is preserved and
selected, or the Cut Panel returns to its canonical absent state. The projection reports a
`desktop-presentation-reset` warning with exact removed View identities. Cut Node rejects any missing
draft session before file authorization, and Desktop close can remove an already-projected expired
View without resolving it as a Workspace path. No real OTIO, Project, Canvas, Resource or user file
is modified, and no empty replacement document is fabricated.

Verification passed:

- Host Shell service/contract: `2 files / 66 tests`, including full restart, real OTIO sibling
  preservation, persisted presentation cleanup and canonical diagnostic parsing.
- Cut Node runtime: `1 file / 8 tests`; expired draft does not call file authorization.
- Desktop Cut runtime: `1 file / 14 tests`; expired View close does not request a Cut View grant.
- Host, Cut Node and Desktop TypeScript checks.
- Package/application boundaries, package product reachability and legacy-debt gates; unused analysis
  completed with only existing configuration hints.
- Strict OpenSpec validation and `git diff --check`.

The visible development Electron scenario passed and the active second `+` draft recorded
`defaultVideoTrack: true`, one active Cut Root, canonical empty tracks and no synthetic overlay, with
no console errors, warnings or Renderer exceptions:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T07-21-59.983Z-cut-openneko-consumer-development/report.json`

The `03-cut-empty-draft-added.png` screenshot was inspected directly and shows the default Video
track header controls below the ruler. Residual risk is explicit: an unsaved draft's document content
cannot be recovered after abnormal process exit; startup removes only its stale presentation ref and
reports that reset rather than pretending the content survived.

## Cut Save Control And Shortcut

Date: 2026-08-08

The active Cut Root now exposes one icon-only save command in the existing Timeline toolbar. The
button and package-owned `Cmd/Ctrl+S` binding both call the same guarded
`CutOtioController.save()` entry and emit no command without an active document projection. No
Workbench header, Desktop save implementation or alternate document route was added. Unnamed drafts
continue through the existing Workspace-scoped native Save As adapter and exact identity rebind;
cancelling destination selection keeps the same dirty draft, View and session.

Deterministic verification passed:

- `pnpm --filter @neko/ui test`: `49 files / 214 tests`; UI TypeScript check.
- `pnpm --filter @neko/cut-webview test`: `33 files / 251 tests`; Cut Webview TypeScript check.
- `pnpm --filter @neko/app-desktop test`: `70 files / 453 tests`, including the new Save As
  cancellation boundary; Desktop TypeScript check.
- Functional scenario syntax check and `git diff --check`.

The authoritative visible development Electron scenario passed with no console errors, warnings or
Renderer exceptions:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T08-02-30.736Z-cut-openneko-consumer-development/report.json`

It records a localized enabled save control at `26x26`, a shared `codicon-save` glyph, a trusted button
click and trusted `Meta+S`; each entry caused a separate canonical OTIO file write. The current
large, `1280x760` and dense populated Timeline screenshots were inspected directly. The save icon
remains aligned between the track-entry and edit groups, does not collide with Export, does not wrap
or clip, and introduces no additional chrome:

- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T08-02-30.736Z-cut-openneko-consumer-development/screenshots/01-cut-empty-draft.png`
- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T08-02-30.736Z-cut-openneko-consumer-development/screenshots/02-cut-empty-draft-compact.png`
- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T08-02-30.736Z-cut-openneko-consumer-development/screenshots/09-cut-resource-dropped.png`

Advisory UI residual: direct graphical cancellation of the macOS native Save As sheet remained
blocked because Computer Use could not distinguish the isolated Electron process from an existing
OpenNeko process sharing the same bundle identity. No action was taken in the existing user window;
all temporary processes and fixture data were removed. Cancellation is covered at the owning
Desktop runtime boundary and preserves the exact draft. Packaged Electron coverage remains part of
open task 12.8.

After a development Electron instance exposed an ESM load failure for a newly added `SaveIcon`
barrel export, the control was switched to the already-public `toCodiconClassName('save')` mapping.
This keeps the save glyph inside the shared UI icon system while avoiding a new runtime export that
an existing Vite/Electron module graph can retain incorrectly. The focused UI/Webview tests and real
Desktop Cut load scenario were rerun after the correction.

The isolated development fixture reached the corrected Cut Root and recorded `saveControlVisible:
true`, `saveControlIcon: true`, an enabled `26x26` button, trusted click and `Meta+S` input, and two
separate persisted writes before later failing an unrelated paused-preview request/PCM retirement
timing check:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T10-31-44.337Z-cut-openneko-consumer-development/report.json`

The new `01-cut-empty-draft.png`, `02-cut-empty-draft-compact.png` and
`03-cut-empty-draft-added.png` artifacts were inspected directly. The corrected glyph is visible in
the existing toolbar at wide and compact sizes without overlap, clipping or extra chrome. The focused
module-load/save acceptance therefore passed; the complete adjacent media scenario remains failed on
the separately recorded PCM seek defect and is not presented as a successful end-to-end run.

## Full-Bleed Workbench Panels And Native Title Controls

Date: 2026-08-08

Window-level Main, Interaction and Manager panels now fill their complete Workbench grid tracks.
Desktop decorative Main margins, dock padding and responsive insets were removed while panel-owned
borders/radii, package-owned content padding and the management/Preview resize gutter remain. The
Workspace region controls retain the macOS-aligned title overlay at `top: 4px`, `right: 8px`, with a
`28px` height; they do not add a grid row or move the underlying panel viewport.

Deterministic verification passed:

- Focused Desktop renderer style/Shell suite: `2 files / 50 tests`.
- Desktop TypeScript check; focused ESLint; functional scenario syntax check; Prettier check.
- Strict OpenSpec validation and scoped `git diff --check`.

The isolated visible development Electron Workspace scenario passed. It exercised Agent/Main/
management hide and restore, Agent and resource resize, and every control selected state. Each state
kept the controls inside the title chrome and outside Main tabs. Main/Interaction margins and both
Dock paddings were `0px` on all sides; no panel crossed the `1440px` viewport. The Cut control stayed
unselected and enabled for exact draft creation when no Cut View existed. No console error, warning
or Renderer exception was observed:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T10-45-07.047Z-desktop-workspace-resize-development/report.json`

The current full Workbench run captured and structurally accepted Entry at `1440x960` and
`1040x700`, Assets management, Assets + Preview, Extensions, Projects and Settings before a later
unrelated Resource Browser chrome assertion stopped the scenario. Every captured scene reported all
four top-level inset groups as `0px`. Assets + Preview retained a `10px` gutter and independent,
non-overlapping sibling shells. The screenshots were inspected directly: panel borders remain inside
their full-bleed boxes, package content spacing remains readable, and no content or control overlaps
the native title area:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T10-47-50.279Z-desktop-workbench-scenes-development/report.json`

The scoped UI inventory passes. The complete adjacent scenario remains failed outside this layout
slice because the current Workspace Resource Browser exposes one initial-library control while its
fixture expects none; its report contains no console error, warning or Renderer exception. The full
Desktop Vitest run also has two unrelated content-effects fixture failures because expected project
file rows omit the newly projected `mediaType` field (`453/455` tests passed). Neither failure was
hidden or changed as part of the panel geometry work. Packaged Electron coverage remains part of open
task 12.8.

## Square Workbench Panel Boundaries

Date: 2026-08-08

The full-bleed top-level Workbench shells now use square outer boundaries. Main, Interaction, Manager,
independent Preview/Detail, docked/overlay panels and responsive overlay variants all compute
`border-radius: 0`; their existing borders remain visible. Package-owned composer, cards, inputs,
buttons and other internal components retain their own radii. The Assets Management/Preview split also
retains its functional `10px` resize gutter.

The Workspace title controls remain an overlay aligned to the macOS title chrome at `top: 4px`,
`right: 8px` and `height: 28px`. Removing the outer panel radius does not add a title row, change the
overlay geometry or move the underlying package viewport.

Deterministic verification passed:

- Focused Desktop renderer style/Shell suite: `2 files / 50 tests`.
- Desktop TypeScript check; focused ESLint; functional scenario syntax check; Prettier check.
- Strict OpenSpec validation and scoped `git diff --check`.

The authoritative visible development Electron Workspace scenario passed Agent/Main/management hide
and restore plus Agent/resource resize. Agent and Resources panels both reported `borderRadius: 0px`
and retained `1px` borders. The overlay controls remained inside the title chrome and outside Main
tabs, with no console error, warning or Renderer exception:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T11-22-23.973Z-desktop-workspace-resize-development/report.json`

The current full Workbench run captured and structurally accepted Entry large/small, Assets
management, Assets + Preview, Extensions, Projects and Settings. Every captured top-level shell
reported `borderRadius: 0px` and zero outer margin/padding; Assets + Preview retained the `10px`
gutter and non-overlapping sibling boundaries:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T11-23-14.847Z-desktop-workbench-scenes-development/report.json`

The current screenshots from both scenarios were inspected directly. The outer Workbench panels meet
the window and sibling boundaries with square edges, while internal component radii remain intact and
the native-aligned overlay does not overlap tabs or content. The full adjacent scenario remains failed
after those accepted checkpoints because the existing Resource Browser fixture expects no
initial-library control but observes one (`refreshCount: 0`, `initialLibraryControlCount: 1`,
`panelCloseCount: 0`). This unrelated behavior was not changed or hidden. Packaged Electron coverage
remains part of open task 12.8.

## Workspace Main Tab And Resource Header Alignment

Date: 2026-08-08

The Workspace Main View tab strip and adjacent Resource management header now consume one
Desktop-owned `38px` panel chrome height. The Desktop scope overrides only the shared editor strip's
height and vertical padding inside `.project-main-group__tabs`; the `@neko/ui` editor-tab default for
other consumers remains unchanged. The existing `30px` tab stays vertically centered, and the
macOS-aligned Workspace control overlay remains independent from panel chrome sizing.

Deterministic verification passed:

- Focused Desktop renderer style/Shell suite: `2 files / 52 tests`.
- Desktop TypeScript check and functional scenario syntax check.

The authoritative visible development Electron Workspace scenario passed after Agent/Main and
Main/Resources resize plus all panel hide/restore cycles:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T11-43-31.934Z-desktop-workspace-resize-development/report.json`

Its computed evidence reports `mainHeaderHeight: 38`, `mainTabsHeight: 38`,
`resourceHeaderHeight: 38`, `topDelta: 0` and `bottomDelta: 0`, with no console errors or warnings.
The current `01-workspace-resize-draft-mention.png`, `02-workspace-resized-shell-chrome.png` and
restored-state screenshots were inspected directly: the Main tab strip and Resource title chrome
share aligned top and bottom edges, the tab label and close target fit, and the Workspace title
controls do not overlap them.

Supplemental compact geometry also reported the same `38px` heights and zero deltas in
`2026-08-08T11-45-51.112Z-desktop-workspace-resize-development`, but its screenshot did not visibly
contain the Resource overlay and is therefore not counted as compact visual acceptance. A later
optional retry stopped on the scenario's existing resize-drag nondeterminism, and another lost the
Desktop CDP connection. Compact graphical acceptance remains unclaimed; neither failure changed the
focused code gate or the successful wide-window evidence matching the reported defect.

## Cut Save As And Representation Race Qualification

The Cut draft Save As path now revalidates the exact renderer, Workbench and draft View after the
native picker returns. Its package-owned result carries the event sequence already published by the
identity rebind, and preload moves the current identity, listener identity and cursor together. If a
Shell update fails after the authorized file write, Desktop preserves the file, releases the now
unreachable session and reports that the saved file must be reopened from Resources.

Clip representation requests now retain request-to-key ownership. Overlapping resize/scroll batches
deduplicate in-flight keys, valid out-of-order batches merge independently, removed-Clip and replaced-
session results remain stale, and a failed batch releases only its own keys while surfacing the typed
`media-runtime-unavailable` diagnostic.

Deterministic evidence passed:

- focused Cut/Assets/Desktop contract and runtime suite: `6 files / 71 tests`;
- adjacent Resource Browser suite: `2 files / 20 tests`;
- full `@neko/cut-webview`: `33 files / 254 tests`;
- full `@neko/assets-node`: `14 files / 77 tests`;
- full repository TypeScript check, Desktop TypeScript check, formatting, lint with existing warnings,
  strict OpenSpec and `check:quality`;
- Canvas playback boundary accepts the canonical dynamic public-root import through TypeScript AST
  inspection and rejects comment/string lookalikes.

The first advisory UI run failed before Timeline mount with `Cut Webview bridge is disposed`. The
memoized bridge was being permanently disposed by React StrictMode's effect replay. Desktop now
defers final bridge disposal through the established mounted-token pattern; the focused StrictMode
regression proves replay keeps the bridge active and final Surface unmount disposes it once.

The repeated isolated development run reached Timeline, Save, playback, midpoint seek, export,
reopen, resource drop and compact layout with zero console errors, warnings or exceptions. Direct
pixel inspection confirmed stable color-bar thumbnails in every visible Video Clip at wide editor,
playing/seeked, post-drop dense and compact states; tiles were nonblank and did not overlap adjacent
controls. Evidence:

`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T18-29-05.725Z-cut-openneko-consumer-development/report.json`

The run's overall advisory result remains failed because its independent `cut-empty-draft-add`
checkpoint expected tab elements that were absent, even though the canonical empty Timeline itself
passed. The full Desktop suite also remained red in concurrent Preview progressive-loading tests and
one parallel Resource Browser timeout; the focused Resource Browser timeout test passed alone. These
failures do not invalidate the focused Cut/Assets or inspected thumbnail evidence, but they remain
visible as adjacent product/test risks.

## Canonical Startup Entry

Date: 2026-08-10

Window claim now captures the valid active Project presentation, removes process-local temporary
Preview and expired Cut draft refs, and atomically replaces only the current Window composition with
a fresh unbound Entry Draft and default layout. Project tabs/catalogs, Conversation authority and
package-owned Project presentation snapshots remain available for explicit navigation. A renderer
session refresh does not claim the Window again and therefore preserves the exact current Scene.

Deterministic verification passed:

- focused Host startup/settings suite: `2 files / 53 tests`;
- focused Desktop Settings/renderer/SQLite suite: `3 files / 10 tests`;
- `@neko/host` and `@neko/app-desktop` TypeScript checks;
- strict OpenSpec (`70/70`), package boundaries (`43` packages), package product reachability and
  application boundaries (`1553` files);
- Prettier for every touched implementation, fixture and OpenSpec artifact, plus `git diff --check`.

The real development Electron app was first observed on the persisted Extensions scene. After the
exact development owner was stopped and the same application was cold-started, direct Computer Use
inspection showed a fresh “Hi，用对话开启创作” Entry Draft while the existing Project and Conversation
catalogs remained visible. Navigating to Extensions and pressing `Cmd+R` preserved Extensions after
renderer reconnection. Settings General showed a read-only “应用入口” policy without a restore-last
selector. Directly inspected screenshots:

- `reports/ui-validation/compose-desktop-workbench-scenes/2026-08-10-startup-entry/01-fresh-entry-after-cold-restart.jpeg`
- `reports/ui-validation/compose-desktop-workbench-scenes/2026-08-10-startup-entry/02-extensions-after-renderer-reload.jpeg`
- `reports/ui-validation/compose-desktop-workbench-scenes/2026-08-10-startup-entry/03-read-only-application-entry-setting.jpeg`

The isolated automated Canvas UI scenario was attempted but failed before CDP attachment because the
development launcher rejected the forwarded `--openneko-functional-fixture` option. Its fail-visible
report is
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-09T18-46-13.957Z-canvas-openneko-consumer-development/report.json`.
No scenario assertions ran, so it is not counted as acceptance and no fallback target was used.

## Canvas Generation Job Persistence Recovery

Date: 2026-08-10

The Canvas submit path was traced through the single Canvas Node runtime, Workspace Generation owner,
Generation Job coordinator and persistent store. The local `generation_jobs` table was empty but still
required retired internal `revision` and `snapshot_version` columns, so the canonical INSERT failed
before provider invocation. Generation now validates its package-owned table columns, atomically
replaces only a zero-row non-canonical table, and preserves plus rejects any non-canonical table that
contains records. Canvas includes owner initialization in the same outcome-unknown diagnostic boundary
as Job submission, so a persistence rejection remains node-local and actionable.

Verification passed:

- `pnpm --filter @neko/generation test -- src/job/__tests__/persistent-store.test.ts` — 29 files / 178 tests;
- `pnpm --filter @neko/canvas-node test -- src/canvas-generation-node-runtime.test.ts` — 3 files / 19 tests;
- focused Desktop Canvas runtime — 1 file / 20 tests;
- `@neko/generation` and `@neko/canvas-node` typechecks;
- no-internal-versioning, application boundaries, package boundaries, local-metadata runtime matrix,
  storage authority and strict OpenSpec gates;
- exact local database postcondition: canonical six-column table, zero rows.

Visible Electron submission remains unclaimed. The development renderer restarted into an empty
document during the attempt and stayed empty after one `Cmd+R`; no fallback IPC, direct Job insert or
provider call was used to disguise that failure. This leaves the final user-click/provider-invocation
checkpoint open without risking a duplicated or charged generation request.
