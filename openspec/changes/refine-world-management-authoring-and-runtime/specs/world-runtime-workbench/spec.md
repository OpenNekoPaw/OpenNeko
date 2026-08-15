## ADDED Requirements

### Requirement: Formal World runtime starts from an exact eligible WorldVersion

World Runtime SHALL create a new Run only from one exact immutable WorldVersion that passes current Foundation runtime eligibility and dependency validation. Launch SHALL require explicit confirmation of new Run, Save and initial branch identities and MUST NOT resolve latest, active, recent, name-matched or first-compatible versions. A WorldProject draft, management selection, authoring preview, mounted Studio or Workspace presentation MUST NOT be accepted as formal runtime authority.

#### Scenario: User starts a new basic World run

- **WHEN** the user selects one exact eligible WorldVersion and confirms New Run
- **THEN** World runtime creates the exact WorldRun, WorldSave and initial branch through its canonical service and enters the bound Runtime scene
- **AND** the source WorldProject and immutable WorldVersion remain unchanged

#### Scenario: Selected WorldVersion is ineligible

- **WHEN** required World data or an exact dependency cannot be resolved
- **THEN** launch is disabled with an owner-qualified diagnostic for that version
- **AND** no alternate version, empty run, partial Save or fallback runtime is created

### Requirement: Continuing runtime uses exact Run, Save and branch identities

World Runtime SHALL continue only an exact compatible WorldRun, WorldSave and branch tuple selected by the user or exact navigation action. The runtime binding SHALL be validated on every launch and mutation request. Missing, mismatched or stale identities MUST reject only that request and MUST NOT fall back to an active/recent Run, another branch, the base WorldVersion initial state or a reconstructed empty Save.

#### Scenario: User continues an existing Save branch

- **WHEN** the user selects one exact Save and one of its exact branches
- **THEN** Runtime reconstructs the authoritative state from that branch and binds the scene to the same Run/Save/branch identities
- **AND** no sibling branch or latest Save is activated implicitly

#### Scenario: Saved branch no longer resolves

- **WHEN** the requested branch identity is absent or does not belong to the requested Save
- **THEN** only continuation of that branch fails with an exact diagnostic
- **AND** sibling Saves, branches, WorldProjects and Workspaces remain usable

### Requirement: Runtime interaction follows one typed intent-event-state-view path

Every persistent World interaction SHALL name the exact runtime binding and submit a typed WorldActionIntent through the World runtime owner. Only World runtime SHALL validate it, commit a WorldEvent, derive WorldState and project participant-scoped WorldView. Renderer, Agent, management, Studio, presentation profile and external engine MUST NOT directly mutate WorldState, append event bytes or report semantic success before owner commit.

#### Scenario: User submits an allowed action

- **WHEN** Runtime Webview submits a typed action permitted by the current exact WorldView
- **THEN** World runtime validates and commits one canonical WorldEvent before returning the refreshed state/view projection
- **AND** the UI does not create a parallel optimistic World fact

#### Scenario: User submits a stale action

- **WHEN** an action is bound to a stale runtime state or another branch
- **THEN** World runtime rejects that action with a refresh/retry diagnostic scoped to the request
- **AND** no event is committed and the current Run remains usable

### Requirement: World Runtime uses an independent Workbench scene

Desktop SHALL compose formal World Runtime as an owner-qualified scene independent from World Management and Workspace Authoring. The composition SHALL expose the current WorldView/scene in Main, interaction input, participant/location/state/available-action projections, a World-owned event/checkpoint/branch timeline and exact Run/Save/branch status. It MUST NOT mount World Studio, reuse Content Cut as event authority, modify Workspace slot state or introduce a dynamic all-domain panel registry.

#### Scenario: User launches from World Management

- **WHEN** exact runtime creation succeeds
- **THEN** Desktop leaves Management presentation and mounts one World Runtime Root for the returned binding
- **AND** the management detail Root is unmounted and does not remain a hidden runtime owner

#### Scenario: User launches after authoring

- **WHEN** the user finalizes a WorldVersion and explicitly chooses Run
- **THEN** Desktop enters the independent Runtime scene without replacing or deleting the source Workspace Primary Main Board/empty presentation
- **AND** returning to that Workspace reconstructs its prior authoring presentation from owning authority and snapshot

### Requirement: Runtime Webview is a projection and intent adapter

`@neko/world-webview` SHALL render only World-owned runtime snapshots/projections and submit exact typed intents. It MUST NOT read workspace files, open the runtime repository, infer the active Run, persist Saves, maintain a second reducer as authority, retain raw ContentLocators or own background runtime lifecycle. Renderer reload SHALL reattach using explicit identities and a fresh authoritative snapshot.

#### Scenario: Runtime Webview reloads

- **WHEN** the visible Runtime Root reloads while a Run remains valid
- **THEN** it requests a fresh snapshot using the exact scene binding and renders the returned projection
- **AND** no event, Agent turn, Save or branch is duplicated

#### Scenario: Runtime binding does not match the Window scene

- **WHEN** Renderer submits a request for another Run or a stale scene binding
- **THEN** Host rejects only that sender-bound request and returns a visible diagnostic
- **AND** other Windows, Runs and package capabilities remain available

### Requirement: Runtime UI release does not own durable runtime lifetime

Leaving or replacing the World Runtime scene SHALL unmount the World Runtime Root, subscriptions and expensive presentation resources after persisting only allowed package-owned presentation state. It SHALL NOT delete, reset, redirect or transfer WorldRun, WorldSave, branch, event log or protected background operation. Runtime resources with no visible UI and no real running/queued/approval/external-operation protection SHALL be explicitly released by the World runtime owner without changing durable facts.

#### Scenario: User leaves a paused Run

- **WHEN** the user navigates to another Desktop destination and no background operation is active
- **THEN** Runtime UI/subscriptions are released and the exact Save remains durable for later continuation
- **AND** no hidden React Root or active-Workspace pointer is retained

#### Scenario: User leaves during a protected operation

- **WHEN** an exact World runtime operation is still running, queued or awaiting approval
- **THEN** the runtime owner may continue that operation without retaining the Renderer Root
- **AND** completion remains bound to the same Run/Save/branch rather than the subsequently visible Workspace

### Requirement: Runtime failures remain local and records remain visible

An invalid WorldRun, WorldSave, branch, event or projection SHALL remain visible through the owning runtime catalog with exact diagnostics whenever its stable identity is known. Only the affected operation, record or Runtime scene SHALL fail. The system MUST NOT clear the World catalog, disable unrelated capabilities, repair or rewrite authoritative bytes, switch to another Save/source or escalate a local reconstruction error to Desktop startup failure.

#### Scenario: One Save cannot be reconstructed

- **WHEN** World runtime cannot validate or replay one exact Save
- **THEN** that Save is shown as unavailable with export/repair context and continuation disabled
- **AND** sibling Saves, new runs from valid versions, World Management and other Workspaces remain usable

### Requirement: Basic World runtime does not imply complete WorldExperience availability

The Workbench introduced by this change SHALL expose only the deterministic Foundation capabilities implemented by the canonical WorldVersion/Run/Save/event/state/view path. World Story, World Gameplay, Experience composition, Character Runtime composition, Agent Play, external engine control, realtime image/video/spatial generation and continuous structural transformation SHALL remain absent or owner-qualified unavailable until their independent contracts, producers, consumers and qualification evidence exist. Package reachability or a basic Run MUST NOT mark complete WorldExperience ready.

#### Scenario: Basic runtime is available without AI providers

- **WHEN** a valid Foundation WorldVersion requires no unavailable advanced capability
- **THEN** the user can create, inspect, interact with, save, branch and continue the deterministic Run
- **AND** no model/provider selection is required for that canonical success path

#### Scenario: User requests an advanced WorldExperience capability

- **WHEN** Story, Gameplay, Agent Play or realtime presentation is not qualified
- **THEN** only that requested capability reports owner-qualified unavailable
- **AND** the valid Foundation Run and unrelated product capabilities continue to work
