# Desktop Shell Project State

## ADDED Requirements

### Requirement: Project catalog binds canonical workspace identity

Desktop MUST resolve a selected Content workspace through the canonical workspace identity descriptor
and registry before persisting one Host-owned Project record. The renderer projection MUST NOT contain
an absolute workspace path, local credential, Host object, or filesystem capability.

#### Scenario: Open the same workspace twice

- **WHEN** one Window opens a workspace that is already present in the catalog and Project Tabs
- **THEN** Host reuses the same WorkspaceId and ProjectId and focuses the existing Tab
- **AND** it does not create a duplicate record, identity, or renderer-owned project fact

#### Scenario: Open the same project in another Window

- **WHEN** a second Window opens the same Content project
- **THEN** it receives its own ProjectTabId and View epoch bound to the same ProjectId
- **AND** both Windows subscribe to the same owner projection without sharing mutable Window state

### Requirement: Window and View state use CAS persistence

Desktop MUST persist Window/Tab/View presentation state in protected user-local storage using explicit
storage and Window revisions plus atomic replacement. Mutations with stale revisions, stale View epochs,
or mismatched Window/owner identities MUST fail visibly without changing persisted state.

#### Scenario: A stale tab activation arrives

- **WHEN** a tab activation carries an expected Window revision older than the authoritative revision
- **THEN** Host returns `desktop-shell-stale-revision`
- **AND** the active Tab and persisted layout remain unchanged

#### Scenario: Renderer reloads

- **WHEN** a renderer endpoint reloads with a new epoch
- **THEN** it acquires a new snapshot before accepting patches or command results
- **AND** old endpoint/View responses cannot mutate the restored replica

### Requirement: Shell bridge is fixed and sender-bound

Desktop MUST expose only fixed versioned Shell methods. Main MUST derive WindowId from the registered
WebContents and frame origin; renderer-supplied identities MUST only be validated as correlation data
and MUST NOT grant access.

#### Scenario: Renderer opens a Content workspace

- **WHEN** renderer invokes the fixed `openContent` method
- **THEN** Main opens the directory picker, resolves the selected workspace, and returns the requesting
  Window projection
- **AND** renderer neither submits nor receives an absolute filesystem path

### Requirement: Unsupported profiles and domains fail visibly

P1.2 MUST allow only Content projects to open. Character, World, and not-yet-integrated domain surfaces
MUST return or display typed unavailable diagnostics and MUST NOT persist an empty project, fake domain
fact, mock runtime, or successful no-op.

#### Scenario: Request a World project

- **WHEN** the user requests a World profile
- **THEN** Desktop returns `desktop-project-profile-unavailable`
- **AND** catalog revision, Window revision, Project Tabs, and workspace data remain unchanged

### Requirement: Projection attachment semantics are shared

`@neko/host` MUST provide the owner-neutral snapshot/ack/patch/detach envelope and fatal protocol
diagnostics. Agent and Desktop MUST compose their owner-specific identity onto this primitive rather
than maintaining semantically divergent protocol copies.

#### Scenario: A projection patch has a gap

- **WHEN** a consumer receives a patch before snapshot or with a non-contiguous sequence/base revision
- **THEN** the attachment enters fatal recovery and requests a fresh authoritative snapshot
- **AND** the patch is not applied to any active or fallback owner
