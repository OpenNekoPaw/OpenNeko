## ADDED Requirements

### Requirement: Durable records are independent from UI and runtime residency

The application SHALL keep Project, Workspace, Conversation, Room, Asset and document records according to their owning local authority without a hard total-count limit. Renderer unmount, scene navigation, runtime release and application restart MUST NOT delete, archive, hide, convert or invalidate those records.

Catalog UI SHALL project lightweight metadata and owner-qualified diagnostics and SHALL load large transcript/document content on demand. Volume SHALL be managed with search, paging, recent projections and explicit archive/delete operations rather than by retaining every record's UI/runtime or deleting history automatically.

#### Scenario: An idle historical conversation is not resident

- **WHEN** a Conversation is valid but is not visible, running, queued or waiting for approval
- **THEN** its Agent Root and Conversation runtime may be absent
- **AND** its metadata remains visible in the conversation catalog
- **AND** opening it restores the exact transcript and owner identity from local authority

#### Scenario: A durable record is unavailable

- **WHEN** a Project, Conversation, Room or document fails its owning authority qualification
- **THEN** only that record remains visible with an explicit unavailable diagnostic
- **AND** open/execute actions are disabled for that record
- **AND** valid sibling records and current scenes remain usable

### Requirement: A Window mounts a bounded set of business Roots

Each Desktop Window SHALL mount exactly one window-level PrimarySidebar and one `ControlledWorkbenchShell`. The Shell SHALL mount at most the current Scene ref for each visible slot and MAY add `Secondary Main` only for an explicit user-visible split. A current Workspace MAY simultaneously compose its Agent Interaction, Main editor, Resources and Timeline Roots, but those Roots SHALL belong to the same current composition rather than retained open instances. Desktop MUST NOT mount hidden Workbench, Agent, management, resource-page, editor or inspector Roots solely because their identities remain durable or recently visited.

#### Scenario: User navigates between primary application sections

- **WHEN** the user switches among Create, Assets, Extensions, Projects, Settings and a Workspace
- **THEN** the same Window Shell remains mounted
- **AND** the previous section's business Roots are unmounted after their owner snapshot/subscription cleanup
- **AND** the new section becomes the only current visible composition

#### Scenario: A qualified split is visible

- **WHEN** the active scene explicitly composes management with Preview/Detail or another supported split
- **THEN** the current primary and secondary Main Surface Roots are mounted as the visible split
- **AND** every other visible slot still mounts at most its one current Scene ref
- **AND** previously visited hidden Roots are not retained behind either panel

### Requirement: Entry and management navigation do not create durable Workbench instances

Create SHALL be a new-task entry action with at most one lightweight unsent draft snapshot per Window. Assets, Extensions, Projects and Settings SHALL be singleton application scenes and MUST NOT create persistent open Workbench catalogs or durable management-session identities solely to preserve renderer state.

An Assets runtime session MAY exist while the Assets scene or a protected Asset operation is active, but its identity SHALL remain owned by Assets and SHALL be released independently from Asset catalog facts.

#### Scenario: User leaves a non-empty Create draft

- **WHEN** the user navigates away from Create before submitting a non-empty draft
- **THEN** the Agent owner stores the one Window-scoped draft snapshot without retaining its React Root
- **AND** returning to Create restores that snapshot
- **AND** no Conversation or additional Workbench instance is created by navigation

#### Scenario: User revisits Settings

- **WHEN** the user leaves Settings and later opens it again
- **THEN** Settings reconstructs its current section from Host settings facts and allowed presentation snapshot
- **AND** no hidden Settings section Root or retained Settings Workbench is required

### Requirement: Background Agent execution is independent from Renderer visibility

`@neko/agent-runtime` SHALL own Conversation turn, queue, approval, lease, transcript projection and cancellation lifecycle independently from Renderer selection. Unmounting an Agent Root or switching Workspace MUST NOT cancel or redirect a running, queued or approval-waiting Conversation.

A Conversation runtime SHALL remain protected while it is visible, running, queued or waiting for user approval/question. When none of those conditions apply, the Agent application owner SHALL stop and remove the runtime without changing its durable Conversation authority. A Workspace runtime SHALL be released when it owns neither a visible Workspace/Conversation Surface nor any protected Conversation runtime.

#### Scenario: User leaves a running Conversation

- **WHEN** a Conversation is executing and the user navigates to another Workspace or management scene
- **THEN** its Agent Root is unmounted while its exact turn continues in the Agent runtime
- **AND** progress and terminal state are committed to that Conversation identity
- **AND** returning later projects the accumulated result without routing through the active Conversation

#### Scenario: An inactive Conversation becomes idle

- **WHEN** an inactive Conversation has no running turn, queued input, approval or question
- **THEN** its runtime releases its lease, subscriptions and in-memory Agent state
- **AND** its local transcript, metadata, artifacts and terminal diagnostics remain unchanged

#### Scenario: The last protected runtime leaves a Workspace

- **WHEN** a Workspace is not visible and its final protected Conversation reaches an idle terminal state
- **THEN** the Agent application owner releases that Workspace runtime and package resources
- **AND** reopening the Workspace attaches a new runtime to the same exact Workspace authority

### Requirement: Agent provider concurrency is bounded independently from history

The Agent application SHALL admit at most one provider turn per Conversation and at most two provider turns across the application during Phase 1. Additional eligible input SHALL remain in the owning Conversation queue and SHALL begin only after an application execution slot is released. Admission MUST NOT depend on the currently visible Window, Workspace or Conversation.

Approval waiting SHALL protect the Conversation runtime but SHALL NOT consume a provider execution slot after the provider/tool operation has yielded control for user input.

#### Scenario: Three Conversations request execution

- **WHEN** three independent Conversations have eligible queued turns while no provider turn is active
- **THEN** exactly two turns may execute concurrently
- **AND** the third remains visibly queued under its own Conversation identity
- **AND** it is admitted after either executing turn releases a slot

#### Scenario: One Conversation receives follow-up input while running

- **WHEN** a Conversation already has an active provider turn and receives another message
- **THEN** the new message remains in that Conversation's queue
- **AND** a second provider turn for the same Conversation does not start concurrently

### Requirement: Recoverable View state is package-owned and minimal

Each package owning a stateful Surface SHALL define the smallest snapshot required to reconstruct user-valuable presentation state after unmount. A snapshot MAY contain layout, active View identity, viewport, selection, scroll, playhead, panel expansion or unsent draft values. It MUST NOT contain Electron objects, process handles, raw paths, provider streams, duplicated transcript/domain facts or cross-package mutable state.

Desktop MUST NOT introduce a generic cross-domain cache manager or keep a hidden DOM tree as the canonical store for recoverable presentation state.

#### Scenario: User returns to an editor after navigation

- **WHEN** a Canvas, Cut or Preview Surface was unmounted after its owner committed facts and presentation snapshot
- **THEN** reopening reconstructs the editor from the same document facts and snapshot
- **AND** viewport, selection or playhead state required by that package is restored
- **AND** GPU, decoder, playback and frame-loop resources are newly authorized rather than retained while hidden

#### Scenario: User switches between exact Workspaces

- **WHEN** the user leaves Workspace A with a reconstructable Main View presentation, opens Workspace B and later selects Workspace A by its exact Project identity
- **THEN** the Window contains only Workspace B and then Workspace A as its current composition
- **AND** Workspace A reconstructs its View refs, active group and layout from its minimal Project-tab presentation snapshot
- **AND** Workspace B's Root, runtime and transient state are not retained in Workspace A's composition
- **AND** the stored snapshot is not exposed as a public Project tab field or treated as another open Workbench instance

#### Scenario: A package has no user-valuable transient state

- **WHEN** a management or detail Surface can be reconstructed entirely from current domain facts
- **THEN** it is unmounted without creating an empty snapshot record
- **AND** Desktop does not add a cache entry merely to preserve component identity

### Requirement: Host durable contracts exclude Renderer residency policy

Host Scene, Window and Workbench durable contracts SHALL contain only owner-qualified business/presentation identities, current route, layout and View references required for reconstruction. They MUST NOT contain `hot-retained`, `suspendable`, `ephemeral` or another React/DOM residency policy.

Derived owner, interaction and active Surface facts SHALL have one canonical source. Producer and consumer MUST switch atomically to the canonical shape, and the removed lifecycle/duplicate fields MUST NOT remain accepted through aliases, fallback readers or migration branches.

#### Scenario: Renderer chooses whether to mount a Surface

- **WHEN** Renderer receives the current canonical Scene projection
- **THEN** it mounts only the current and explicit split Surface refs
- **AND** no persisted lifecycle field participates in that decision

#### Scenario: One stored presentation record violates the canonical contract

- **WHEN** the canonical Host codec reads an independently identified UI presentation record that violates its current required shape
- **THEN** that record is rejected with an owner-qualified diagnostic and preserved for explicit handling
- **AND** Host does not ignore, convert, repair or successfully read the invalid record
- **AND** separate Conversation, Project, Asset, Room and document authorities remain unchanged

### Requirement: Successful scene transitions use one canonical projection update

Host scene mutation SHALL commit the current route/identity and publish one canonical projection event. Renderer SHALL apply that event as the successful transition result and MUST NOT issue an unconditional full Shell snapshot read after success.

Full snapshot reads SHALL remain available only for initial renderer attachment, renderer-session replacement, detected event sequence gaps and explicit recovery after a failed mutation.

#### Scenario: A normal scene transition succeeds

- **WHEN** Host commits a valid scene transition and emits its next projection event
- **THEN** Renderer updates from that event
- **AND** exactly one normal projection update reaches the visible Shell
- **AND** Renderer does not call `getSnapshot()` merely because the transition succeeded

#### Scenario: Renderer detects an event sequence gap

- **WHEN** the next projection event does not follow the Renderer connection's expected sequence
- **THEN** Renderer reports the sequence diagnostic and requests a full snapshot for recovery
- **AND** it does not silently continue with stale current identities

### Requirement: UI release failures remain local and visible

Surface subscription, snapshot and runtime cleanup SHALL be scoped to exact Window, Workspace, View, Conversation or management identities. A cleanup or reconstruction failure SHALL disable or replace only the affected Surface and SHALL expose an owner-qualified diagnostic. It MUST NOT blank the Window, dispose sibling background tasks or substitute another active/recent identity.

#### Scenario: One reconstructed Surface fails

- **WHEN** one package Root cannot reconstruct from its exact owner facts or snapshot
- **THEN** its Surface error boundary displays an owner-qualified unavailable state
- **AND** the PrimarySidebar, current Shell, sibling split Surface and unrelated background tasks remain usable

#### Scenario: A stale cleanup targets another instance

- **WHEN** a cleanup request carries a stale or mismatched runtime/View/Conversation identity
- **THEN** the owner rejects it visibly
- **AND** it does not release the current instance or treat cleanup as successful
