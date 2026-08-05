# Agent Evaluation

Date: 2026-08-03

## Evaluation Scope

- Change/feature: Desktop Agent cold-start catalog projection, renderer-startup Agent module
  preload, first-mount Host subscription ordering, pending user-message visibility and
  conversation-scoped send failure projection.
- Decision and owning suite: `reuse` the indexed `agent-runtime.workflow-controller` ownership for
  Desktop session/event behavior. No suite content is changed because the current runner cannot
  drive Electron Desktop composition or renderer projection.
- Why real Evaluation is required: the pending-send and Host event changes affect the user-visible
  Desktop Agent session projection. Catalog scoping, Popover styling and Workbench display-mode
  validation are deterministic non-model behavior.
- Canonical path and forbidden fallback: Desktop Shell Project catalog → read-only Pi catalog reader
  → Agent Home projection; Desktop Agent input → typed preload → Main controller/Pi runtime →
  authoritative Timeline → Agent Root. Forbidden paths are attach-all-workspaces startup, transcript
  hydration for Home listing, execution lease acquisition, active-conversation fallback, duplicate
  send, global-only send error, VS Code, mock or legacy Agent runtime.

## Cases

- Reused, updated, created or excluded: `reuse`
  `agent-runtime.workflow-controller`; no new case is authored until the Desktop complete-session
  driver can expose the required Desktop event facts.
- Evidence and coverage:
  - deterministic Pi/runtime tests prove exact workspace filtering, read-only catalog access,
    no lease acquisition, lifecycle disposal and fail-visible catalog errors;
  - deterministic Desktop tests prove Shell scopes Home before the first snapshot, Agent module and
    application bootstrap/settings start concurrently in one renderer readiness gate while
    Project/View bootstrap remains Surface scoped, rejected sends become conversation errors, and
    empty Main accepts `chat-main` but rejects `main-only`;
  - deterministic Agent Webview tests prove subscription precedes synchronous initialization
    response and one stable optimistic user message is visible before configuration and sent once
    after configuration;
  - shared UI/Desktop CSS tests prove the Popover semantic surface and Desktop theme tokens exist.
- Missing observability: the Evaluation runtime cannot yet launch a complete Desktop session,
  submit through its public Agent input, or observe renderer message reconciliation and terminal
  state as bounded facts.

## Verification

- Key-free validation: `pnpm test:agent:eval` passed with 35 test files, 234 tests, 22 indexed
  suites and 50 dry-run cases; this is harness/schema/index/dry-run evidence only.
- Renderer-startup validation:
  `pnpm --filter @neko/app-desktop exec vitest run src/renderer/desktop-agent-module.test.ts src/renderer/desktop-renderer-startup.test.ts src/renderer/DesktopAgentSurface.test.tsx src/renderer/DesktopApplication.test.tsx`
  passed with 4 files and 15 tests. The startup test first failed because Agent module loading was
  absent, then passed after the startup and Surface paths were bound to one cached module promise;
  the loader test additionally proves both callers receive the exact same promise.
- Real cases and reports: the focused `agent-runtime.workflow-controller` run is recorded at
  `reports/agent-eval/fix-desktop-agent-shell-regressions/local-run-summary.json` with outcome
  `infrastructure-blocked`; no behavior report or provider-backed assertion is claimed.
- Electron evidence: `pnpm package:desktop` and the full `pnpm build` passed. The production packaged
  app was launched against an isolated functional fixture and user-data directory. Opening the
  fixture Project immediately mounted `neko/boards/workspace.nkc` without
  `desktop-canvas-not-mounted`; the default mode was `Chat + Main`, both left and right Chat layouts
  rendered, and the Assets entry opened/focused exactly one independent Resource Browser Main tab
  while Agent remained the only Dock owner.
- Production Popover evidence: the rendered Radix portal surface had computed
  `opacity: 1`, `background-color: rgb(255, 255, 255)`, `color: rgb(32, 32, 31)`,
  `border-color: rgba(0, 0, 0, 0.13)`, `z-index: 50`, and `backdrop-filter: none`; visual
  inspection confirmed that underlying content did not show through.
- Agent surface evidence: the package Agent Root mounted in the isolated fixture without the
  previous loading stall. The fixture had no configured model, so the input reported no available
  model and a real send/reconciliation path could not be exercised.
- Renderer-startup preload evidence: the rebuilt production package was launched from Home with a
  fresh Electron user-data directory and an isolated synthetic workspace. The first Project open
  mounted exactly one `data-owner-root="agent"` for the exact View identity with no
  `.desktop-agent-status` loading surface. Canvas, Assets and Agent owner Roots remained distinct,
  confirming that startup preload did not create a global Project/View adapter.
- Restored Canvas regression evidence (2026-08-03): a user-visible packaged-state report proved the
  earlier fresh-Project check did not cover restart from a persisted empty Main group. Two
  `DesktopShellService` tests reproduced both an empty Main restore and a temporary Preview cleanup;
  both failed before the Host restore fix and passed afterward as part of 33 `@neko/host` test files
  and 281 tests. `pnpm typecheck:desktop` and `pnpm package:desktop` passed.
- Packaged empty-Main and restart acceptance (2026-08-03):
  `pnpm test:local:ui --scenario canvas-openneko-consumer --target packaged` passed against one
  isolated Electron/SQLite fixture. The scenario closed every Main View, verified both Canvas media
  resources were released, and observed the Chinese empty surface “没有打开的创作文档” with guidance
  text but no `<code>` diagnostic or `desktop-canvas-not-mounted`. It then set
  `startupTarget=restore`, restarted the same packaged application, and observed one package-owned
  Canvas Root for the sole `neko/boards/workspace.nkc` View. No console error or renderer exception
  was observed. The gitignored report is
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-03T03-17-20.412Z-canvas-openneko-consumer-packaged/report.json`; its screenshot artifacts are
  `screenshots/01-empty-main-after-last-tab-closed.png` and
  `screenshots/02-default-workspace-canvas-restored.png`.
- Packaged resize lifecycle acceptance (2026-08-03): the same production Electron scenario dragged
  the shared left Dock resize handle from `360px` to `447.6796875px` after the restart path. The
  resulting DOM contained zero `[data-resizing="true"]` owners, with no console error or renderer
  exception. The screenshot artifact is
  `screenshots/03-left-dock-resize-indicator-cleared.png` under the report above. Focused hook and
  Workbench tests additionally ran the pointerdown/pointerup lifecycle under React StrictMode and
  proved `onResizeEnd` was emitted once while the owning surface returned to
  `data-resizing="false"`.
- Packaged Workbench surface and Resource management acceptance (2026-08-03): the rebuilt packaged
  Electron scenario computed `rgb(255, 255, 255)` for the Agent package Root, Agent composer rail,
  Resource Browser Root and resource search input. The composer rail top border resolved to
  transparent, the Resource Browser contained zero package header rows, and the Desktop Dock
  contained exactly one “资源管理” title. The embedded content toolbar still exposed “配置媒体库”、
  “刷新”、“列表视图”和“网格视图”, proving the duplicate title row was removed without losing
  package-owned actions. The passed report is
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-03T03-57-05.458Z-canvas-openneko-consumer-packaged/report.json`; the inspected screenshot is
  `screenshots/05-desktop-dock-theme-surfaces.png` under that report.
- Packaged Home brand and launchpad acceptance (2026-08-03): the production Electron Home fixture
  rendered one `OpenNeko` brand child with zero `svg`/`.brand-mark` descendants while retaining the
  localized sidebar action label. The Agent heading contained zero decorative icons and used centered
  text while its common-task actions retained four functional icons. The launchpad center differed
  from the available Home Main center by `0px` horizontally and `0.00390625px` vertically. The passed
  report is
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-03T03-50-29.088Z-canvas-openneko-consumer-packaged/report.json`; the inspected screenshot is
  `screenshots/01-home-agent-entry-centered.png` under that report.
- Blocked or unexecuted cases: `agent-runtime.workflow-controller` real execution remains
  `infrastructure-blocked` because no local Agent provider credential environment variable is
  available. Provider-backed send, Tool approval and checkpoint/cleanup are therefore not claimed
  as accepted.

## Interpretation

- Deterministic producer/consumer tests cover the five reported regressions at their owning
  boundaries and poison the relevant wrong paths. Production Electron evidence additionally covers
  default Canvas mounting, Resource Browser Main ownership, Chat/Main layout modes and Popover
  opacity.
- Key-free Evaluation success cannot establish real model, Tool, checkpoint or renderer behavior.

## Residual Risk

- A provider-configured packaged Electron fixture must still verify optimistic send reconciliation,
  authoritative user-message replacement and rejected-send terminal UI through the public Agent
  input.
- Provider-backed Agent execution, Tool approval and checkpoint/cleanup remain unverified until
  credentials or a Desktop complete-session driver with explicit cost authorization are available.

## 2026-08-05 Sent-message and transcript-rail update

### Evaluation Scope

- Change/feature: Entry Draft initial user-message projection across draft → session Surface
  replacement, centered transcript rail, and removal of Desktop Dock roleplay Header chrome.
- Decision and owning suite: `update` the existing visible `desktop-agent-provider-ui` scenario for
  exact sent-text and computed-layout assertions; `reuse`
  `agent-runtime.workflow-controller/conversation-persistence-resume` for non-UI real-provider
  persistence and owner-reopen coverage.
- Canonical path: visible composer → Agent launch first-submit → persisted lifecycle initial message
  → Desktop session bootstrap → Agent controller active-conversation projection → Webview
  coordinator/MessageList. The forbidden fallback is retaining the replaced draft Webview,
  synthesizing a second transcript in Renderer, or relying on final assistant text alone.

### Verification

- Visible real-provider Desktop: `desktop-agent-provider-ui` passed with
  `nekoapi-chat / gpt-5.6-luna`. The exact submitted prompt was visible while the initial turn was
  running and after completion; the real response marker rendered; lifecycle status was
  `completed`; no console error, renderer exception, legacy run status or roleplay Header action was
  present. MessageList width was `1190px`; both visible transcript rails were `820px` with equal
  `185px` inline gutters. Report:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-04T18-47-01.962Z-desktop-agent-provider-ui-development/report.json`.
- Hidden real-provider Desktop: focused
  `agent-runtime.workflow-controller/conversation-persistence-resume` passed with the same provider
  and model. It disposed the first Desktop session owner, restored the same Pi/SQLite conversation,
  observed persisted history, and completed a continuation turn. Aggregate:
  `reports/agent-eval/agent-runtime.workflow-controller/conversation-persistence-resume/focused-1-msf0hp7j/aggregate.json`.
- Deterministic coverage: Agent runtime tests cover lifecycle projection and bootstrap history merge;
  Desktop bridge/AppHost tests assert the package-owned initial message reaches the exact session
  effects owner; Webview tests cover Host reconciliation, rail ownership and Header visibility.

### Foundational matrix and residual risk

- Basic conversation: covered by visible real-provider Desktop.
- Multi-turn, owner/application reopen and transcript persistence: covered by the focused hidden
  real-provider resume case.
- Context compaction, generation-record restoration, cross-conversation switching and isolation:
  unchanged by this initial-message/bootstrap and layout delta; existing indexed suites and
  deterministic conversation-scoped tests remain authoritative and were not rerun as provider-backed
  cases for this focused change.
- The visible scenario uses a wide `1440px` Desktop viewport. Narrow-panel behavior is covered by
  CSS/DOM contract tests, not a second real-provider screenshot.

## 2026-08-05 Pi-only conversation restore update

### Evaluation Scope

- Change/feature: restore exact Assistant and Workspace Pi conversations whose immutable context
  exists but which predate Entry Draft first-submit lifecycle metadata.
- Decision: deterministic producer/consumer and Desktop projection tests cover this ownership-only
  correction. Pi remains the conversation/catalog/transcript authority; lifecycle owns optional
  first-submit metadata, and Renderer owns only mounted presentation state and visibility.
- Canonical path: exact Scene conversation identity -> lifecycle context owner validation -> Pi
  workspace catalog lookup -> target Pi transcript projection. Forbidden paths are requiring or
  synthesizing a lifecycle record, creating a replacement conversation, selecting the active/recent
  conversation, or storing transcript facts in Renderer.

### Verification

- Agent Runtime regression proves an exact Pi-only context returns no first-submit record while the
  existing required lifecycle read remains fail-visible.
- Desktop AppHost regressions prove Pi-only Workspace and Assistant conversations bootstrap with the
  exact `initialConversationId`, omit synthetic `initialConversationMessage`, reject owner mismatch,
  and keep subsequent Assistant business messages bound to the exact restored Scene.
- Focused Main/Bridge/preload/Renderer projection tests passed with `4 files / 61 tests`; full Agent
  Runtime passed `116 files / 1089 tests`, full Desktop passed `65 files / 367 tests`, both affected
  typechecks passed, and `pnpm test:agent:eval` passed key-free validation with `45 files / 288 tests`
  plus `22 suites / 53 cases` in dry-run.
- Repository `pnpm build`, `pnpm test` and `pnpm check` passed. The production darwin-arm64 Desktop
  package was rebuilt, and the isolated packaged `desktop-workbench-scenes` scenario completed
  Workspace/Assistant activation, application restart, exact Assistant restore and a second visible
  send without console errors, renderer exceptions or attachment identity diagnostics. Report:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-05T10-33-38.961Z-desktop-workbench-scenes-packaged/report.json`.

### Residual Risk

- A visible two-conversation provider-backed switch/restart case remains task 5.9 and requires an
  explicit provider, model and cost authorization. Configuration availability alone is not treated
  as permission to invoke the provider.
