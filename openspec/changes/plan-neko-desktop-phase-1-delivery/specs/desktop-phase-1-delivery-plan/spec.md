# Desktop Phase 1 Delivery Plan

## ADDED Requirements

### Requirement: Phase 1 is delivered through bounded dependent changes

Desktop Phase 1 MUST be implemented through bounded OpenSpec changes for foundation, Shell/state,
Agent/Unified Workbench, Assets/Canvas, Cut/Preview/Media, support domains, and final qualification. Each child
change MUST define its own canonical path, replaced legacy path, tests, data impact, and completion
gate. The program MUST NOT maintain one parallel Desktop implementation until every package is
integrated. The program checklist MUST track focused change gates and MUST NOT duplicate stale
implementation tasks, superseded transports, or historical host requirements.

#### Scenario: A package integration starts

- **WHEN** an implementation change begins for Agent, Assets, Canvas, Cut, Preview, or another domain
- **THEN** its proposal identifies the owning public contract, current Host coupling, migration
  boundary, replaced path, and producer/consumer tests
- **AND** it does not add a Desktop-only copy of the domain store, file IO, media client, DTO, or UI
  Root

#### Scenario: A later slice starts early

- **WHEN** a later Phase 1 slice is developed before a dependency gate is complete
- **THEN** it remains an isolated spike without a production success path
- **AND** it cannot invent a temporary bridge, fallback, or mock contract that bypasses the pending
  foundation

#### Scenario: Program and child status disagree

- **WHEN** a child change implements, supersedes, transfers, or blocks program work
- **THEN** the program records the exact focused owner and prerequisite without copying its task list
- **AND** checkbox counts alone cannot promote the child or program to complete

### Requirement: Desktop has one secure composition root

Phase 1 MUST create exactly one `apps/neko-desktop` composition root with Electron main, preload,
renderer, AppHost, and app-specific serializable IPC contracts. Main MUST own privileged lifecycle,
security, file/process/protocol effects, persistence, and permission validation. Preload MUST expose
only fixed versioned purpose-scoped APIs. Renderer MUST remain browser-sandboxed and MUST consume
only public UI/domain adapters.

#### Scenario: Renderer requests a privileged operation

- **WHEN** a package UI needs file access, a dialog, media projection, persistence, or process work
- **THEN** it invokes its typed Host/domain adapter
- **AND** Main validates the real sender, target identity, payload, ownership, and permission before
  delegating to the owning service

#### Scenario: Renderer attempts generic IPC

- **WHEN** Renderer or a plugin-like component supplies an arbitrary channel, Node object, absolute
  path, credential, Electron event, or untyped payload
- **THEN** preload/Main rejects the request
- **AND** no raw `ipcRenderer`, Node, Electron, or VS Code capability is reachable

### Requirement: Application identity and data have one canonical migration

Phase 1 MUST add `neko-desktop` as the canonical Desktop application identity and MUST delete
the unpublished `neko-home` success path within the same replacement boundary. Before removal,
the implementation MUST audit settings, conversations, project registry, credentials, trust,
installed packages, generated artifacts, and rebuildable cache, and assign exactly one explicit
reuse, migrate, rebuild, or reject-with-diagnostic disposition to each category.

#### Scenario: No legacy Desktop data exists

- **WHEN** the audit finds no valuable `neko-home` data
- **THEN** the retired identity and success path are removed
- **AND** regression tests prove new requests cannot use an alias or fallback

#### Scenario: Valuable legacy data exists

- **WHEN** known valid data is found for a protected storage category
- **THEN** a tested explicit migration or reuse path preserves its owner and stable identity
- **AND** unknown schema or unsafe trust/credential data is rejected with a diagnostic rather than
  deleted, broadened, or silently copied

### Requirement: Project catalog owns navigation metadata only

Phase 1 MUST define a Host-owned revisioned Project catalog that binds explicit Project and existing
Workspace identity, profile, display metadata, and a protected workspace locator. It MUST reuse the
canonical workspace identity/registry and MUST NOT own Conversation, Canvas, Cut, Job, artifact, or
domain document facts. Phase 1 MUST permit only Content projects to open successfully.

#### Scenario: Open a content workspace

- **WHEN** the user selects a valid workspace and opens or creates its Content Project
- **THEN** Host resolves or creates the canonical workspace identity, binds one Project record, and
  opens one Project Tab per Window
- **AND** Renderer persistence does not receive an absolute workspace path or create another
  workspace identity

#### Scenario: Create an unavailable profile

- **WHEN** the user requests a Character or World project before its canonical aggregate exists
- **THEN** Desktop returns an unavailable diagnostic
- **AND** it does not persist an empty project, open a fake successful Tab, or use Canvas/Preview
  state as the missing domain fact

### Requirement: Renderer state is owner-keyed and race-safe

Desktop MUST keep Project, Conversation, Run, Tool Call, Job, document, and cross-project Attention
facts authoritative in AppHost or the owning domain. Renderer MUST use owner-keyed immutable
replicas, Window-scoped layout/Project Tab state, and View-scoped draft/selection/scroll/viewport
state. Projection attachment MUST be snapshot-first and MUST validate exact attachment, View instance
and request identity plus a continuous live sequence.

#### Scenario: A patch is missing or stale

- **WHEN** Renderer receives a patch before snapshot, with a sequence gap, disposed or mismatched
  View/attachment/request identity, wrong owner, or malformed payload
- **THEN** the attachment fails visibly and acquires a new authoritative snapshot
- **AND** it does not apply last-write-wins, active-Tab fallback, or a persisted UI cache

#### Scenario: User switches tabs during an async command

- **WHEN** a response for View A arrives after View B becomes active or View A is reopened with a new
  View instance identity
- **THEN** the response reconciles only with its captured owner, command, request, source fingerprint,
  and original View instance identity
- **AND** it cannot mutate View B or the new View A instance

### Requirement: Desktop workbench uses controlled creative surfaces

Desktop MUST provide one hideable primary sidebar plus controlled Main Creative Surface, Agent Dock,
Resource Dock and Cut Timeline Panel slots. Agent and Resource docks MAY move between supported left
and right positions, the Main area MAY expose an explicit bounded split, and the Timeline MAY change
visibility and height. Phase 1 MUST NOT implement an arbitrary IDE dock tree, unlimited editor groups,
or renderer-owned domain lifecycle.

The primary sidebar MUST collapse to one icon rail without creating a second navigation owner. The
Agent conversation surface MUST remain a Chat dock/workspace region outside the Main Creative
Surface. Desktop-owned configuration, onboarding and connection entry points MUST NOT be rendered
inside the package Agent surface. The controlled display menu MUST compose Chat with one Main
Creative Surface, Chat only, or Main only; Chat placement MAY be selected as a preset, but Desktop
MUST NOT expose separate move-left or move-right toolbar buttons. The Main Creative Surface MUST
reuse owner Views to present Canvas, Cut Stage with Timeline, Model Preview, Canvas with Timeline,
or Canvas with Model without creating alternate viewers or editors. Files, Media and Entity remain
independent Resource facets.

#### Scenario: User changes a workbench preset

- **WHEN** the user switches between focus, Canvas-and-Agent, Canvas-and-Resources,
  Canvas-and-Preview or Canvas-and-Cut layouts
- **THEN** Window/View state records only presentation placement, visibility and sizing
- **AND** Conversation, Canvas, Cut, Preview, Entity and Job facts remain owned by their domains

#### Scenario: User collapses the primary sidebar

- **WHEN** the user toggles the expanded primary sidebar
- **THEN** Desktop retains a compact icon rail with Agent, Workspace, resource and Settings scene navigation
- **AND** Project/View attachments, dock owners and domain runtimes are not recreated

#### Scenario: User composes Chat and the Main Creative Surface

- **WHEN** the user selects Chat + Main, Chat only, Main only, or an available Main composition
- **THEN** Desktop changes only Window-owned placement, visibility, active View, side View and
  Timeline presentation
- **AND** Canvas, Cut and Preview continue rendering their package-owned Roots and commands
- **AND** unavailable Timeline or Model Views remain disabled until an owning document is opened

#### Scenario: Content Project renders owner-local navigation

- **WHEN** Desktop renders an open Content Project
- **THEN** it leaves only the transparent macOS traffic-light drag region above the workbench and
  does not render a global Header or unified workspace Tab row
- **AND** Agent conversations, Canvas/Preview documents and Cut/Timeline views expose tabs or compact
  switchers only inside their owning surfaces

#### Scenario: User selects a Chat and Main presentation

- **WHEN** the user chooses Chat-left, Chat-right, only-Chat or only-Main
- **THEN** Desktop changes only Chat dock visibility/position and creative surface presentation
- **AND** Resource Files, Media and Entity facets remain independently selectable and are not
  encoded into the Chat/Main preset

#### Scenario: Desktop embeds a Canvas or Model viewport

- **WHEN** the package-owned Canvas or Model Root renders its primary viewport tools
- **THEN** the owning package renders one bottom-centered horizontal icon toolbar
- **AND** Desktop does not copy, remove or replace package commands based on visual placement

#### Scenario: A narrow window cannot display every dock

- **WHEN** available width cannot preserve the minimum Main Creative Surface
- **THEN** Desktop keeps one dock visible and presents another requested dock as an explicit temporary
  overlay or hidden region
- **AND** it does not silently resize the main surface below its supported minimum or duplicate owner state

#### Scenario: Multiple creative documents are opened

- **WHEN** the user opens multiple different Canvas, Cut or Preview documents
- **THEN** the owning domain keeps independent document/session identity and Desktop exposes a compact
  project-tree or domain View switcher
- **AND** Phase 1 focuses an existing View for the same document, renders at most two Canvas views,
  renders at most one Cut, and does not create a second domain store

#### Scenario: A resource is previewed while authoring

- **WHEN** the user single-clicks, pins or explicitly opens a resource to the side
- **THEN** Desktop respectively reuses a temporary Preview View, retains a persistent Preview View, or
  creates a bounded side-by-side Preview View
- **AND** generic Preview does not default to covering Canvas while Canvas-node and Cut-clip previews
  remain inside their owning surfaces

### Requirement: Each retained package enters through its owning public path

Phase 1 MUST integrate Agent, Assets/Content/Media Library, Canvas, Cut, Preview/Media,
Generation/Quality, applicable Chara/Entity, and Tools/Diagnostics through their owning public
contracts. Retired VS Code/TUI/Engine packages, private implementations, message effects and
compatibility adapters MUST remain absent from production dependencies and MUST NOT enter Desktop.

#### Scenario: Canvas or Cut opens in Desktop

- **WHEN** Desktop opens a Canvas or Cut document
- **THEN** the full package-owned Root consumes an injected versioned Host/domain adapter and the
  canonical `.nkc` or OTIO fact
- **AND** a simplified demo surface, fixed timeline, copied store, or direct VS Code transport cannot
  return success

#### Scenario: Preview displays local content

- **WHEN** Preview displays a document, image, audio, video, or supported 3D resource
- **THEN** Host resolves an authorized `ContentLocator` and projects only a short-lived scoped HTTP
  gateway descriptor or another owning bounded representation
- **AND** Renderer does not receive a raw path, `file://` URL, unregistered localhost origin, cache
  path, stable transport URL, or Engine/client token

#### Scenario: Agent searches a project Entity

- **WHEN** the Desktop Agent composer requests mention candidates by canonical name or alias
- **THEN** Main reads the project Entity authority and returns a stable Entity reference with its
  optional authorized representation ContentLocator
- **AND** Entity results are combined with workspace file results without treating Entity names as
  filenames or creating a second Entity catalog

#### Scenario: Generation or export is observed

- **WHEN** Agent, Canvas, or Cut starts Generation or Export work
- **THEN** the owning GenerationJob or ExportJob remains the lifecycle authority and projects status
  to the originating surface and Activity summary
- **AND** Desktop does not create a generic Task, duplicate provider execution, or renderer-owned Job

### Requirement: Phase 1 completes one real Content workflow

Phase 1 MUST complete a real reference-platform workflow from Desktop launch through Content Project,
Agent conversation, Media Library, Canvas candidate creation/acceptance, Preview, Cut editing and
ExportJob, result review, close/reopen, and application recovery. The workflow MUST use isolated
synthetic workspace data and MUST assert both user-visible results and the canonical execution path.

#### Scenario: Phase 1 qualification runs

- **WHEN** the final Phase 1 functional scenario executes on `darwin-arm64`
- **THEN** it exercises real Host ports, public package adapters, Pi conversation runtime, Pi Session,
  Product Turn Bridge, owning Jobs, `@neko/media`, and the Main-owned HTTP resource gateway
- **AND** registry/import assertions prove `neko-media:`/upstream proxy, retired host paths,
  `neko-home`, Engine/client, mock stores, and demo surfaces are not involved

#### Scenario: Application restarts after work

- **WHEN** the Project Tab or Renderer closes and the application restarts after the workflow
- **THEN** Project, Conversation, accepted artifacts, Canvas/Cut documents, and recoverable owning
  Job facts restore from their authorities while View state restores only allowed presentation data
- **AND** no duplicate run, import, generation, or export is submitted

### Requirement: CI, Agent Evaluation and graphical UI evidence remain distinct

CI MUST validate native package construction, deterministic unit/contract tests and a bounded
headless Desktop functional subset. Provider-backed Agent Evaluation and graphical Electron UI
acceptance MUST require explicit local execution and MUST NOT be reachable from GitHub workflows or
generic CI script composition. Key-free harness validation MUST NOT be represented as AI behavior
acceptance, and browser-only rendering MUST NOT be represented as Electron UI acceptance.

#### Scenario: Agent behavior changes

- **WHEN** Prompt, Skill, capability/tool routing, provider/model, AgentSession or Desktop Agent event
  projection changes
- **THEN** the owning change runs a focused real-provider API Evaluation locally with provider/model,
  cost, canonical-path and forbidden-fallback evidence
- **AND** CI runs only deterministic producer/consumer and harness infrastructure checks

#### Scenario: Desktop visual behavior changes

- **WHEN** layout, focus, Portal styling, IPC/CSP, window lifecycle or media visibility changes
- **THEN** the owning change runs the isolated graphical Electron fixture locally and records visible
  runtime evidence
- **AND** CI retains only the non-graphical headless functional path

### Requirement: Phase 1 preserves Desktop-only topology and accurate support claims

Electron Desktop MUST remain the only product composition root. Shared contract changes MUST retain
their current Desktop producer/consumer and canonical-path tests without restoring a retired host,
compatibility package or fallback. The native package/release target SHALL remain exactly
`darwin-arm64`; Windows/Linux SHALL remain deterministic test-only hosts. Phase 1 SHALL use
`darwin-arm64` as its complete graphical and package reference platform without inferring product
support from non-macOS test results.

#### Scenario: A shared adapter changes

- **WHEN** an existing package Root or Host controller is generalized or migrated
- **THEN** its current Desktop producer and consumer migrate atomically to the one canonical contract
- **AND** residue/path guards prove retired hosts and old aliases cannot resolve or return success

#### Scenario: A Phase 1 package is demonstrated

- **WHEN** a Phase 1 Desktop package or build is produced
- **THEN** documentation identifies exact `darwin-arm64` package/graphical evidence and
  Windows/Linux deterministic test evidence actually performed
- **AND** it does not imply non-macOS product qualification or Phase 3 MCP/plugin/professional-tool
  support
