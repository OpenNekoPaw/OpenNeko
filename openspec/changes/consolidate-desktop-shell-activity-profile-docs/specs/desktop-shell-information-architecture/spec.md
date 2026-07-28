# Desktop Shell Information Architecture

## ADDED Requirements

### Requirement: Top-level tabs represent only the project working set

The proposed Desktop Shell MUST use its top-level tab strip only for the fixed Home surface and
explicitly opened Projects. Agent Conversations, documents, editor surfaces, Tool Calls, domain Jobs,
CharacterRuns, and WorldRuns MUST NOT become top-level Project Tabs. Closing a Project Tab MUST only
detach or persist view state and MUST NOT delete project facts or implicitly cancel owned execution.

#### Scenario: Close a project with active work

- **WHEN** the user closes a Project Tab while an Agent Run or domain Job remains active
- **THEN** the Project view is detached
- **AND** each execution continues or stops only according to its explicit owner policy

#### Scenario: Open an already visible project

- **WHEN** the same Project is opened again in one Window
- **THEN** the existing Project Tab is focused
- **AND** no duplicate Project identity or runtime is created

### Requirement: Conversation tabs and UI primitives do not own Project Tab state

Project Tab state MUST remain owned by the Desktop Shell contract. Existing Agent Conversation tabs
and shared Workbench tab primitives MAY be reused as presentation components or nested views, but they
MUST NOT own Desktop Project identity, Project Tab persistence, Project lifecycle, or cross-domain
execution.

#### Scenario: Reuse a shared tab component

- **WHEN** Desktop renders Project Tabs with a shared UI primitive
- **THEN** the component receives Desktop-owned ProjectTab projections and intents
- **AND** Agent `TabState` or component-local state is not treated as the Project catalog

### Requirement: Desktop exposes activity without a global task authority

Desktop MUST present cross-project activity as read-only, navigable Attention projections. It MUST
NOT introduce a global TaskManager, generic BackgroundWork identity, cross-domain Job registry,
Activity command router, or latest/active Task fallback. Commands MUST target the exact Agent Run,
Tool Call, GenerationJob, ExportJob, CharacterRun, WorldRun, or other owning-domain identity.

#### Scenario: Review a failed export from Home

- **WHEN** Home displays a failed Cut export summary
- **THEN** the summary carries the exact Project and ExportJob owner references
- **AND** opening, retrying, or cancelling delegates to the Cut public port rather than a global Task command

#### Scenario: Close the activity projection

- **WHEN** the user closes Home Activity or a Project Context Dock
- **THEN** only its view subscription and recoverable UI state are released
- **AND** no Agent Run or domain Job is cancelled by visibility alone

### Requirement: Activity surfaces preserve owning semantics

Conversation Timeline MUST own Agent Run, Tool Call, approval, and linked Job projection. Canvas,
Cut, Character, and World surfaces MUST present their own operation, Job, Run, Save, or replay facts.
Project Tab badges and Home summaries MAY show running, needs-review, failed, or unsaved attention,
but MUST NOT become another execution fact source.

#### Scenario: A generation is started from Canvas

- **WHEN** a Canvas action submits a GenerationJob
- **THEN** Canvas presents candidate and job progress through the Generation owner contract
- **AND** Home or a Project badge only projects attention and navigation without copying lifecycle state

### Requirement: Project Profiles expose truthful maturity

Desktop documentation and future UI MUST distinguish target Profile design from currently implemented
capabilities. Content MAY compose the retained creative packages but MUST NOT claim a unified
ContentProject until its aggregate and codec exist. Character IP MUST expose only current Chara
capabilities until CharacterProject/Version and publishing are implemented. Interactive World MUST
remain unavailable until a canonical `neko-world` project/run/save path exists.

#### Scenario: Select an unimplemented World profile

- **WHEN** no accepted World project implementation exists
- **THEN** Desktop reports the Profile as unavailable or preview-only
- **AND** it does not create an empty successful project, WorldRun, or save

### Requirement: Media Library remains the single cross-project file-resource entry

Desktop Home and all Project Profiles MUST consume Media Library resources through canonical
ContentLocator and owning Content I/O contracts. Projects MUST NOT recreate Media Library membership,
link-target registries, or file-derived character identity. Candidate publication and cross-project
handoff MUST remain explicit.

#### Scenario: Use media in a character project

- **WHEN** a character project selects an image from Media Library
- **THEN** the project stores a stable resource or representation reference through the owning contract
- **AND** the file name or Media Library entry does not become Character identity

### Requirement: Current Desktop media design excludes retired Engine and client paths

Current Desktop target documentation MUST use `@neko/media`, domain-owned media ports, Node/FFmpeg,
and browser media clients. Rust Engine, EngineClient, Engine tokens, and historical viewport sessions
MUST remain explicitly historical and MUST NOT be restored as a current adapter or fallback.

#### Scenario: Define a Desktop media adapter

- **WHEN** a future Desktop implementation exposes preview, probe, waveform, or export capability
- **THEN** it composes the current host-neutral media/domain ports through typed Desktop IPC
- **AND** it does not import or emulate a retired Engine/client contract

### Requirement: Renderer state is separated by authority and view scope

Desktop MUST keep Project, Conversation, Run, Tool Call, domain Job/Run, document facts, and
cross-project Attention summaries authoritative in AppHost or the owning domain. Renderer replicas
MUST be keyed by explicit owner identity. Window layout/Project Tab state MUST be scoped by Window,
and draft/selection/scroll/viewport state MUST be scoped by View. Active selection MUST NOT become
an execution or domain fact owner.

#### Scenario: Switch tabs while a request is pending

- **WHEN** a command started from View A completes after the user activates View B
- **THEN** its result is reconciled only against the captured owner identity and View A epoch
- **AND** it does not update View B by consulting the current active Tab

#### Scenario: Restore a renderer

- **WHEN** a Renderer reloads or crashes
- **THEN** domain and execution state is rebuilt from Host snapshots
- **AND** only explicitly recoverable Window/View presentation state is restored from UI persistence

### Requirement: Projection attachments reject gaps and stale frames

Each Host projection subscription MUST begin with an authoritative snapshot and MUST bind endpoint,
attachment, Window/View, and owner identity. Live patches MUST carry a continuous sequence and
matching base/projection revision. Unknown schema, owner mismatch, stale endpoint/View epoch,
sequence gap, or base revision mismatch MUST fail visibly and trigger a fresh snapshot rather than
last-write-wins recovery.

#### Scenario: Patch arrives after a view is reopened

- **WHEN** a patch from the closed View attachment arrives after a new View epoch is active
- **THEN** the old patch is rejected
- **AND** it cannot mutate the new replica even when the Project or Conversation identity is the same

#### Scenario: Snapshot and event delivery overlap

- **WHEN** the owner changes while a new projection attachment is receiving its snapshot
- **THEN** the attachment protocol buffers or sequences the change after the acknowledged snapshot
- **AND** no update is lost between snapshot capture and live subscription

### Requirement: Mutating commands use explicit targets and concurrency tokens

Each mutating command MUST carry a unique command/idempotency identity, the originating Window/View
epoch, the exact owning target, and an expected revision when the target is revisioned. Renderer
optimism MUST remain a pending intent overlay; authoritative replica state MUST change only through
Host projection. Autosave MUST be single-flight or revision-safe so an older completion cannot clear
newer dirty state.

#### Scenario: Two windows mutate the same revision

- **WHEN** two Windows submit changes based on the same persisted revision
- **THEN** the owning service commits at most one revision or applies its explicit merge policy
- **AND** the losing command receives a typed conflict diagnostic instead of silently overwriting

#### Scenario: Retry after an uncertain external outcome

- **WHEN** IPC or an external professional tool loses the response after submitting a side effect
- **THEN** retry uses the same idempotency identity or requires explicit reconciliation
- **AND** the Renderer does not create a duplicate paid or mutating operation

### Requirement: Attention, Computer Use, and plugin panels cannot bypass state ownership

Project Tab badges and Home Activity MUST consume Host-generated summary projections with owner
identity and revision. Computer Use actions MUST bind Tool Call, target app/process/window/document,
target epoch, and observation revision; takeover or target change MUST invalidate queued stale
actions. Plugin panels MUST remain sandboxed, MUST NOT receive Shell store or domain reducer access,
and MUST have their attachments and capabilities revoked on unload or permission change.

#### Scenario: User takes over a professional application

- **WHEN** the user takes over or changes the Computer Use target after an action was proposed
- **THEN** the target epoch advances and the stale action is rejected before execution
- **AND** the visible old screenshot does not authorize the action

#### Scenario: Plugin unloads with pending messages

- **WHEN** a plugin panel is unloaded while events or commands remain in flight
- **THEN** its capability and attachment epoch is revoked
- **AND** delayed plugin messages cannot mutate Shell, Project, or domain state

### Requirement: Desktop delivery is gated in three dependency phases

The Desktop roadmap MUST order delivery as: first UI/Shell and retained-package integration, second
real cross-platform qualification, and third MCP/plugin/professional-tool integration. Later phases
MAY perform research or isolated spikes early, but MUST NOT become a product success path by
bypassing the contracts and completion gates of an earlier phase.

#### Scenario: Phase one UI is reviewed

- **WHEN** Phase 1 is presented as complete
- **THEN** a real Content workflow uses public Agent, Media Library, Canvas, Cut, Preview/Media,
  Generation/Quality, and applicable Chara/Entity/Diagnostics paths
- **AND** mock stores, no-op operations, empty Character/World projects, retired Engine/client, or
  VS Code Extension private imports do not satisfy completion

#### Scenario: Windows is added during phase two

- **WHEN** `win32-x64` is proposed as a Desktop support target
- **THEN** a separate platform-contract change provides real Windows packaging, installation,
  update, native/media, Host adapter, and creative-workflow evidence
- **AND** the current closed platform matrix is not changed by roadmap text alone

#### Scenario: A professional adapter enters phase three

- **WHEN** ComfyUI, an NLE, Blender, Unity, Photoshop, Live2D, or another professional tool is added
- **THEN** its adapter declares exact app version, platform, exchange, automation, evidence, and
  round-trip capability levels
- **AND** it reuses the single MCP/Tool Call/Approval path without silently falling back to
  Computer Use or claiming unsupported capability
