## ADDED Requirements

### Requirement: Every product surface uses one window-owned Workbench

Every Desktop product surface, including Agent, Workspace, resource center, extensions, project management and Settings, SHALL be represented as a scene inside one window-owned `ControlledWorkbenchShell`. Desktop SHALL mount exactly one Application PrimarySidebar and MUST NOT create a Home page shell, Project-owned Workbench, Settings top-level branch or scene-owned application sidebar.

The PrimarySidebar SHALL retain application navigation, recent Projects, recent Agent conversations, attention and Settings/status controls in every scene. Removing the Home page MUST NOT remove these window-level projections or their explicit open/restore/delete operations.

#### Scenario: User switches between product scenes

- **WHEN** the user moves between Agent, Workspace, resource center and Settings
- **THEN** the same PrimarySidebar and ControlledWorkbenchShell instances remain mounted
- **AND** only validated scene slots and their view-scoped adapters change
- **AND** no Home, Project or Settings shell wraps or replaces the window Workbench

#### Scenario: A scene does not require every slot

- **WHEN** a scene has no qualified producer for Interaction, Main, manager, Timeline or Status
- **THEN** that slot is omitted or displays an owner-qualified empty/unavailable Surface
- **AND** Desktop does not insert mock domain content or a technical placeholder as a successful Surface

### Requirement: Sidebar presentation is independent of scene and workspace layout

Sidebar visibility, width, hover reveal and resize lifecycle SHALL be a versioned window-level presentation aggregate with its own revision/CAS. Scene transitions SHALL preserve it and sidebar updates MUST NOT mutate Workspace Main, Dock, Timeline or display revisions.

#### Scenario: User completes sidebar resize

- **WHEN** the user resizes the expanded PrimarySidebar and ends the pointer interaction
- **THEN** its width is committed exactly once against the expected sidebar revision
- **AND** pointer ownership and the resize indicator are released
- **AND** Workspace layout state is unchanged

#### Scenario: A stale sidebar mutation arrives

- **WHEN** a sidebar toggle or resize request carries a stale Window, endpoint or sidebar revision
- **THEN** Host rejects it with a typed stale diagnostic
- **AND** it does not retry against current state or write through the legacy Workbench sidebar field

#### Scenario: Scene changes while recent navigation is populated

- **WHEN** the window transitions among Agent, Workspace, Assets, Extensions, project management or Settings scenes
- **THEN** the same PrimarySidebar continues to render recent Projects and recent Agent conversations from their authoritative projections
- **AND** selecting an item uses an exact typed Project or conversation identity
- **AND** no active, first or recent Project fallback chooses a different Workspace

### Requirement: Workbench uses explicit variable scene shapes

The shared Workbench SHALL reuse the Workspace visual/layout primitives while supporting scene-specific slot counts. It MUST NOT force every scene into the same manager/main split, reinterpret Interaction as Main, place a management Main Root in a narrow manager dock, or drop the Workspace style scope while claiming component reuse.

#### Scenario: Default Agent draft is shown

- **WHEN** no Assistant preview, Workspace or roleplay experience is active
- **THEN** the Workbench displays the complete Agent as its only business panel
- **AND** Main, Secondary Main and manager regions do not reserve visible empty columns

#### Scenario: Assistant preview is activated

- **WHEN** an Assistant session has an authorized preview
- **THEN** the Workbench displays Agent plus Preview Main using the Workspace panel geometry
- **AND** it does not replace Agent with Preview or create an independent Assistant resources sidebar

#### Scenario: Character or Chatroom scene becomes available

- **WHEN** qualified Character/Chatroom owners provide an Agent dialogue or group-chat Surface, Interactive Main and Character Manager
- **THEN** Workbench composes Agent + Interactive Main + right-side Character Manager
- **AND** before those owners exist the transition is owner-qualified unavailable rather than a Desktop placeholder success

### Requirement: Scene projections and transitions are closed and owner-validated

The Host-neutral scene authority SHALL produce a versioned projection with exact Window, scene, context and instance identities plus slot-specific Surface references. Navigation SHALL use typed transition intents with revision fencing. Desktop renderer MUST NOT infer executable scenes from route strings, active/first/recent Project fallback, arbitrary model text or component availability.

#### Scenario: Assistant scene is projected

- **WHEN** Host activates an Agent scene with an Assistant scope
- **THEN** the projection permits the exact Agent View, Assistant resources and authorized Preview session
- **AND** it excludes Workspace Main, Workspace Resources and Timeline refs

#### Scenario: Workspace scene is projected

- **WHEN** Host activates a validated Workspace grant
- **THEN** the projection permits the exact Agent View, Workspace Main, Workspace Resources and applicable Timeline/Status refs for that Workspace
- **AND** a mismatched Window, Workspace, View, epoch or conversation prevents mounting

#### Scenario: Invalid slot composition is decoded

- **WHEN** a projection puts a Surface in an incompatible slot, mixes Asset Center sessions, omits an owner identity or includes an unknown kind
- **THEN** the codec rejects the projection visibly
- **AND** Desktop does not partially render or substitute another Surface

#### Scenario: Unsupported future scene is requested

- **WHEN** navigation explicitly requests Character, Chatroom or World before its owner/runtime/Surface is qualified
- **THEN** scene authority returns an owner-qualified unavailable diagnostic
- **AND** it does not fall back to Agent, Workspace or mock content

### Requirement: The package-owned Agent Root is the sole Agent implementation

The existing package-owned `AgentWebviewRoot`, controller, composer and Host protocol SHALL serve Agent draft, Assistant session and Workspace session. Draft/session presentation MAY alter only session chrome; it MUST NOT create a Desktop composer, second controller or alternative message route.

#### Scenario: Workspace conversation renders normally

- **WHEN** AgentWebviewRoot mounts an active Workspace conversation
- **THEN** its existing Header, Tabs, history, composer, model, commands, Skills, execution/approval, voice and Host-message behavior remain unchanged
- **AND** draft-only branches do not affect its scope or route classification

#### Scenario: Desktop opens without an active conversation

- **WHEN** the initial Agent scene has no conversation
- **THEN** Workbench mounts the same AgentWebviewRoot in draft presentation
- **AND** model configuration, launch-safe commands/Skills, authorized file/reference controls and available voice controls remain usable
- **AND** conversation Tabs/history are hidden and no conversation or scratch is created by rendering or editing the draft

#### Scenario: Agent composer uses the shared compact Workbench presentation

- **WHEN** the package-owned Agent Root renders in Assistant or Workspace scope
- **THEN** the existing composer is presented as one centered, elevated input surface with an integrated Workspace context strip and compact control toolbar
- **AND** add/resource authorization, creative mode, model configuration, commands, Skills, execution/approval, usage and send/stop behavior remain available according to their existing capability projection
- **AND** Assistant scope offers explicit Workspace directory selection while Workspace scope shows only the authorized user-visible Workspace label, never an absolute path
- **AND** branch and local-runtime metadata are not added to the composer
- **AND** narrow Workbench docks keep the input, controls and upward-opening menus within the visible surface without overlap

#### Scenario: A capability requires Workspace scope

- **WHEN** an Agent draft or Assistant session encounters a Tool, command or Skill requiring Workspace files or domain mutation
- **THEN** capability projection excludes it from executable success or returns `workspace-scope-required`
- **AND** it does not use an active, recent or first Project as fallback

### Requirement: Explicit directory authorization selects Workspace scope

Workspace capability SHALL be activated only from an explicit user directory/Project selection or a persisted Workspace conversation context. Desktop Main SHALL convert native directory selection into an opaque sender-bound grant; raw absolute paths MUST NOT enter renderer, Agent messages, scene projections or durable domain facts.

#### Scenario: User selects a directory from Agent draft

- **WHEN** the user authorizes a directory
- **THEN** Host validates the grant, establishes an exact Workspace identity and activates Agent + Workspace Main + Workspace Resources composition
- **AND** the same Agent Root remains mounted
- **AND** no conversation is created until the user submits a message or explicitly creates one

#### Scenario: User cancels directory selection

- **WHEN** the native picker is cancelled
- **THEN** the current Agent scope, draft, scene and grants remain unchanged
- **AND** no empty Workspace, fallback Project or diagnostic success is created

#### Scenario: Active conversation targets another directory

- **WHEN** the user selects another directory while a conversation is active
- **THEN** the application returns `new-conversation-required`
- **AND** the original context, grants, transcript, active turn and scene binding remain unchanged

### Requirement: Assistant scope uses bounded user-space and recoverable scratch

Assistant scope SHALL use an OpenNeko-managed logical user space, explicit resource grants and conversation-scoped scratch. It MUST NOT grant the entire user Home, configuration, credentials, extension installation roots or raw local paths. Scratch identity MUST NOT be used as durable Asset or Workspace identity.

#### Scenario: Assistant conversation creates a temporary artifact

- **WHEN** an Assistant Tool creates an intermediate or output file
- **THEN** Host stores it behind a conversation-scoped `ScratchArtifactRef`
- **AND** authorized Preview can consume a short-lived descriptor without exposing its path
- **AND** the artifact remains recoverable while the conversation exists

#### Scenario: User accepts an Assistant artifact

- **WHEN** the user publishes a scratch artifact to the resource center or a Workspace
- **THEN** the owning publication port creates a durable Asset/Workspace identity before scratch cleanup
- **AND** durable facts never retain scratch paths, Preview handles or transient descriptors

#### Scenario: Conversation scratch is cleaned up

- **WHEN** the user deletes the conversation or explicitly requests cleanup
- **THEN** Agent authority releases the matching scratch lifecycle through Host ports
- **AND** published artifacts and unrelated conversations remain intact
- **AND** application exit or renderer reload does not silently delete recoverable scratch

### Requirement: First submit commits locally and starts external execution idempotently

Submitting an Agent draft SHALL validate the explicit scope and grants, atomically persist conversation context, conversation, initial user message and a durable pending-turn intent, then start provider execution idempotently with the same request/turn identity. Renderer activation MUST NOT trigger execution.

#### Scenario: Assistant draft is submitted

- **WHEN** the user submits a draft in Assistant scope
- **THEN** Agent authority commits one Assistant context, one conversation, one initial message and one pending turn
- **AND** the scene attaches the exact session without selecting any Project

#### Scenario: Workspace draft is submitted

- **WHEN** the user submits a draft under an exact Workspace grant
- **THEN** Agent authority freezes that Workspace identity in the conversation context
- **AND** the initial provider turn starts exactly once after the local commit

#### Scenario: Renderer reloads during the first turn

- **WHEN** the renderer reloads or its adapter is replaced after local commit
- **THEN** it reattaches the exact conversation and observes the existing pending/running/failed turn
- **AND** it does not duplicate the conversation, initial message, provider request or execution lease

#### Scenario: Provider startup fails

- **WHEN** provider execution cannot start after the local commit
- **THEN** the conversation and initial message remain with a typed failed or recoverable turn diagnostic
- **AND** the application does not roll back into a Home handoff, empty success or different scope

### Requirement: Resource center keeps Assets management as Main and composes optional Preview

The resource center SHALL use one Assets-owned `AssetCenterSession` for catalog, filtering, selection and revision. Workbench SHALL place the Assets Management Root in Main and MAY add a Secondary Main Preview Root bound to an authorized descriptor for the selected resource. Preview MUST NOT replace or narrow the management Main. Desktop MUST NOT own Asset selection, resource facts, ContentLocator interpretation or preview-kind policy.

#### Scenario: User opens the resource center

- **WHEN** application navigation activates the resource center
- **THEN** Workbench mounts Assets Management in Main and leaves Secondary Main absent until a preview is selected
- **AND** both use the same AssetCenterSession identity
- **AND** the window PrimarySidebar and Workbench remain mounted

#### Scenario: User selects a previewable resource

- **WHEN** Assets commits an exact resource selection
- **THEN** the Assets application service obtains an authorized preview descriptor and binds a PreviewSession to that AssetCenterSession in Secondary Main
- **AND** Preview renders through its package-owned Root without receiving a raw path

#### Scenario: Selected resource cannot be previewed

- **WHEN** the selected resource has no qualified preview producer or authorization fails
- **THEN** selection remains visible in the management Main and Secondary Main displays an owner-qualified unavailable diagnostic
- **AND** Desktop does not fake a preview, infer by extension or fall back to a raw URL

#### Scenario: Resource center scene is left

- **WHEN** another scene replaces the resource center slots
- **THEN** view-scoped Preview handles and subscriptions are released
- **AND** Assets-owned catalog and selection facts remain intact

### Requirement: Management and Settings surfaces use the same scene model

Extensions and project management SHALL place their package-owned management Roots in Main, with detail as optional Secondary Main. Settings SHALL compose its navigation and Main in the same Workbench. Their domain facts and mutations SHALL remain with their owning package or Host service; Desktop only places Roots and binds typed adapters.

#### Scenario: User opens Extensions or project management

- **WHEN** the corresponding PrimarySidebar action is activated
- **THEN** Host transitions to the exact management scene and Workbench composes its catalog plus available detail Surface
- **AND** selection does not implicitly open a Workspace or create an Agent conversation

#### Scenario: User opens Settings

- **WHEN** Settings is selected from any scene
- **THEN** Workbench composes Settings navigation and configuration Main slots inside the existing shell
- **AND** no separate Settings sidebar, top-level page branch or Workbench instance is mounted

### Requirement: Scene and Surface lifecycle remains instance-scoped

Every Agent connection, Workspace View, management session, Preview resource and subscription SHALL remain scoped to explicit Window/View/session identity. Scene activation SHALL select presentation only and MUST NOT become the owner of conversation, Workspace, Asset or configuration mutable facts.

#### Scenario: Renderer reload restores a scene

- **WHEN** the renderer reloads while any scene is active
- **THEN** it restores the exact versioned scene/sidebar projections and attaches each allowed Root to matching identities
- **AND** it does not create duplicate conversations, workspaces, AssetCenter sessions, Preview sessions, execution leases or sidebar owners

#### Scenario: A stored prelaunch management scene is upgraded

- **WHEN** Desktop reads a version 5 Shell state containing the retired `project-catalog`, `extension-catalog`, `asset-catalog` or Assistant resources Manager Surface
- **THEN** the versioned state codec migrates that exact known shape once into the canonical Main/Secondary Main or Agent-only slots
- **AND** Window, scene, management-session, Agent scope, sidebar and storage revisions remain exact
- **AND** the current stored-state version and unknown retired kinds remain fail-visible

#### Scenario: Window closes

- **WHEN** the owning Desktop window closes
- **THEN** sender-bound grants, adapters, listeners, handles and subscriptions are explicitly released
- **AND** durable conversations, published Assets, Workspace facts and application settings remain intact
