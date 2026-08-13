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

### Requirement: Agent diagnostics escape Workbench pane clipping

The Agent Webview SHALL retain ownership of global and conversation diagnostic content while rendering visible diagnostic alerts through a renderer-level portal that is not clipped by Workbench pane overflow. It SHALL NOT relax Workbench content clipping or project diagnostics from retained hidden Tabs.

#### Scenario: Global error appears beside a Resource Browser Main View

- **WHEN** Agent renders a global error from a narrow Workbench Dock next to another Main View
- **THEN** the alert is attached to the renderer portal layer rather than the Agent pane
- **AND** its complete bounded content remains readable above surrounding Workbench panels

#### Scenario: Visible conversation reports an error

- **WHEN** the active conversation owns a session diagnostic
- **THEN** the same canonical diagnostic alert surface renders through the portal layer
- **AND** long diagnostic content wraps within the viewport instead of extending beyond it

#### Scenario: Retained hidden conversation owns an error

- **WHEN** a non-active retained Tab still owns a session diagnostic
- **THEN** that Tab does not create a window-level alert
- **AND** activating the Tab may project its exact retained diagnostic without changing its owner

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

#### Scenario: A special authoring target opens in a Project Workspace

- **WHEN** the user opens an exact CharacterProject or WorldProject authoring target from a Content Project Workspace
- **THEN** the canonical Workspace Canvas remains in the primary Main group
- **AND** the special authoring target opens or focuses in Secondary Main without replacing the Canvas
- **AND** closing the special target collapses Secondary Main and reveals the unchanged Canvas

#### Scenario: A standalone special authoring target opens

- **WHEN** the user opens an exact CharacterProject or WorldProject through its explicitly authorized standalone library Workspace
- **THEN** primary Main remains the normal explicit empty surface
- **AND** the special authoring target opens in Secondary Main
- **AND** closing it returns to the empty Main state without retaining a hidden authoring Root

#### Scenario: Startup finds a cross-Workspace Scene and Project presentation

- **WHEN** a stored Window selects one Project presentation but its persisted Workspace Scene belongs to another Workspace
- **THEN** Desktop locally resets the mismatched Scene before projecting the startup Window
- **AND** the selected Project Tab, its canonical Board and valid sibling Project presentations remain available
- **AND** Desktop exposes one owner-qualified Workspace presentation-reset warning
- **AND** the presentation mismatch does not fail application startup or weaken live Scene/Layout validation

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

### Requirement: Agent execution activity belongs to the conversation transcript

The Agent Webview SHALL present live execution activity inside the owning conversation transcript and SHALL NOT render an independent run-status region next to the composer. It SHALL reuse authoritative thinking content, Tool Call, Process Record, generation and streaming-message projections instead of creating a parallel execution history.

#### Scenario: A turn is waiting for its first projected record

- **WHEN** the owning conversation is active and its Agent state is running but no streaming assistant message or process record is available yet
- **THEN** MessageList renders one lightweight live activity item at the transcript tail
- **AND** the item does not display a standalone `Thinking` or `思考中` label
- **AND** no run-status region is rendered between the transcript and composer

#### Scenario: Tool or streaming output becomes visible

- **WHEN** the active turn projects a Tool Call, Process Record, generation record, thinking content, or streaming assistant message
- **THEN** the canonical transcript item displays its live status in occurrence order
- **AND** the generic activity item does not duplicate the canonical record

#### Scenario: The turn becomes idle or the user switches conversations

- **WHEN** the owning turn reaches idle or another conversation becomes active
- **THEN** the temporary activity item is removed or replaced by the target conversation's own state
- **AND** completed or failed canonical execution records remain visible in their owning transcript
- **AND** no run state is inferred from another conversation or persisted as a synthetic message

#### Scenario: Agent state attaches after the Webview

- **WHEN** a state snapshot for the active conversation arrives after mount or reload
- **THEN** the transcript activity reflects that exact conversation snapshot
- **AND** stale or mismatched conversation state is not displayed

### Requirement: Sent messages remain visible in one centered transcript rail

The Agent Webview SHALL commit a submitted user message to the owning conversation render lifecycle before Host projection can replace visible state. User, assistant, thinking, Tool Call, Process Record and execution activity items SHALL share one centered maximum-width transcript rail aligned with the composer.

#### Scenario: Host projection follows an optimistic user commit

- **WHEN** a user message is committed and the owning conversation subsequently receives an empty or assistant-only Host/Timeline projection
- **THEN** the exact submitted user content remains visible in that conversation
- **AND** an authoritative persisted user record replaces, rather than duplicates, the pending record when acknowledgement arrives
- **AND** another conversation cannot acknowledge or display that record

#### Scenario: Transcript renders in a wide Agent panel

- **WHEN** user, assistant, process or live execution records are displayed in a panel wider than the composer maximum width
- **THEN** every record is contained by the same centered transcript rail
- **AND** the rail maximum width matches the composer maximum width
- **AND** user content aligns to the right within the rail rather than to the panel edge
- **AND** narrow panels retain bounded inline space without horizontal overflow

### Requirement: Desktop Dock omits package-owned roleplay navigation

The Agent Webview SHALL treat the roleplay selector as package-owned conversation navigation chrome. Desktop Dock presentation SHALL omit that selector together with Agent Tab, new-chat and history controls; standalone Agent presentation SHALL retain the existing selector.

#### Scenario: Workspace Agent renders without package conversation tabs

- **WHEN** Desktop mounts Agent using `desktop-dock` presentation
- **THEN** the Header does not render the roleplay selector
- **AND** no duplicate character-session entry remains in the Agent panel
- **AND** entity discovery and character-session launch remain owned by Resource management entity interactions

### Requirement: Existing Pi conversations restore without synthetic lifecycle state

Desktop SHALL restore an exact persisted Pi conversation when its catalog/context exists even if it predates
the first-submit lifecycle repository. Lifecycle-owned initial-message projection SHALL be optional and SHALL
NOT be manufactured for such a conversation.

#### Scenario: Existing conversation has context but no lifecycle record

- **WHEN** the user opens a persisted conversation whose Pi catalog and exact owner context exist but whose
  first-submit lifecycle record is absent
- **THEN** Desktop bootstraps the same conversation and renders its Pi transcript
- **AND** it does not create a replacement conversation, select a recent conversation, or synthesize lifecycle state

#### Scenario: Existing conversation context conflicts with the Scene

- **WHEN** the persisted context owner differs from the requested Assistant or Workspace Scene
- **THEN** bootstrap fails visibly before attaching or sending

### Requirement: Live and persisted assistant records converge by turn identity

The Agent transcript SHALL render one assistant presentation for a completed turn after both Timeline and Pi
history are available. Reconciliation SHALL use checkpoint-projected transcript identity and SHALL NOT compare
message text as identity.

#### Scenario: Live response becomes durable

- **WHEN** a Timeline assistant response completes and the same turn is committed to Pi history
- **THEN** the durable Pi assistant entry and rich Timeline presentation merge into one visible record
- **AND** reopening the application still shows one record for that turn

#### Scenario: Separate turns return the same text

- **WHEN** two different turns produce identical assistant text
- **THEN** both records remain visible because their turn and transcript identities differ

### Requirement: Agent acceptance covers the complete visible conversation lifecycle

The local Desktop acceptance SHALL use isolated fixtures, actual visible Electron controls and the configured
real provider API to validate first submit, multi-conversation switching, application reopen, transcript and
generation-record restoration, and conversation isolation.

#### Scenario: Visible full-flow acceptance

- **WHEN** the local full-flow scenario creates two conversations, submits provider-backed turns, switches
  between them and restarts the application
- **THEN** each conversation shows only its own exact user, assistant and execution records
- **AND** each completed turn has one assistant record before and after restart
- **AND** bridge-created conversations, direct turn runners and mock provider output do not satisfy the scenario

### Requirement: Agent connection replacement preserves exact cleanup isolation

Desktop SHALL distinguish active-Surface Agent operations from connection-owned projection control. An open
hidden Surface SHALL keep its own projection endpoint active, while a closed Agent adapter SHALL be able to
acknowledge cleanup only for the exact projection endpoint it created. Ordinary operations from a retired
connection remain rejected.

#### Scenario: Retired adapter releases its projection

- **WHEN** a Scene or same-View bootstrap replacement retires an Agent connection and its old adapter sends
  `projectionDetach` with that connection's exact endpoint and attachment identity
- **THEN** Desktop accepts the cleanup without requiring the retired Scene to still be active
- **AND** it does not route the detach through the replacement connection or revive retired effects

#### Scenario: Same View has multiple open conversations

- **WHEN** two retained Agent Surfaces under one Workspace View bootstrap different conversation identities
- **THEN** both exact connections remain active and isolated
- **AND** creating the second connection does not retire the first

#### Scenario: Retired adapter sends an ordinary operation

- **WHEN** the same retired connection sends a conversation, configuration, attach, acknowledge or business message
- **THEN** Desktop rejects it before any current connection effect executes

#### Scenario: Cleanup identity is unknown or forged

- **WHEN** a detach uses an unknown connection, mismatched sender identity or attachment request identity
- **THEN** Desktop fails visibly and does not report cleanup success

### Requirement: Retired Agent events cannot mutate the current conversation

Preload SHALL track Agent event sequence by exact connection lifecycle. It SHALL discard queued events from a
known retired connection and SHALL NOT project them as errors or transcript records into the current connection.

#### Scenario: Old event arrives after replacement bootstrap

- **WHEN** preload has registered a replacement connection and then receives an event queued for the known retired connection
- **THEN** no listener for the current connection receives that event or a synthetic global error
- **AND** the current connection continues from its own sequence baseline

#### Scenario: Foreign event arrives

- **WHEN** preload receives an event for an unknown or identity-conflicting connection
- **THEN** it exposes a fail-visible protocol diagnostic and does not advance any valid connection cursor

### Requirement: Unavailable conversations and Projects remain visible but inert

Desktop SHALL retain unavailable Agent conversations and Projects in their owning catalog projections with a
local diagnostic. Their primary navigation actions SHALL be disabled, and Host boundaries SHALL reject forged
open requests before any conversation context read, Workspace restore, Scene mutation or domain runtime action.
Explicit delete/remove cleanup MAY remain available.

#### Scenario: Persisted conversation has no canonical context

- **WHEN** Pi catalog contains a conversation without canonical conversation context
- **THEN** Agent Home and the Desktop sidebar still display that exact conversation with an unavailable diagnostic
- **AND** Desktop does not infer its owner from `workspaceId`
- **AND** its open action is disabled while its explicit delete action remains available

#### Scenario: Unavailable item receives a forged open request

- **WHEN** renderer or IPC sends an open request for an unavailable Conversation or Project
- **THEN** Main and package service return an owner-qualified unavailable result or fail-visible rejection
- **AND** they do not read conversation context, restore a Workspace grant, attach a runtime or mutate Scene state
- **AND** no active or recent sibling is opened as fallback

#### Scenario: Valid sibling shares the same catalog

- **WHEN** one Conversation or Project is unavailable and another has valid canonical ownership
- **THEN** only the invalid item is inert
- **AND** the valid sibling remains openable through the canonical path

### Requirement: Functional acceptance never uses the user database

Desktop functional acceptance SHALL place its runtime HOME, global SQLite database, Electron userData and
Workspace under one explicit temporary fixture root. A fixture launch that cannot prove this containment SHALL
fail before opening application storage.

#### Scenario: Isolated fixture starts

- **WHEN** the functional runner launches Desktop with an explicit temporary fixture HOME and contained userData
- **THEN** the global database resolves to `${FIXTURE_HOME}/.neko/neko.db`
- **AND** no read or write targets the user's normal OpenNeko database

#### Scenario: Fixture argument lacks an isolated HOME

- **WHEN** Desktop receives the functional fixture argument without an explicit safe fixture HOME, or with storage
  outside that root
- **THEN** startup fails before local metadata, conversation catalog or Agent storage opens
- **AND** it MUST NOT fall back to the system home or user database

### Requirement: Retained metadata is a one-time startup notice

Desktop SHALL present retained unknown Shell or Application Settings metadata as a non-blocking notice captured
only from the first authoritative Shell projection of the current Renderer startup. The notice SHALL be manually
dismissible and SHALL automatically disappear without reserving Workbench layout space. Error diagnostics SHALL
retain their existing fail-visible lifecycle.

#### Scenario: Startup projection contains retained metadata

- **WHEN** the first Shell projection reports `desktop-stored-state-metadata-retained`
- **THEN** Desktop displays the exact localized retained-field notice above the Workbench
- **AND** the user can dismiss it immediately
- **AND** it automatically disappears after the bounded startup interval

#### Scenario: Scene changes after the startup notice disappears

- **WHEN** the retained-metadata diagnostic remains in later Shell projections after the startup notice was dismissed
- **THEN** Scene, Project, Asset Center and Extensions navigation do not display the notice again
- **AND** the Workbench remains fully usable without a persistent notification layer

#### Scenario: Stored state is rejected

- **WHEN** Desktop reports a stored-state, Window, component or operation error instead of a retained-metadata warning
- **THEN** the error remains fail-visible according to its owning lifecycle
- **AND** the startup notice timeout does not hide it

### Requirement: Invalid Window presentation converges to canonical state

Desktop SHALL isolate each Window record that cannot satisfy the current Window presentation contract while
keeping valid sibling Windows and unrelated user data available. The invalid raw record SHALL NOT be serialized
back into canonical Shell state. Its diagnostic SHALL be observable in the application instance that performed
the isolation and SHALL NOT recur after the canonical state is reopened.

#### Scenario: One stored Window is invalid

- **WHEN** Shell state contains an invalid Window record beside a valid Window
- **THEN** Desktop opens the valid Window and reports the invalid Window identity for the current startup
- **AND** Project, Conversation, file and valid sibling state remain unchanged
- **AND** no old field, alternate shape or active Window fallback is used to interpret the invalid record

#### Scenario: Invalid Window is the stored primary Window

- **WHEN** the stored primary Window is invalid and no valid primary Window remains
- **THEN** Desktop creates a fresh canonical Home Window through the normal claim path
- **AND** the invalid presentation does not prevent the Shell or unrelated capabilities from starting

#### Scenario: Canonical Shell state is reopened

- **WHEN** Desktop has committed Shell state after isolating an invalid Window and the application starts again
- **THEN** only canonical valid Windows are read from storage
- **AND** the isolated Window diagnostic is not projected again
- **AND** no migration marker, internal version, compatibility reader or retained raw payload exists

### Requirement: Unavailable Project identity is rejected before restore

Desktop SHALL inspect the canonical Project identity while building the Project catalog. A registered Workspace
whose directory exists but whose identity is missing, invalid or conflicts with the registry SHALL remain visible
as an unavailable Project and SHALL be rejected before Workspace restore.

#### Scenario: Registered Workspace loses its Project identity

- **WHEN** a registered Workspace directory remains present but `neko/project.json` is missing or invalid
- **THEN** the Project catalog retains that exact Project with an item-local unavailable diagnostic
- **AND** its primary open action is disabled
- **AND** a forged open request is rejected before Workspace grant restore or Scene mutation

#### Scenario: Persisted Project and unavailable registry record share an identity

- **WHEN** Shell state contains a persisted Project and the current registry projection marks the same Project unavailable
- **THEN** the projected catalog preserves the current unavailable state instead of overwriting it with stored display data
- **AND** Host navigation uses that same unavailable fact

### Requirement: Unavailable conversation cleanup does not require Workspace restore

Desktop SHALL allow explicit deletion of a visible unavailable conversation through its exact Pi catalog identity.
Cleanup SHALL NOT require the conversation's Project to remain registered or its Workspace runtime to be attached.

#### Scenario: Unavailable Workspace conversation is explicitly deleted

- **WHEN** a visible unavailable conversation belongs to a Workspace absent from the Project catalog
- **THEN** Desktop deletes the exact persisted conversation through Agent conversation authority
- **AND** it does not resolve a Project path, restore a Workspace grant, attach a Workspace runtime or execute a domain tool
- **AND** valid sibling conversations remain unchanged

### Requirement: Composer consumes only accepted input

The Agent composer SHALL clear its draft resources only after the canonical conversation, queue or exact input
catalog path synchronously accepts the submit intent. A submit that cannot be accepted SHALL preserve the exact
text, attachments, references and context in the owning composer and SHALL remain fail-visible.

#### Scenario: A running conversation receives another message

- **WHEN** the user submits text while the exact Conversation turn is active
- **THEN** Host accepts the message through the existing conversation queue path
- **AND** the composer clears only after that acceptance receipt
- **AND** the queued text remains observable until runtime releases or cancels that exact queue item

#### Scenario: Submit is not accepted

- **WHEN** submission is rejected because the Conversation is switching, the click is a duplicate, the exact
  Conversation creator is missing, or command/Skill input cannot resolve against its exact catalog
- **THEN** the composer preserves all draft resources
- **AND** no optimistic transcript item, queue item or Host send is fabricated
- **AND** an owning diagnostic remains visible where the rejection requires user action

#### Scenario: Pending first submit reaches its new Conversation

- **WHEN** a tabless submit creates a Conversation and the owning Tab attempts the pending send
- **THEN** the pending request is consumed only when the same canonical send contract returns accepted
- **AND** a rejected attempt remains available for the owning Tab instead of disappearing

### Requirement: Pending Tool approvals are actionable above the composer

Agent Webview SHALL project every pending Tool approval in the active Conversation into one bounded approval
surface immediately above the composer. The historical Tool Call SHALL retain its factual waiting state but SHALL
NOT expose a second approval action path.

#### Scenario: One Tool waits for approval

- **WHEN** the active Conversation projection contains a Tool Call with `pendingConfirmation=true`
- **THEN** its action, description, summary and allow/deny controls are visible above the composer
- **AND** either decision submits the exact Conversation and Tool Call identity through the canonical Host contract
- **AND** the transcript Tool Call shows waiting state without actionable allow/deny controls

#### Scenario: Multiple Tool Calls wait for approval

- **WHEN** the active Conversation contains multiple pending Tool Calls
- **THEN** the approval surface retains every request in transcript order within a bounded scroll region
- **AND** no request is selected through latest, active or first-compatible fallback

#### Scenario: Conversation changes or approval resolves

- **WHEN** the user switches Conversation or a pending Tool Call receives a decision/result projection
- **THEN** the composer-adjacent surface contains only pending approvals owned by the newly active Conversation
- **AND** stale or hidden Conversation controls cannot submit a decision
