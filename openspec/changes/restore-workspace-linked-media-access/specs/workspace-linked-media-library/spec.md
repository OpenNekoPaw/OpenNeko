## ADDED Requirements

### Requirement: Managed Workspace links project authorized global Media Libraries

Every available project Media Library SHALL have one direct managed symbolic link or Windows directory
junction at `neko/assets/<libraryName>`. The link SHALL be derived from an exact target-free project binding
and exact user-global Media Library connection. A link MUST NOT replace either authority.

#### Scenario: Associate a registered global library

- **WHEN** a user selects an available registered global Media Library for an exact project
- **THEN** Assets creates the target-free project binding and matching managed Workspace link
- **AND** it validates that the link resolves to the exact registered target before reporting success

#### Scenario: Register a directory and associate it

- **WHEN** a user selects a native directory through the project Media Library action
- **THEN** Assets first registers it in the user-global Media Library and then creates the project binding
  and managed link
- **AND** failure removes only a newly created global registration and leaves existing data unchanged

### Requirement: Local bindings can be initialized without losing project facts

The project `.neko/media-libraries` store SHALL be disposable target-free local authorization. Missing local
storage SHALL initialize empty without changing project facts, global connections or unrelated project
capabilities.

#### Scenario: Local state is deleted

- **WHEN** `.neko/media-libraries` is absent on project open
- **THEN** the project opens and derives required logical libraries from authoritative project facts
- **AND** unavailable libraries remain visible for exact association while unrelated content works

#### Scenario: Exact managed link can reconstruct local authorization

- **WHEN** one required library has no binding but its direct managed link exactly matches one available
  registered global connection
- **THEN** Assets may reconstruct that target-free binding during local initialization
- **AND** it does not infer authorization from name alone, recent use or an unregistered target

#### Scenario: Binding and link conflict

- **WHEN** an existing binding, global connection and Workspace entry do not describe one exact target
- **THEN** the library reports a local `entry-conflict` diagnostic
- **AND** the system preserves all records/bytes and does not choose or overwrite a source automatically

### Requirement: Managed links are the only Workspace boundary crossing

Workspace-restricted access SHALL allow a final realpath outside the Workspace only through an exact
binding-backed managed Media Library link, and the requested descendant SHALL remain inside the registered
target.

#### Scenario: Agent reads an authorized linked file

- **WHEN** Agent receives a sender-bound `workspace-file` locator below the exact managed link
- **THEN** the shared guard reads the contained descendant without exposing the physical target
- **AND** it does not reject the authorized result merely because the final realpath is outside the
  Workspace directory

#### Scenario: Reject unmanaged or nested escape

- **WHEN** a locator crosses an unregistered Workspace link, a regular-directory conflict, a broken link or
  a nested link outside the registered target
- **THEN** only that request is rejected with a typed diagnostic
- **AND** sibling libraries, files and project capabilities remain available

### Requirement: Local projections never enter sync or ordinary packages

Product sync, hashing and ordinary package traversal SHALL exclude root `.neko`, managed link entries and
external target bytes. Explicit portable snapshot MAY copy only authoritative referenced descendants.

#### Scenario: Sync a project with linked media

- **WHEN** the project is synchronized to another machine
- **THEN** workspace-relative `neko/assets/<libraryName>/<relativePath>` references and project-owned files
  are transferred
- **AND** bindings, links, global identities and physical targets are not transferred

#### Scenario: Publish a portable snapshot

- **WHEN** the user explicitly builds a portable project
- **THEN** the packager reads exact referenced bytes through the canonical project content service, rewrites
  only staged facts and publishes atomically
- **AND** the source project, global library and external target remain unchanged
