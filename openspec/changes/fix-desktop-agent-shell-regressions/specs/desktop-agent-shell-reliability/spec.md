## ADDED Requirements

### Requirement: Desktop cold start projects persistent Agent conversations

The Desktop AppHost SHALL project persisted Pi conversation catalog records for every workspace in the current Desktop Project catalog before the first Shell window snapshot, without opening a conversation runtime or acquiring an execution lease.

#### Scenario: Home opens before any Project

- **WHEN** Desktop starts on Home with registered Project workspaces that contain persisted Pi conversations
- **THEN** the first Shell snapshot includes those conversations in recency order without requiring the user to open a Project

#### Scenario: Historical workspace is not registered

- **WHEN** the Pi catalog contains a conversation whose workspace is absent from the Desktop Project catalog
- **THEN** Desktop retains the data but does not project that conversation into Agent Home

#### Scenario: Catalog read fails

- **WHEN** the persisted Pi catalog cannot be read or decoded
- **THEN** Desktop exposes a fail-visible Agent Home diagnostic and MUST NOT present a successful empty conversation list

### Requirement: Agent module is startup-preloaded and surface bootstrap is owner scoped

The Desktop renderer SHALL load the Agent Webview module as part of its startup readiness gate and
SHALL reuse that exact module promise when an Agent Surface mounts. The renderer SHALL request the
owner-fenced Host bootstrap only for the concrete Project/View and SHALL create the Agent adapter
only from the matching ready bootstrap.

#### Scenario: Renderer starts before a Project Agent surface exists

- **WHEN** the sender-bound application bootstrap and settings snapshot initialize the renderer
- **THEN** Agent Webview module loading starts in the same startup gate
- **AND** React Root is not exposed as ready until the module has loaded
- **AND** no Project workspace, conversation runtime or View adapter is created by module preload

#### Scenario: First Agent surface mount

- **WHEN** a Project Agent surface mounts for a valid View identity after renderer startup
- **THEN** it reuses the startup-loaded module and requests the exact View-scoped bootstrap
- **AND** the ready Root uses the returned View-scoped connection

#### Scenario: Surface identity changes while loading

- **WHEN** the Project, View, or View epoch changes before bootstrap completes
- **THEN** stale bootstrap cannot mount an Agent Root or replace the new owner adapter

### Requirement: Host subscription precedes Agent initialization requests

The Agent Webview Root SHALL establish its Host event subscription before descendant components issue conversation, tab, configuration, Skill, or Agent state initialization requests.

#### Scenario: Host replies synchronously

- **WHEN** a test Host adapter emits a response synchronously from the first initialization request
- **THEN** the owning controller receives the response and completes navigation/config hydration

#### Scenario: Agent Root unmounts

- **WHEN** the Agent Root unmounts or replaces its adapter
- **THEN** the exact Host subscription is disposed and the retired adapter cannot project later events

### Requirement: New conversation send remains visible and authoritative

The Agent renderer SHALL bind a tabless pending send to the newly created Tab and conversation identity, render the optimistic user message immediately after the required model snapshot is available, send it to the Host exactly once, and reconcile it with the authoritative Timeline without clearing or duplicating it.

#### Scenario: New conversation receives configuration

- **WHEN** a user sends text from the tabless entry and the Host publishes conversation, Tab, empty Timeline, and model configuration snapshots in any valid order
- **THEN** the new visible Tab renders the user text and submits one Host send for that exact conversation

#### Scenario: Empty projection frame arrives around pending send

- **WHEN** an empty initial conversation or Timeline projection arrives before or after the pending send is consumed
- **THEN** it does not erase the optimistic user message or leave the visible Tab in an unowned executing state

#### Scenario: Pending send cannot execute

- **WHEN** required model configuration is missing or Host send fails
- **THEN** the owning conversation exposes a diagnostic and MUST NOT silently remain as a blank executing panel

### Requirement: Portal components have a stable themed surface

The shared Popover primitive SHALL render a semantic surface with non-transparent background, foreground, border, shadow, and overlay order using the shared theme token contract, independent of consumer Tailwind source scanning.

#### Scenario: Desktop layout menu opens

- **WHEN** the Workbench display Popover opens in either Desktop light or dark theme
- **THEN** its production portal content has computed opacity `1`, an opaque computed background color, readable foreground and a layer above surrounding panels
- **AND** it does not expose overlapped content through the menu surface

#### Scenario: Popover is used by another package

- **WHEN** a package consumes the shared Popover without compiling `@neko/ui` source utility classes
- **THEN** the semantic surface styling remains present through the shared stylesheet

### Requirement: Project opens the canonical Workspace Canvas

The Desktop Host SHALL open or focus `neko/boards/workspace.nkc` as the default Canvas Main View whenever a Project is attached or restored without a project-owned Main View. The renderer SHALL NOT replace this behavior with an empty Main placeholder or a private Canvas document.

#### Scenario: Project opens without a stored Main View

- **WHEN** a Project is opened and its Workbench has no project-owned Main View
- **THEN** the Host attaches one Canvas View for `neko/boards/workspace.nkc` to the primary Main group
- **AND** the Workbench displays Canvas with Chat using the selected Chat position

#### Scenario: Existing Main View is restored

- **WHEN** a Project is reopened with a persisted Canvas, Preview, Cut, or Resource Browser Main View
- **THEN** the Host restores that View without creating a duplicate Workspace Canvas

#### Scenario: User closes the last Main View in the current session

- **WHEN** an attached Project user closes its last Canvas, Preview, Cut, or Resource Browser Main View
- **THEN** the renderer displays an explicit empty Main surface without a Canvas failure diagnostic
- **AND** the Host does not recreate the default Workspace Canvas until the Project is attached or restored again

#### Scenario: Canvas capability fails

- **WHEN** the default Canvas View cannot obtain a valid Canvas runtime
- **THEN** Desktop displays a fail-visible Canvas diagnostic for that View
- **AND** it MUST NOT report an empty placeholder or simulated Canvas as success

### Requirement: Project Resource Browser is a Main View

The Desktop Workbench SHALL open the project Resource Browser as an independent `resource-browser` Main View with stable project/workspace/View identity. The application sidebar SHALL only issue an open-or-focus intent and SHALL NOT mount the Resource Browser as a project dock.

#### Scenario: Open resources from a Project

- **WHEN** the user selects the project resources entry
- **THEN** Workbench opens or focuses one Resource Browser View in the primary Main group
- **AND** the existing Canvas View remains available as another Main tab

#### Scenario: Reopen project resources

- **WHEN** the Resource Browser View already exists and the user selects resources again
- **THEN** Workbench focuses the existing View without creating another Assets Root or browser state owner

#### Scenario: Restore and close Resource Browser

- **WHEN** a persisted Resource Browser View is restored or closed
- **THEN** it follows the same epoch, group membership, focus and close contract as other Main Views
- **AND** no project Resource Dock success path participates

### Requirement: Workbench resize feedback follows the active pointer session

The shared resize primitive SHALL expose resizing feedback only while its owning pointer session is active and SHALL remain lifecycle-correct when React replays effect setup and cleanup under StrictMode.

#### Scenario: Resize completes under React StrictMode

- **WHEN** a sidebar, Dock, Main split, or Timeline resize starts and its owning pointer session ends after React has replayed the primitive effect lifecycle
- **THEN** the final size is committed exactly once
- **AND** the owning surface clears its resizing state immediately
- **AND** the resize indicator does not remain visible because the mounted component was mistaken for an unmounted component

#### Scenario: Resize component really unmounts

- **WHEN** a resize owner unmounts during an active pointer session
- **THEN** pending animation-frame work and pointer ownership are discarded
- **AND** no state update or resize-end callback is emitted after unmount

### Requirement: Desktop Workbench primary regions share one Main surface

The Desktop renderer SHALL scope Agent and Resource Browser package Roots to the same Main surface used by the creative Main region without changing the global sidebar token used by application navigation. The Agent composer rail SHALL remain visually continuous with the conversation surface. A Desktop-embedded Resource Browser SHALL rely on the Desktop Dock for its single visible title and SHALL keep package actions in the content toolbar.

#### Scenario: Agent and Resource Browser render in the light Desktop theme

- **WHEN** the Agent conversation or Resource Browser is mounted inside a Desktop Workbench Dock
- **THEN** its package Root computed background uses `--neko-desktop-main` (`#ffffff`)
- **AND** it does not use the Workbench surface (`#fafafa`) or muted sidebar surface (`#f3f3f2`)
- **AND** the Agent composer rail uses the same computed background without an independent top divider
- **AND** inputs and dialogs remain distinguishable through their semantic control tokens

#### Scenario: Desktop theme changes to dark

- **WHEN** the same package Root is rendered in the dark Desktop theme
- **THEN** it follows the dark `--neko-desktop-main` value without a package-local light color override

#### Scenario: Resource Browser is embedded in Resource management

- **WHEN** Desktop mounts the Resource Browser inside the Resource management Dock
- **THEN** exactly one visible Dock title identifies the surface as Resource management
- **AND** the package does not render a second Resources title row
- **AND** add-library and refresh actions remain available in the unified content toolbar

### Requirement: Home uses minimal brand chrome and a centered Agent launchpad

The Desktop Home application primary sidebar SHALL render one `OpenNeko` text brand without a brand mark or a separate icon control. The text brand SHALL preserve the existing sidebar visibility action. The Home Agent launchpad SHALL be centered within the available Main region when the viewport has sufficient height and SHALL remain safely scrollable at constrained sizes.

#### Scenario: Home opens with the primary sidebar expanded

- **WHEN** Desktop renders the Home create entry
- **THEN** the application brand row contains only the visible `OpenNeko` text
- **AND** it contains no brand mark or icon glyph
- **AND** activating the text uses the existing sidebar visibility action

#### Scenario: Home opens in a spacious window

- **WHEN** the Main region is taller than the Agent launchpad content
- **THEN** the launchpad is horizontally and vertically centered in the available Home Main region

#### Scenario: Home window height is constrained

- **WHEN** the launchpad cannot fit comfortably while centered
- **THEN** the layout aligns from the top with bounded padding
- **AND** Home Main remains scrollable without clipping the heading or composer

#### Scenario: Agent launchpad heading is rendered

- **WHEN** Desktop displays the Home Agent creation entry
- **THEN** the heading contains no standalone decorative icon tile
- **AND** its title and subtitle share one centered text axis
- **AND** common task and quick-start actions retain their functional icons
