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

Sidebar visibility, width, hover reveal and resize lifecycle SHALL be a Window-owned presentation aggregate, independent from every Workbench instance. Scene transitions SHALL preserve it and sidebar updates MUST NOT mutate Workspace Main, Dock, Timeline or display state. Sidebar mutation requests SHALL carry exact Window and request identities and SHALL be serialized by that Window owner without an internal version discriminator.

#### Scenario: User completes sidebar resize

- **WHEN** the user resizes the expanded PrimarySidebar and ends the pointer interaction
- **THEN** its width is committed exactly once by the exact Window owner for that request identity
- **AND** pointer ownership and the resize indicator are released
- **AND** Workspace layout state is unchanged

#### Scenario: A stale sidebar mutation arrives

- **WHEN** a sidebar toggle or resize request carries an unknown Window, reused request identity or mismatched sidebar owner
- **THEN** Host rejects it with a typed stale diagnostic
- **AND** it does not retry against current state or write through the legacy Workbench sidebar field

#### Scenario: Scene changes while recent navigation is populated

- **WHEN** the window transitions among Agent, Workspace, Assets, Extensions, project management or Settings scenes
- **THEN** the same PrimarySidebar continues to render recent Projects and recent Agent conversations from their authoritative projections
- **AND** selecting an item uses an exact typed Project or conversation identity
- **AND** active, first or recent Project state never chooses a different Workspace

#### Scenario: User toggles the application sidebar

- **WHEN** the PrimarySidebar is expanded or collapsed in any scene
- **THEN** a dedicated icon control remains visible in the window-level sidebar chrome
- **AND** the control exposes the inverse action without using the application brand text as the only target
- **AND** the same Window-owned serialized sidebar command path handles both directions

#### Scenario: Workspace layout controls are available

- **WHEN** the active scene owns an exact Workspace Workbench composition
- **THEN** PrimarySidebar, Agent, Main and management presentation each has its own compact VS Code-style icon control in the PrimarySidebar top chrome
- **AND** each control changes only its owned region while Agent and Main keep at least one business region visible
- **AND** active, hover and keyboard-focus states do not resize or shift the control row
- **AND** no layout control is rendered in the sidebar footer, Workspace Main tab header or a domain Surface

#### Scenario: Packaged layout control icons use canonical font assets

- **WHEN** the PrimarySidebar top controls render from the packaged `openneko://desktop` application
- **THEN** their Codicon font resolves through a query-free hashed renderer asset URL with the `font/ttf` content type
- **AND** the controls remain visibly identifiable while query-bearing application asset URLs continue to fail closed

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

The Host-neutral scene authority SHALL produce one canonical projection with exact Window, scene, context and instance identities plus slot-specific Surface references. Navigation SHALL use typed transition intents carrying exact request and target identities, and each Window owner SHALL serialize its scene mutations. Desktop renderer MUST NOT infer executable scenes from route strings, active/first/recent Project selection, arbitrary model text or component availability.

#### Scenario: Assistant scene is projected

- **WHEN** Host activates an Agent scene with an Assistant scope
- **THEN** the projection permits the exact Agent View, Assistant resources and authorized Preview session
- **AND** it excludes Workspace Main, Workspace Resources and Timeline refs

#### Scenario: Workspace scene is projected

- **WHEN** Host activates a validated Workspace grant
- **THEN** the projection permits the exact Agent View, Workspace Main, Workspace Resources and applicable Timeline/Status refs for that Workspace
- **AND** a mismatched Window, Workbench, Workspace, View, connection or conversation prevents mounting only that Surface

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

#### Scenario: Start Creating opens a fresh Entry Draft

- **WHEN** the user activates Start Creating from any draft, session, Workspace or management scene
- **THEN** Host allocates a new exact draft identity in an unbound Agent scene
- **AND** the scene has no conversation, AssistantSpace, Workspace, Character or Room binding
- **AND** no existing conversation is opened, changed or deleted

#### Scenario: A new draft replaces visible session state

- **WHEN** the same Agent Root observes a different draft identity after showing a session
- **THEN** the package-owned controller clears open Tabs, active conversation, transcript subscriptions, entry input/references and transient errors for the old presentation instance
- **AND** it retains global model catalogs and user settings
- **AND** Desktop does not remount a second controller or infer the reset from active Project state

#### Scenario: User selects an explicit owner from Entry Draft

- **WHEN** the user explicitly chooses a Workspace directory/Project or a future Character/Room for the current exact draft
- **THEN** the owning adapter returns one exact target receipt for that draft and the package-owned Draft snapshot replaces its previous target selection
- **AND** the Entry Draft remains in the same unbound Agent-only Scene without creating a conversation, Workspace composition or provider turn
- **AND** the first submit freezes the target and configuration, creates one exact conversation/session and atomically activates its Agent phase and owner-qualified layout
- **AND** a stale draft identity or unavailable Character/Room owner fails visibly

#### Scenario: Direct Entry Draft submit uses Assistant

- **WHEN** the user submits a first message from an `unbound` Agent presentation without selecting a Project directory, Character or Room
- **THEN** the package-owned Agent entry path deterministically selects Assistant user-space
- **AND** it binds the exact current draft and commits the first Assistant conversation through the canonical draft-submit transaction
- **AND** no owner-selection card blocks sending and active, first or recent Project state does not participate

#### Scenario: Direct Entry Draft submit carries an authorized file

- **WHEN** the user explicitly authorizes a file in the exact `unbound` Entry Draft and submits directly
- **THEN** Host validates every requested grant before mutation and binds only that launch connection and draft's grants to the exact AssistantSpace
- **AND** the canonical first-submit transaction consumes the authorized file under Assistant scope
- **AND** missing, cross-connection, cross-draft or previously bound grants fail visibly without partially rebinding the remaining grants
- **AND** an idempotent retry for the same AssistantSpace does not duplicate or expand authorization

#### Scenario: Workspace target selection keeps the Entry presentation

- **WHEN** an exact Entry Draft is bound to a Workspace through a directory or Project selection
- **THEN** the same Agent Root remains in the unbound Entry Draft presentation and records one Workspace target receipt
- **AND** the Scene does not expose Workspace Main, Workspace Resources, Timeline or a Workspace session before submit
- **AND** ordinary message text cannot fabricate the directory grant or Workspace identity

#### Scenario: Workspace conversation renders normally

- **WHEN** AgentWebviewRoot mounts an active Workspace conversation
- **THEN** its transcript, model, typed commands/Skills, execution/approval, voice and Host-message behavior remain attached to the exact Workspace runtime
- **AND** Desktop dock does not render an empty package Header or its divider after the conversation starts
- **AND** removing that inner divider does not remove, flatten or recolor the owning Workbench panel's outer border or rounded shell chrome
- **AND** the shared conversation composer omits the locked Workspace label, Agent mode selector and `/` or `$` shortcut buttons while typed command and Skill discovery remains available
- **AND** draft-only branches do not affect its scope or route classification

#### Scenario: Workspace scene restores an active conversation

- **WHEN** the exact Workspace scene scope contains a conversation identity
- **THEN** the Workspace-bound Agent Root opens that exact conversation rather than rendering the draft Entry EmptyState
- **AND** its header, transcript, turn state and composer remain attached to the Workspace runtime

#### Scenario: Conversation restore activates its complete Workspace presentation

- **WHEN** the user opens an exact persisted Workspace conversation from any other scene
- **THEN** Host commits the target Project attachment, Workbench layout, Workspace Scene and Agent session phase as one stored presentation transition
- **AND** transition success is returned only after the exact conversation scope can bootstrap against that Scene
- **AND** renderer never exposes the conversation transcript in the previous draft or management layout

#### Scenario: Desktop opens without an active conversation

- **WHEN** the initial Agent scene has no conversation
- **THEN** Workbench mounts the same AgentWebviewRoot in draft presentation
- **AND** model configuration, launch-safe commands/Skills, authorized file/reference controls and available voice controls remain usable
- **AND** conversation Tabs/history are hidden and no conversation or scratch is created by rendering or editing the draft

#### Scenario: Agent-only draft uses the complete Agent layout

- **WHEN** the Agent draft is the only business panel in a wide Workbench
- **THEN** the package-owned EmptyState and composer share one bounded readable width and alignment
- **AND** the dock presentation remains responsive when the same Root is composed in a narrow Workspace Agent panel

#### Scenario: Agent composer uses the shared compact Workbench presentation

- **WHEN** the package-owned Agent Root renders in Assistant or Workspace scope
- **THEN** the existing composer is presented as one centered, elevated input surface with a compact control toolbar
- **AND** Entry offers explicit single-target Workspace selection while conversation scope does not repeat its locked Workspace identity inside the composer
- **AND** add/resource authorization, model configuration, typed commands/Skills, execution/approval, usage and send/stop behavior remain available according to their existing capability projection
- **AND** branch and local-runtime metadata are not added to the composer
- **AND** narrow Workbench docks keep the input, controls and upward-opening menus within the visible surface without overlap

#### Scenario: Window owner commits resize independently from legacy navigation target

- **WHEN** the user resizes the current Agent, Main or management composition
- **THEN** Host validates the mutation against the exact current Workbench Scene owner and its Workspace identity when present
- **AND** a stale or non-Project legacy navigation target does not reject the current Scene's valid layout mutation
- **AND** a Workspace layout containing a View from another Project or Workspace remains rejected at that Workbench boundary

#### Scenario: A capability requires Workspace scope

- **WHEN** an Agent draft or Assistant session encounters a Tool, command or Skill requiring Workspace files or domain mutation
- **THEN** capability projection excludes it from executable success or returns `workspace-scope-required`
- **AND** it does not substitute an active, recent or first Project

### Requirement: Explicit directory authorization selects Workspace scope

Workspace capability SHALL be activated only from an explicit user directory/Project selection or a persisted Workspace conversation context. Desktop Main SHALL convert native directory selection into an opaque sender-bound grant; raw absolute paths MUST NOT enter renderer, Agent messages, scene projections or durable domain facts.

#### Scenario: User selects a directory from Agent draft

- **WHEN** the user authorizes a directory
- **THEN** Host validates the grant, establishes an exact Workspace identity and returns a target receipt bound to the current draft
- **AND** the same Agent Root remains mounted
- **AND** the active Scene and composition remain Agent-only and no conversation is created until the user submits a message

#### Scenario: User selects an existing Project from Agent draft

- **WHEN** the user selects an exact available Project from the Entry composer
- **THEN** Host returns one Workspace target receipt without changing active Project, Workbench or Scene
- **AND** the receipt replaces any prior Entry target because only one target can be submitted
- **AND** an unavailable Project fails locally while preserving the prior Draft input, target and configuration

#### Scenario: User cancels directory selection

- **WHEN** the native picker is cancelled
- **THEN** the current Agent scope, draft, scene and grants remain unchanged
- **AND** no empty Workspace, substituted Project or diagnostic success is created

#### Scenario: Active conversation targets another directory

- **WHEN** the user selects another directory while a conversation is active
- **THEN** the application returns `new-conversation-required`
- **AND** the original context, grants, transcript, active turn and scene binding remain unchanged

#### Scenario: Active conversation reopens its current Project

- **WHEN** the user selects the exact current Project from PrimarySidebar while its Workspace conversation is active
- **THEN** Host treats the typed navigation as an idempotent transition to the existing scene
- **AND** it does not report `new-conversation-required`, create a grant or rebind the conversation

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

Submitting an Agent draft SHALL validate the explicit scope and grants, atomically persist conversation context, conversation, initial user message and a durable pending-turn intent in lifecycle authority, materialize that exact conversation identity in the scope-owned Agent workspace, then start provider execution idempotently with the same request/turn identity. Renderer activation MUST NOT trigger execution, and session Scene activation MUST NOT succeed before materialization can bootstrap the exact conversation. Pi terminal checkpoints SHALL be written only by actual turn execution and MUST NOT be fabricated to represent the lifecycle pending intent.

#### Scenario: Assistant draft is submitted

- **WHEN** the user submits a draft in Assistant scope
- **THEN** Agent authority commits one Assistant context, one conversation, one initial message and one pending turn
- **AND** the scene attaches the exact session without selecting any Project

#### Scenario: Workspace draft is submitted

- **WHEN** the user submits a draft under an exact Workspace grant
- **THEN** Agent authority freezes that Workspace identity in the conversation context
- **AND** Host activates Agent + Workspace Main + Workspace Resources only after the exact conversation is materialized
- **AND** the initial provider turn starts exactly once after the local commit

#### Scenario: Draft submit fails before local commit

- **WHEN** target, grant, model configuration or local persistence validation rejects the first submit
- **THEN** the Entry Scene remains active and its input, references, target and configuration selections remain unchanged
- **AND** no conversation, pending turn, provider execution or target Scene is created

#### Scenario: Renderer reloads during the first turn

- **WHEN** the renderer reloads or its adapter is replaced after local commit
- **THEN** it reattaches the exact conversation and observes the existing pending/running/failed turn
- **AND** it does not duplicate the conversation, initial message, provider request or execution lease

#### Scenario: A committed first submit is replayed after provider claim

- **WHEN** lifecycle metadata and the provider execution claim exist but the exact scope-owned Agent workspace conversation is missing
- **THEN** Agent authority idempotently materializes the exact committed conversation before returning the record
- **AND** the Assistant or Workspace bootstrap succeeds against that exact identity
- **AND** provider execution is not claimed or started again
- **AND** an existing mismatched conversation or checkpoint fails visibly instead of falling back to the active conversation

#### Scenario: Entry Draft connection becomes a session connection

- **WHEN** first submit activates the committed session and replaces the launch projection endpoint
- **THEN** the existing Agent Root retires every launch attachment through the old launch binding before attaching through the new session binding
- **AND** the session Scene, scope, conversation and endpoint identities match before the next message is accepted
- **AND** stale endpoint frames and identity mismatches remain fail-visible
- **AND** Desktop does not remount a second Agent controller or suppress attachment errors

#### Scenario: Provider startup fails

- **WHEN** provider execution cannot start after the local commit
- **THEN** the conversation and initial message remain with a typed failed or recoverable turn diagnostic
- **AND** the application does not roll back into a Home handoff, empty success or different scope

#### Scenario: A persisted Pi turn contains an error diagnostic

- **WHEN** an assistant transcript entry has `stopReason: error` and a non-empty `errorMessage`
- **THEN** the Agent transcript projects that diagnostic into the conversation-scoped error message
- **AND** an empty assistant content array does not reduce it to a label-only Error card
- **AND** Desktop does not retry, hide or rewrite the failed turn as success

### Requirement: Resource center keeps Assets management as Main and composes optional Preview

The resource center SHALL use one Assets-owned `AssetCenterSession` for catalog, filtering, selection and owner-serialized mutation. Workbench SHALL place the Assets Management Root in Main and MAY add a Secondary Main Preview Root bound to an authorized descriptor for the selected resource. Preview MUST NOT replace or narrow the management Main. Desktop MUST NOT own Asset selection, resource facts, ContentLocator interpretation or preview-kind policy.

#### Scenario: User opens the resource center

- **WHEN** application navigation activates the resource center
- **THEN** Workbench mounts Assets Management in Main and leaves Secondary Main absent until a preview is selected
- **AND** both use the same AssetCenterSession identity
- **AND** the window PrimarySidebar and Workbench remain mounted

#### Scenario: User selects a previewable resource

- **WHEN** Assets commits an exact resource selection
- **THEN** the Assets application service obtains an authorized preview descriptor and binds a PreviewSession to that AssetCenterSession in Secondary Main
- **AND** Preview renders through its package-owned Root without receiving a raw path
- **AND** the authorized Preview and Workspace Preview reuse the same package-owned preview presentation and viewer registry

#### Scenario: Workbench Preview avoids duplicate chrome

- **WHEN** a Workspace Preview View or Asset Center authorized Preview is active inside a Workbench panel shell
- **THEN** the canonical Preview Root renders its content-only presentation without a second file header or tab strip
- **AND** Preview content inherits the containing shell theme without introducing a package-local panel background

#### Scenario: Selected resource cannot be previewed

- **WHEN** the selected resource has no qualified preview producer or authorization fails
- **THEN** selection remains visible in the management Main and Secondary Main displays an owner-qualified unavailable diagnostic
- **AND** Desktop does not fake a preview, infer by extension or fall back to a raw URL

#### Scenario: Resource center scene is left

- **WHEN** another scene replaces the resource center slots
- **THEN** the Asset Center management and Preview/page Roots are unmounted
- **AND** Assets owner preserves only the exact selection, filter and other required presentation snapshot
- **AND** authorized Preview handles, subscriptions and idle runtime resources are released without changing Asset catalog facts

### Requirement: Management and Settings surfaces use the same scene model

Extensions and project management SHALL place their package-owned management Roots in Main, with content-rich owner-qualified detail as optional Secondary Main. Settings SHALL compose its navigation and Main in the same Workbench. Their domain facts and mutations SHALL remain with their owning package or Host service; Desktop only places Roots and binds typed adapters.

#### Scenario: User opens Extensions or project management

- **WHEN** the corresponding PrimarySidebar action is activated
- **THEN** Host transitions to the exact management scene and Workbench composes its catalog plus available detail Surface
- **AND** selection does not implicitly open a Workspace or create an Agent conversation
- **AND** the management Root retains the bounded page width, header hierarchy, toolbar grouping and scan-friendly catalog density of the established management presentation instead of stretching controls across the full Main canvas

#### Scenario: Management selection opens Preview or Detail

- **WHEN** Assets, Extensions or Projects provides a selected Preview/Detail Surface
- **THEN** Workbench composes management beside Preview/Detail using the shared Workspace panel chrome and resize primitive, with management occupying at least half of the available split area
- **AND** Preview content continues through the canonical `@neko/preview-webview` presentation and viewer registry
- **AND** Desktop does not implement another viewer, nested page card or management-owned preview renderer

#### Scenario: Low-information Project selection remains in management Main

- **WHEN** a Project catalog selection has no content-rich owner-qualified Detail Root
- **THEN** Workbench keeps Project Management as the only Main shell and does not reserve a Secondary Main column or resize gutter
- **AND** the selected row exposes a separate explicit open action without making selection itself open the Workspace

#### Scenario: Management and detail use independent tabless shells

- **WHEN** Assets, Extensions or Projects composes management beside Preview/Detail
- **THEN** management and Preview/Detail occupy two independent shared panel shells connected by the shared resize primitive
- **AND** each sibling shell has its own DOM, border, radius, background, clipping and overflow boundary with a visible gutter between them
- **AND** the composition does not render both contents on one continuous Main surface separated only by a line
- **AND** neither shell renders a synthetic single-item Workbench tab strip
- **AND** Preview/Detail content does not render a descriptor header and inherits the same theme background as its sibling management shell

#### Scenario: User resizes a management and detail split

- **WHEN** Assets, Extensions or Projects displays a qualified Preview/Detail and the user drags the shared resize gutter
- **THEN** the management Main remains at least as wide as the Preview/Detail panel
- **AND** the resize contract rejects ratios below one half while preserving the full-width management layout when Secondary Main is absent

#### Scenario: Workspace resources omit redundant global refresh

- **WHEN** the Workspace Resource Browser is composed in the right manager slot
- **THEN** its package-owned Root hides the top-level global refresh control
- **AND** source recovery, relink and other domain-specific resource actions remain available

#### Scenario: User opens Settings

- **WHEN** Settings is selected from any scene
- **THEN** the window composes the current Settings navigation and configuration Main inside the existing shell chrome
- **AND** Settings facts and the current section projection reconstruct the visible Roots without retaining hidden section Roots
- **AND** no separate application sidebar or top-level page shell is mounted

### Requirement: Scene and Surface lifecycle remains instance-scoped

Every Agent connection, Workspace View, management session, Preview resource and subscription SHALL remain scoped to explicit Window/View/session identity. Scene activation SHALL select presentation only and MUST NOT become the owner of conversation, Workspace, Asset or configuration mutable facts.

#### Scenario: React StrictMode remounts scene effects

- **WHEN** development React performs its setup, cleanup and setup cycle for a scene subscription
- **THEN** subscription cleanup releases only that subscription and the exact runtime remains active for the second setup
- **AND** final scene removal or identity replacement disposes the runtime exactly once
- **AND** operations after final disposal still fail visibly

#### Scenario: Desktop renderer starts with an Asset Center scene

- **WHEN** Desktop restores or opens an Asset Center scene in development or packaged Electron
- **THEN** the renderer mounts a non-empty Workbench without uncaught runtime-disposed exceptions
- **AND** reload restores the exact scene/session and does not leak duplicate subscriptions or Preview handles

### Requirement: Recent navigation distinguishes sessions from containers

PrimarySidebar SHALL keep owner-qualified recent session and recent container projections. Selecting a recent session SHALL restore its exact interactive session. Selecting a Project or future Character/Room container SHALL open that owner and create a new bound draft, not restore an unrelated prior conversation or expose an internal role AgentSession.

#### Scenario: User selects a recent conversation

- **WHEN** a recent Assistant, Workspace, Character dialogue or Room session is selected
- **THEN** Host restores that exact top-level session identity and its complete Workbench/Agent state atomically
- **AND** no first, active or recent container state chooses another owner

#### Scenario: User selects a recent Project

- **WHEN** a recent Project is selected without an explicit conversation identity
- **THEN** Host opens that exact Workspace and a new Workspace-bound draft
- **AND** no old Project conversation is opened implicitly

#### Scenario: Renderer reload restores a scene

- **WHEN** the renderer reloads while any scene is active
- **THEN** it restores the exact canonical scene/sidebar records and attaches each allowed Root to matching identities
- **AND** it does not create duplicate conversations, workspaces, AssetCenter sessions, Preview sessions, execution leases or sidebar owners

#### Scenario: Persisted Agent Surface points to a rejected Conversation owner

- **WHEN** Window claim finds a stored session Agent Surface whose exact `conversationId + owner` is absent from the canonical owner-qualified Agent catalog
- **THEN** Host rejects only that Shell Surface binding before renderer bootstrap and keeps valid sibling Workbenches and Agent Surfaces available
- **AND** an invalid active Surface is replaced by a fresh draft in the same AssistantSpace or Workspace owner so the Workbench remains usable
- **AND** Desktop projects the matching `invalid-conversation-record` diagnostic instead of throwing from the bootstrap IPC handler
- **AND** the original Conversation authority record and Pi transcript remain unchanged and are not converted, deleted or rebound
- **AND** bootstrap retains strict context qualification and does not fall back to an active or recent Conversation

#### Scenario: User closes the last Workspace Main View

- **WHEN** the only Workspace Main View is closed
- **THEN** Workbench retains its empty primary group and Scene removes the Main and unowned Timeline refs
- **AND** the exact Workspace Agent Interaction and Workspace Resources remain active and usable
- **AND** renderer projection, Preview cleanup and later workbench mutations do not require a fabricated active Main View

#### Scenario: One stored scene record is invalid

- **WHEN** Desktop reads multiple independently identified Window/Workbench scene records and one record does not satisfy the canonical shape
- **THEN** the codec leaves that record unchanged and reports its exact Window/Workbench identity
- **AND** valid sibling Window, Workbench, management-session and Agent records remain available
- **AND** product startup does not convert, rebuild, import or route the invalid record through an older reader

#### Scenario: The stored primary Window uses a superseded shape

- **WHEN** the primary Window record contains non-canonical fields such as the replaced singular `scene` and `workbench`
- **THEN** Host excludes that exact Window from the runnable catalog and creates a new canonical Entry Draft Window
- **AND** Desktop renders the new Workbench together with an exact rejected-Window diagnostic instead of failing startup
- **AND** the rejected Window object remains preserved by the Shell serialization boundary and is neither converted nor silently deleted
- **AND** valid Project records and sibling Windows remain available for explicit reopening

#### Scenario: The stored Shell root uses a superseded shape

- **WHEN** the Shell authority document fails the canonical root codec before individual Windows can be parsed
- **THEN** Local Metadata atomically preserves the exact original document and storage revision in a separate quarantine record
- **AND** initializes a new empty canonical Shell authority so Desktop can open a new Entry Draft Window
- **AND** Host projects an explicit invalid-stored-state diagnostic in the new Window
- **AND** Settings, Project files, Agent conversations, Assets and every other authority remain unchanged
- **AND** the old root is not converted, ignored by a compatibility reader, or reported as a successful restore
- **AND** a quarantine write or replacement failure remains startup-blocking and fail-visible

#### Scenario: The stored Application Settings root uses a superseded shape

- **WHEN** the independent Desktop Application Settings authority fails its canonical root codec
- **THEN** Local Metadata atomically preserves its exact original document and storage revision in a separate quarantine record
- **AND** initializes only canonical default Application Settings so Desktop can continue opening
- **AND** Host projects an explicit authority-qualified invalid-stored-state diagnostic in the new Window
- **AND** Shell, Project files, Agent conversations, Assets and every other authority remain unchanged
- **AND** Settings recovery does not run unless the Settings codec rejects that exact authority
- **AND** a quarantine write or replacement failure remains startup-blocking and fail-visible

#### Scenario: Window closes

- **WHEN** the owning Desktop window closes
- **THEN** sender-bound grants, adapters, listeners, handles and subscriptions are explicitly released
- **AND** durable conversations, published Assets, Workspace facts and application settings remain intact

### Requirement: Window restores independent Workspace presentation without retained Roots

The Window-owned shell SHALL keep one current Scene/Workspace composition and SHALL NOT use an open Workbench
catalog to retain every visited Root. Each Workspace owner SHALL persist its own durable facts and minimal layout/View
snapshot. Switching Workspace SHALL unmount inactive UI after snapshot cleanup while exact background tasks continue
under package runtime ownership.

#### Scenario: User switches between two open Workspaces

- **WHEN** Workspace A and Workspace B are both open and the user activates B after editing A
- **THEN** A commits its exact layout, Main View, manager selection and Timeline snapshot before its Roots unmount
- **AND** B displays its own independent state
- **AND** switching back to A reconstructs package Roots from A's durable facts and snapshot
- **AND** A's running tasks continue under their exact task/runtime identities without requiring hidden Roots

#### Scenario: User changes one Workspace layout

- **WHEN** the user resizes, opens, closes or reorders panels in Workspace A
- **THEN** only A's Workbench owner commits the layout mutation
- **AND** Workspace B and the Assistant Workbench retain their layouts and mutable state

#### Scenario: Inactive Workspace runtime becomes idle

- **WHEN** Workspace A is not visible and owns no running, queued or approval-waiting task
- **THEN** its package runtimes, subscriptions and resource handles are released exactly once
- **AND** A's Project, documents, conversations and recoverable View snapshots remain available
- **AND** the active Workspace remains mounted and unaffected

### Requirement: Agent conversations retain independent task state without retained Webviews

Every Agent Conversation SHALL own an independent transcript, queue, turn, approval and recoverable presentation
state in Agent-owned authority. Desktop SHALL mount only the current or explicitly split Agent Root. Renderer selection
MUST NOT own or redirect Conversation task state, and an inactive running Conversation MUST NOT require a hidden
Webview Root or connection to continue.

#### Scenario: User switches conversations inside one Workspace

- **WHEN** two Agent conversations are open in the same Workspace Workbench
- **THEN** the outgoing Root commits its required input/scroll snapshot and unmounts
- **AND** the incoming Root reconstructs from its exact transcript, configuration, run state and presentation snapshot
- **AND** the two Conversations remain isolated without two mounted Webview Roots

#### Scenario: New conversation targets an already open Workspace

- **WHEN** the user creates or restores another Agent conversation whose exact `workspaceId` is the current Workspace
- **THEN** Host activates that exact Conversation in the current Workspace composition
- **AND** it does not open a second Workspace Workbench or reset the Workspace layout and Views

#### Scenario: Inactive Agent runtime reaches releasable lifecycle

- **WHEN** its Conversation is inactive with no running turn, queued input, approval or question
- **THEN** only that Conversation runtime's lease, subscription, projection attachment and in-memory Agent state are released
- **AND** its durable transcript and sibling Conversations remain available

#### Scenario: Hidden Agent task produces progress

- **WHEN** a running inactive Conversation produces progress while no Agent Root is mounted for it
- **THEN** Agent runtime commits progress to that exact Conversation projection and durable authority
- **AND** reopening the Conversation projects the accumulated progress without routing through the visible Conversation
- **AND** stale, unknown or forged runtime identities remain fail-visible

### Requirement: Navigation reconstructs Surfaces from owner facts and minimal snapshots

Each stateful product Surface SHALL keep durable business facts and required recoverable presentation snapshots with
its owning package. Workbench, Main tab, resource page and Canvas node navigation SHALL mount only current or
explicitly split Roots and MUST NOT retain hidden component trees as mutable state owners. Host durable contracts
MUST NOT classify Renderer instances as `hot-retained`, `suspendable` or `ephemeral`.

#### Scenario: User switches Workbench shell or panel

- **WHEN** the user moves between Agent, Main, Manager, Preview/Detail or Timeline compositions
- **THEN** the outgoing owner commits required layout, scroll and pending UI snapshot before unmount
- **AND** the incoming Root uses only its own owner facts and snapshot
- **AND** background package runtime lifetime remains independent from Root visibility

#### Scenario: User switches Main tabs

- **WHEN** the user activates another Canvas, Cut, Model or Preview tab in a Workbench group
- **THEN** the outgoing tab Root unmounts after its owner saves the required View snapshot
- **AND** GPU, decoder, playback and frame-loop resources are released for the inactive tab
- **AND** switching back restores the same viewport, selection, playhead/editor and transient UI state without reloading existing business data or showing an empty shell
- **AND** closing a tab releases only that View and its owned resources

#### Scenario: User switches resource management pages

- **WHEN** the user changes directory, media library, material library, entity, detail or preview pages within an open resource manager
- **THEN** only the current page and explicit Preview/Detail split Roots remain mounted
- **AND** package-owned resource facts and required filter/selection snapshots remain independent from page mounting
- **AND** removing a resource fact does not discard unrelated page snapshots or durable records

#### Scenario: User switches Canvas nodes

- **WHEN** the user selects node B after editing node A in the same Canvas
- **THEN** the Canvas owner commits A's required editor/inspector snapshot and unmounts A's UI
- **AND** B uses its own node-qualified UI while consuming current Canvas-owned node facts
- **AND** selecting A again restores its uncommitted control, expansion and scroll state
- **AND** the inactive media/GPU viewer releases playback, decoder, frame-loop and GPU handles without discarding its recoverable snapshot
- **AND** deleting A releases only A's facts and snapshot after the Canvas owner commits deletion

#### Scenario: Parent instance becomes hidden

- **WHEN** a Workbench or shell becomes inactive while one of its descendants owns a background task
- **THEN** its Renderer descendants unmount after snapshot cleanup
- **AND** the exact task runtime continues under its package application owner
- **AND** idle subscriptions, media handles and UI runtimes are released without waiting for an explicit delete/archive action

#### Scenario: Modal or context dialog closes

- **WHEN** a Modal, Dialog, context menu or context editor invocation ends
- **THEN** its invocation instance and uncommitted invocation-local state are disposed
- **AND** reopening for another target creates a new invocation identity initialized from that target's current owning facts
- **AND** no prior target's draft, validation error or selection leaks into the new invocation

#### Scenario: An unmounted view resumes offline

- **WHEN** an editor is reconstructed while an API or network provider is unavailable
- **THEN** it restores its owner model, last durable or shadow draft and UI snapshot without refetching already available business data
- **AND** unavailable external refresh or execution is reported separately without clearing the restored view

#### Scenario: Window or user context terminates

- **WHEN** the owning Window closes or a future user/account context is replaced
- **THEN** every mounted Root, protected runtime, handle and subscription is disposed exactly once
- **AND** user-scoped in-memory snapshots and pending UI drafts do not leak into the next context
- **AND** durable project, conversation and explicitly persisted shadow data follow their owning retention policy
