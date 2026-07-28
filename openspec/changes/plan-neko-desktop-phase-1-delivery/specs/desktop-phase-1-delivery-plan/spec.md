# Desktop Phase 1 Delivery Plan

## ADDED Requirements

### Requirement: Phase 1 is delivered through bounded dependent changes

Desktop Phase 1 MUST be implemented through bounded OpenSpec changes for foundation, Shell/state,
Agent/Home, Assets/Canvas, Cut/Preview/Media, support domains, and final qualification. Each child
change MUST define its own canonical path, replaced legacy path, tests, data impact, and completion
gate. The program MUST NOT maintain one parallel Desktop implementation until every package is
integrated.

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

Phase 1 MUST add `neko-desktop` as the canonical Desktop application identity and MUST delete or
poison the unpublished `neko-home` success path within the same migration boundary. Before removal,
the implementation MUST audit settings, conversations, project registry, credentials, trust,
installed packages, generated artifacts, and rebuildable cache, and assign exactly one explicit
reuse, migrate, rebuild, or reject-with-diagnostic disposition to each category.

#### Scenario: No legacy Desktop data exists

- **WHEN** the audit finds no valuable `neko-home` data
- **THEN** the legacy identity and success path are removed or poisoned
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
state. Projection attachment MUST be snapshot-first and MUST validate attachment identity, endpoint
and View epoch, continuous sequence, and base revision.

#### Scenario: A patch is missing or stale

- **WHEN** Renderer receives a patch before snapshot, with a sequence gap, stale View/endpoint epoch,
  wrong owner, unknown schema, or mismatched base revision
- **THEN** the attachment fails visibly and acquires a new authoritative snapshot
- **AND** it does not apply last-write-wins, active-Tab fallback, or a persisted UI cache

#### Scenario: User switches tabs during an async command

- **WHEN** a response for View A arrives after View B becomes active or View A is reopened with a new
  epoch
- **THEN** the response reconciles only with its captured owner, command id, expected revision, and
  original View epoch
- **AND** it cannot mutate View B or the new View A instance

### Requirement: Each retained package enters through its owning public path

Phase 1 MUST integrate Agent, Assets/Content/Media Library, Canvas, Cut, Preview/Media,
Generation/Quality, applicable Chara/Entity, and Tools/Diagnostics through their owning public
contracts. VS Code-specific Extension, TreeView, Custom Editor, command, URI, and message effects
MUST remain behind the VS Code adapter and MUST NOT enter Desktop.

#### Scenario: Canvas or Cut opens in Desktop

- **WHEN** Desktop opens a Canvas or Cut document
- **THEN** the full package-owned Root consumes an injected versioned Host/domain adapter and the
  canonical `.nkc` or OTIO fact
- **AND** a simplified demo surface, fixed timeline, copied store, or direct VS Code transport cannot
  return success

#### Scenario: Preview displays local content

- **WHEN** Preview displays a document, image, audio, video, or supported 3D resource
- **THEN** Host projects an authorized ContentLocator/media descriptor through the secure Desktop
  protocol
- **AND** Renderer does not receive a raw path, `file://` URL, arbitrary localhost URL, cache path, or
  Engine/client token

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
- **THEN** it exercises real Host ports, public package adapters, Pi/AgentSession, owning Jobs,
  `@neko/media`, and secure Desktop content transport
- **AND** poisoned VS Code transport, `neko-home`, Engine/client, mock stores, and demo surfaces are
  not involved

#### Scenario: Application restarts after work

- **WHEN** the Project Tab or Renderer closes and the application restarts after the workflow
- **THEN** Project, Conversation, accepted artifacts, Canvas/Cut documents, and recoverable owning
  Job facts restore from their authorities while View state restores only allowed presentation data
- **AND** no duplicate run, import, generation, or export is submitted

### Requirement: Phase 1 preserves current clients and support claims

VS Code and TUI MUST remain current product roots throughout Phase 1. Shared contract changes MUST
retain their producer/consumer tests and current runtime acceptance paths. Phase 1 MAY use
`darwin-arm64` as its Desktop reference platform but MUST NOT modify the closed release matrix or
claim Linux/Windows Desktop qualification.

#### Scenario: Shared adapter changes

- **WHEN** an existing package Root or Host controller is made host-neutral for Desktop
- **THEN** its VS Code or TUI consumer is migrated to the same canonical contract and passes its
  existing acceptance path
- **AND** Desktop does not import the old host-specific implementation

#### Scenario: Phase 1 package is demonstrated

- **WHEN** a Phase 1 Desktop package or build is produced
- **THEN** documentation identifies it as reference-platform Alpha evidence
- **AND** it does not imply Phase 2 cross-platform, Windows, plugin, MCP UI, or professional-tool
  support
