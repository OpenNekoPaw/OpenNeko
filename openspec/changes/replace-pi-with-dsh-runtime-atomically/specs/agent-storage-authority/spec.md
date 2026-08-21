## MODIFIED Requirements

### Requirement: Conversation catalog and DSH execution state have distinct authorities

OpenNeko SHALL own durable Conversation identity, user-visible metadata, Workspace binding, current DSH Session reference, permission/checkpoint metadata and domain Job references. The DSH subprocess/profile SHALL own transcript, model context, turn/call events, inbox and extension execution state. Every relation SHALL use exact stable identities without active/current fallback, internal schema generation or writer epoch. Neither side SHALL duplicate the other's authoritative facts.

#### Scenario: Two Conversations execute concurrently

- **WHEN** each Conversation targets its exact DSH Session
- **THEN** DSH serializes each Session/Agent execution under its own identity
- **AND** OpenNeko updates only the matching catalog/projection records without a shared active Conversation owner

#### Scenario: DSH Session reference is missing

- **WHEN** a catalog record has no valid current DSH Session reference
- **THEN** the record remains visible with a Conversation-scoped runtime-unavailable diagnostic
- **AND** no empty Session, recent Session or Pi transcript is substituted

#### Scenario: First Composer input publishes the Conversation title

- **WHEN** an unbound Draft submits its first strict-decoded message, Command or Skill input
- **THEN** the package-owned Agent application derives one bounded single-line title and publishes it with the durable Conversation catalog record
- **AND** Agent Home and the exact Session projection expose that same catalog title without Renderer-local title state or a fixed placeholder success path

### Requirement: Agent projections are rebuildable and never fallback authorities

Transcript, Timeline, inbox, Tool progress and extension management projections SHALL be rebuilt from ACP replay/events plus current owning-domain facts. Projection loss MAY trigger recomputation from those authorities. A stale or invalid projection MUST NOT replace facts, fabricate empty success, mutate DSH state or switch to Pi, raw Session bytes, cached transcript or Renderer state. A single invalid projection SHALL remain local to its record or surface.

#### Scenario: One Conversation projection is invalid

- **WHEN** sibling Conversation projections remain valid
- **THEN** the invalid entry reports its exact identity and diagnostic
- **AND** valid siblings remain listable and restorable through their exact DSH Sessions

#### Scenario: DSH history replay fails

- **WHEN** an old preview or Pi-derived projection is still readable
- **THEN** the Conversation remains non-executable
- **AND** the projection is not used to fabricate transcript restoration

### Requirement: Catalog visibility is independent from UI and runtime residency

Conversation catalog enumeration SHALL not depend on the currently mounted Agent Root, current Workspace scene or a live DSH Agent handle. Closing Agent UI or a per-session runtime SHALL release UI/runtime resources without deleting or hiding durable catalog records. Background work that DSH still owns MAY continue without retaining a React tree.

#### Scenario: User leaves the Agent scene

- **WHEN** the current Agent Root unmounts while a DSH turn continues
- **THEN** DSH retains the exact running Session/turn and OpenNeko retains the Conversation record
- **AND** no hidden Agent React tree is kept alive

#### Scenario: Workspace is not currently open

- **WHEN** a Conversation references a stable Workspace identity absent from current Shell navigation
- **THEN** Agent Home still lists the Conversation with an unavailable Workspace projection where necessary
- **AND** the Conversation is not rebound to the active Workspace

### Requirement: Retired Agent storage is removed through one exact cleanup

Before current DSH authority initialization, Desktop SHALL delete only the explicitly retired Agent SQLite tables `conversations`, `pi_conversations`, `pi_messages`, `agent_conversation_records` and the explicitly retired directories `~/.neko/journals/`, `~/.neko/conversations/`. The cleanup MUST NOT decode or migrate old content, glob unknown `pi_*` tables, delete unknown files, touch current DSH Session storage or modify unrelated SQLite records. Listing, open, clear, compact and failure recovery SHALL have no retired-data reader or compatibility projection.

#### Scenario: Retired Pi data exists at startup

- **WHEN** the canonical DSH runtime initializes
- **THEN** every explicitly retired table and directory is absent before current DSH catalog initialization
- **AND** unrelated tables, unknown files and DSH Session storage remain unchanged

#### Scenario: Retired Pi storage is absent

- **WHEN** cleanup runs again
- **THEN** the operation succeeds without creating a marker, fallback catalog or replacement legacy path
