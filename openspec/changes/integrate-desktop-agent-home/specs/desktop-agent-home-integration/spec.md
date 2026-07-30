## ADDED Requirements

### Requirement: Agent wire contract is Host-owned and exhaustive

The Agent Webview protocol MUST use Host-neutral message names and MUST define an exhaustive support
classification for every Webview-to-Host message type in every graphical Host. Adding a message type
MUST fail compilation or startup validation until each Host classifies it as implemented, unsupported,
or host-inapplicable.

#### Scenario: A new Agent route is added

- **WHEN** a developer adds a Webview-to-Host message without adding Electron route coverage
- **THEN** the exhaustive type check or startup diagnostic fails
- **AND** Desktop cannot start the Agent surface with partial route coverage

#### Scenario: Renderer sends an unsupported route

- **WHEN** Desktop receives a route classified as unsupported or host-inapplicable
- **THEN** Host returns a typed diagnostic containing the route and owning future slice
- **AND** it does not execute a VS Code command, return a successful no-op, or fall back to another route

### Requirement: Desktop and VS Code share one Agent message controller

Host-neutral Agent orchestration MUST be owned by `@neko/agent` and composed from responsibility-specific
route handlers. VS Code and Electron MUST inject Host effects into the same controller and MUST NOT
maintain parallel router, conversation, Tool, Skill, configuration, or projection implementations.

#### Scenario: Desktop dispatches a user message

- **WHEN** an authenticated Desktop View sends `sendMessage` for an explicit conversation
- **THEN** the shared controller invokes the canonical conversation Product Turn Bridge and Pi runtime
- **AND** no `ChatViewProvider`, `vscode.Webview`, active editor, active workspace, or Desktop-only Agent
  loop participates

#### Scenario: VS Code dispatches the same message

- **WHEN** the VS Code Webview sends the same valid message
- **THEN** the same controller and wire parser execute with VS Code-specific effects
- **AND** existing VS Code behavior remains covered by producer/consumer and Extension Host tests

### Requirement: Desktop composes the canonical Pi conversation authority

Desktop AppHost MUST compose the existing Pi conversation runtime, Pi Session JSONL, user-level
conversation catalog, fenced execution lease, Product Turn Bridge, permission, Tool/Skill,
CredentialStore and authoritative Timeline projection. It MUST NOT create or restore a legacy
`AgentSession`, second transcript, renderer-owned runtime, generic Task authority, or provider fallback.

#### Scenario: User creates and runs a conversation

- **WHEN** a Content Project user creates a conversation and submits a valid Agent turn
- **THEN** Host creates or resolves explicit conversation, branch, Pi session, turn and run identities
- **AND** Pi events update the authoritative Conversation projection before terminal Pi Session checkpoint

#### Scenario: Two Windows access one conversation

- **WHEN** two Desktop Windows attach to the same conversation and both attempt to execute
- **THEN** only the Host holding the current fenced execution lease may advance the Pi turn
- **AND** a stale lease epoch fails visibly without committing a checkpoint or projection mutation

### Requirement: Agent IPC is fixed, sender-bound and path-safe

Desktop preload MUST expose only a fixed versioned Agent namespace. Main MUST derive application,
Window, View, workspace and renderer epoch from the registered sender. Renderer messages and
projections MUST use stable content/resource identities and MUST NOT expose or trust absolute paths,
credentials, SQLite details, Host objects, runtime handles, raw IPC channels or arbitrary commands.

#### Scenario: Renderer requests a projected document

- **WHEN** Agent UI asks to reveal content using a Host-issued locator or resource identity
- **THEN** Main validates sender, owner, workspace authorization and locator containment before invoking
  the content effect
- **AND** the renderer neither sends nor receives an absolute local path

#### Scenario: Renderer forges an owner identity

- **WHEN** a renderer message names another Window, View, workspace, conversation or stale renderer epoch
- **THEN** Main rejects it with a typed identity diagnostic
- **AND** it does not use the active Project, active Tab or current conversation as fallback

### Requirement: Desktop renders package-owned Agent and Home projections

Content Project MUST render the complete package-owned `AgentWebviewRoot` with an Electron
`AgentHostRuntimeAdapter`. Home MUST render conversation and Activity summaries derived from Agent
owner projections, while full Timeline, Tool Call, Approval, Skill and Job details remain owned by
their authoritative projections.

#### Scenario: Tool execution needs approval

- **WHEN** Pi projects a Tool Call requiring creator confirmation
- **THEN** the Agent Root renders the canonical Tool confirmation state and sends approval bound to
  conversation and tool-call identity
- **AND** Home Attention reflects the needs-input summary without owning or duplicating the Tool Call

#### Scenario: Existing GenerationJob link is displayed

- **WHEN** an Agent Timeline item contains a committed GenerationJob reference or status
- **THEN** Desktop displays the immutable owning Job link/status in Agent and Activity projections
- **AND** P1.3 does not create a GenerationJob store, submit provider work, or infer an active/latest Job

### Requirement: Agent presentation and runtime recover by their owners

Renderer reload, Project Tab close, Window close, explicit cancellation and app quit MUST have distinct
lifecycle behavior. Attachments and View presentation state MUST be isolated by View epoch; conversation
runtime and durable facts MUST remain owned by AppHost/Pi/domain authorities.

#### Scenario: Renderer reloads during an active conversation

- **WHEN** the renderer reconnects with a new renderer and View epoch
- **THEN** the old connection detaches and the new View obtains a snapshot before accepting patches
- **AND** the Pi conversation is not duplicated, restarted or hydrated from renderer state

#### Scenario: Renderer repeats bootstrap within the same owner epoch

- **WHEN** React lifecycle replay or another equivalent retry repeats Agent bootstrap for the exact
  same Application, Window, Project, Workspace, View, View epoch and renderer epoch
- **THEN** Host returns the existing connection identity and refreshes its event publisher
- **AND** it does not dispose the shared controller effects or make the already-mounted Agent Root
  send through an unknown connection

#### Scenario: Application quits with a foreground run

- **WHEN** Desktop begins graceful quit while an AppHost-owned foreground Agent run is active
- **THEN** Host blocks new turns, cancels the exact run, flushes or diagnoses the terminal checkpoint,
  releases leases and disposes subscriptions, timers and handles
- **AND** it does not report success while resources or an unknown persistence outcome remain

### Requirement: Desktop presentation is light by default and localized

Desktop Shell and the package-owned Agent Root MUST render with the shared light theme semantics by
default, independent of the operating-system dark appearance. Desktop-owned visible copy, tooltips,
accessibility labels, status text and dates MUST use the shared i18n runtime with complete `en` and
`zh-cn` bundles. Desktop MUST NOT create a parallel design system or i18n service.

#### Scenario: Desktop starts without persisted presentation settings

- **WHEN** Electron mounts Home or a Content Project without an explicit future theme preference
- **THEN** the document and embedded Agent Root use the shared light theme tokens
- **AND** no dark fallback palette flashes or remains after renderer bootstrap

#### Scenario: Desktop starts in a supported locale

- **WHEN** the renderer resolves an English or Chinese locale from the host environment
- **THEN** Shell copy, accessibility labels, status text and dates render in that locale
- **AND** the same normalized locale is passed to the package-owned Agent Root

### Requirement: Home and Content Project use a creator-first workbench layout

Home MUST provide persistent product navigation, recent Project access and a focused start-creation
surface. Content Project MUST compose a collapsible primary navigation rail, package-owned Agent Root
as a Chat dock/workspace region outside the Main Creative Surface, and independent creative/resource
regions through existing shared Workbench primitives. Desktop MUST own configuration entry points;
the embedded Agent Root MUST NOT auto-open onboarding or render provider/config-file controls.
The layout MUST NOT claim Canvas, Assets or another future domain is ready before its owning slice is
connected. Content Project MUST NOT render a global Header or unified workspace Tab row; Conversation
tabs remain package-owned inside the Agent Root.

#### Scenario: User enters Home

- **WHEN** no Project Tab is active
- **THEN** Home shows persistent navigation, recent Projects/Conversations and one focused start action
- **AND** unavailable quick starts remain disabled or visibly diagnosed

#### Scenario: User opens a Content Project before P1.4

- **WHEN** the Window activates a Content Project while Canvas and Assets remain unavailable
- **THEN** the workspace keeps the Agent Chat dock, primary navigation rail and unavailable domain
  regions stable
- **AND** the future-domain regions show their owning slice and diagnostic instead of mock content or
  successful controls

#### Scenario: Desktop renders the Agent Chat dock

- **WHEN** Desktop mounts the package-owned Agent Root
- **THEN** the Root renders Conversation tabs, messages and composer directly inside the Chat region
- **AND** Agent onboarding, provider connection, config-file actions and an extra Desktop Agent
  wrapper header are absent

#### Scenario: Agent navigation remains local to the Chat dock

- **WHEN** Desktop composes Agent with another creative surface
- **THEN** Conversation tabs and actions render inside the package-owned Agent Root
- **AND** Desktop does not mirror them into a global Header or unified workbench Tab row

#### Scenario: UX refinement preserves core Desktop capabilities

- **WHEN** Home and Content Project adapt their density, navigation and panel presentation
- **THEN** real Project open/activate/close, Home conversation navigation, Agent Root mounting,
  owner projection rendering, locale and diagnostics remain reachable and testable
- **AND** unavailable Agent, Canvas and Assets regions do not render simulated prompt, authoring,
  search or success controls that could be mistaken for connected capabilities

#### Scenario: Home Agent composer is visually refined without simulated controls

- **WHEN** Desktop renders the Home start-creation surface
- **THEN** one focused composer contains the existing creation-intent input, one unified Project
  control for selecting an existing Project or opening another Project, and the submit action with
  responsive shared-theme presentation
- **AND** Project open and selection are not rendered as duplicate adjacent controls
- **AND** the creation-intent input exposes no manual resize affordance, grows and shrinks with its
  content within the composer layout bounds, and scrolls internally only after reaching its maximum
  height
- **AND** Home does not add model, Skill, version or attachment controls that are not connected to the
  canonical Agent contract

#### Scenario: Home opens the selected conversation in its owning workspace

- **WHEN** the user selects a Home conversation owned by another attached or catalogued Project
- **THEN** Desktop activates that Project View, or reopens it from the Host-owned persisted Workspace
  locator when its Tab was closed, and passes the explicit Conversation identity to the package-owned
  Agent Root
- **AND** Agent waits for conversation catalog and Tab state hydration before activation
- **AND** a missing or mismatched target fails visibly instead of opening the current active conversation

#### Scenario: Restored Project lazily reconnects its Agent workspace

- **WHEN** a persisted Project View requests Agent bootstrap after an application restart
- **THEN** AppHost resolves the Host-only persisted workspace locator and attaches its workspace runtime
- **AND** bootstrap continues only when the resolved Workspace identity matches the persisted identity

#### Scenario: Agent reads presentation context for a durable closed conversation

- **WHEN** Agent UI requests context token count before that durable Conversation has opened a Pi runtime
- **THEN** Desktop reads the active branch from the Pi conversation authority and estimates the persisted
  context through the Agent-owned token estimator
- **AND** it does not require or create a process-local Conversation owner, model binding or execution lease
- **AND** a missing Conversation fails visibly instead of returning an empty or active-Conversation fallback

#### Scenario: Host changes the active ordinary Conversation

- **WHEN** Desktop creates, activates, deletes or clears an ordinary Conversation and its Tab state changes
- **THEN** it publishes the revised canonical Tab state before the active Conversation snapshot
- **AND** the Webview establishes the Tab render and projection binding with that Host-owned Tab identity
  before the snapshot can activate it
- **AND** it does not create a transient timestamp Tab or accept projection frames for a replaced binding

#### Scenario: User resizes Content Project panels

- **WHEN** the user drags the separator for the primary sidebar, a visible left/right Agent or resource
  dock, or the visible bottom Timeline
- **THEN** the Workbench updates the panel size continuously within the owner-defined minimum and maximum
  bounds
- **AND** Desktop submits the final size once to the Host-owned Workbench projection when the resize
  session ends
- **AND** a moved dock keeps the same Agent/resource owner size, hidden panels expose no active separator,
  and renderer reload restores the Host-owned size without a parallel renderer persistence path

### Requirement: Missing future-domain routes remain fail-visible

P1.3 MUST keep Canvas authoring/Workspace Board, Character/Embody, concrete Generation/Quality Desktop
composition and plugin routes unavailable until their owning child changes update the exhaustive route
matrix and inject real domain ports.

#### Scenario: Desktop requests Canvas authoring during P1.3

- **WHEN** Agent UI or a malformed client invokes Canvas lifecycle or authoring handoff
- **THEN** Desktop returns an unsupported diagnostic naming P1.4 as owner
- **AND** it does not call the VS Code Canvas extension, a demo surface, or a mock mutation

#### Scenario: Desktop requests Character dialogue during P1.3

- **WHEN** a Character dialogue route is invoked before P1.6 composition exists
- **THEN** Desktop returns an unsupported diagnostic naming P1.6 as owner
- **AND** it does not create an empty Character session or reuse the active Agent conversation

### Requirement: P1.3 qualification proves behavior and canonical path

The change MUST provide deterministic producer/consumer, route coverage, identity, revision, reload,
multi-window, cancellation and disposal tests. Agent routing or behavior changes MUST run the focused
Agent evaluation workflow, and the final path MUST be exercised in Electron with an isolated synthetic
workspace while existing VS Code behavior is revalidated in Extension Development Host.

#### Scenario: Desktop Agent functional qualification runs

- **WHEN** the isolated scenario opens a Content Project, creates or restores a Conversation, executes a
  Pi turn, confirms a Tool Call, observes Activity and reloads the renderer
- **THEN** user-visible state and durable recovery succeed
- **AND** path evidence proves the shared controller, Pi conversation runtime, Pi Session, Product Turn
  Bridge and authoritative projection were used while VS Code, legacy AgentSession, demo/mock and
  active-object fallbacks remained poisoned
