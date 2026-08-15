## ADDED Requirements

### Requirement: Global Character and World catalogs expose immutable domain versions

Chara and World SHALL each own global objects with a stable object identity, one exact current-version identity for default management presentation, and one or more immutable user-visible domain versions. Every global version SHALL be owned by its exact global Character or World identity, and every valid historical version SHALL remain directly selectable. Global objects and versions MUST NOT require a source Project identity or expose draft, ready, blocked, installed, adapted, release-installation, or recovery lifecycle states.

#### Scenario: Global Character receives a new version

- **WHEN** an authorized synchronization commits a valid Character definition against the exact current version
- **THEN** Chara creates one immutable Character version and makes it the object's current version
- **AND** the prior version remains selectable and unchanged

#### Scenario: One global record is invalid

- **WHEN** one global World object or version cannot be decoded
- **THEN** World keeps that row visible with an exact diagnostic and disables only its dependent actions
- **AND** sibling global objects, Projects and runtimes remain usable

### Requirement: Global owners support atomic first creation

Chara and World SHALL expose one owner command that creates a new global object and its first immutable version from a confirmed valid definition. The command SHALL commit the object, version and exact current-version identity atomically. It MUST NOT create a workspace object, workspace membership, synchronization link or synthetic Project identity.

#### Scenario: Assistant proposal creates a first global version

- **WHEN** an Assistant-bound Creator capability submits one confirmed valid Character or World definition
- **THEN** the owning catalog atomically creates one global object whose current version is the newly created first version
- **AND** the receipt contains exact global object and version identities for projection and later use

#### Scenario: First global creation fails

- **WHEN** validation, identity allocation or repository commit fails
- **THEN** no partial global object or version becomes visible
- **AND** sibling global objects, Projects and Assistant Conversations remain usable

### Requirement: Workspace objects synchronize through one owner command

A local workspace Character or World SHALL use one `Synchronize to global` command to create a new global object and first version or append one immutable version to its linked global object. The workspace SHALL retain the stable global object identity and exact last-synchronized version identity. Synchronization MUST NOT overwrite a version, publish a Project composition, create an installation, adapt another object, or update consumer references.

#### Scenario: Workspace Character is synchronized for the first time

- **WHEN** the user synchronizes one valid unlinked workspace Character
- **THEN** Chara atomically creates one global Character and its first immutable version
- **AND** the workspace Character records the exact resulting object and version identities

#### Scenario: Global Character changed since last synchronization

- **WHEN** the linked global Character current version differs from the workspace Character's last-synchronized version
- **THEN** Chara rejects implicit synchronization and offers only explicit creation based on the current version, save as a new global object, or cancel
- **AND** it performs no automatic merge, overwrite, branch resolution, or reference update

#### Scenario: Synchronization fails during commit

- **WHEN** validation, resource staging or repository commit fails
- **THEN** no partial global version becomes visible and the prior current version remains authoritative
- **AND** the local workspace object and sibling global objects remain unchanged

### Requirement: Projects use exact read-only global references

A Project Creative Workspace SHALL be able to add any valid global Character or World exact version as a read-only owner-qualified reference. Editing a referenced global version SHALL require an explicit copy that creates a fresh local workspace object. Project and runtime consumers MUST NOT resolve current, latest, name, active selection, installation ordering or another fallback at use time.

#### Scenario: User adds a global World to a Project

- **WHEN** the user selects one exact global World version in a Project Workspace
- **THEN** Project records that exact read-only reference and displays it with the local workspace objects
- **AND** it does not create a WorldProject copy or follow later global versions

#### Scenario: User copies a global Character for editing

- **WHEN** the user chooses to edit one referenced global Character version
- **THEN** Chara creates a fresh local workspace Character seeded from that exact version
- **AND** the source global object, version and every existing reference remain unchanged

### Requirement: Exact reference updates are explicit and local

When a newer global version exists, management MAY project that fact without changing any Project, Dialogue, Room, World Run or Save. Updating SHALL identify the exact old version, exact new version and exact consumer owner, validate the new version, and mutate only the confirmed reference.

#### Scenario: Existing Room has older Character versions

- **WHEN** one participant has a newer global Character version
- **THEN** the Room continues using its stored exact version until the user explicitly updates that participant
- **AND** no other Room, Project or runtime reference changes
