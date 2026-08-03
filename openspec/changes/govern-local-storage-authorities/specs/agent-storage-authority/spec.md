## ADDED Requirements

### Requirement: Agent configuration is split by ownership

Machine-local Agent feature switches, active provider/model selections, and runtime defaults SHALL use
the canonical SQLite state namespace. Portable provider/model definitions and personal MCP definitions
SHALL use a versioned user export/import authority. Skills, prompts, profiles, processors, and
instructions SHALL remain owned files. Generic workspace Agent config/preferences files SHALL be
retired; a real project-scoped capability MUST define an owning versioned project schema. Credentials
MUST use the protected secret authority.

#### Scenario: Legacy global Agent config is imported

- **WHEN** a validated legacy config contains runtime selections, portable definitions, and a credential
- **THEN** the migration routes each field to SQLite state, portable configuration, or SecretStorage
  according to its classification
- **AND** it does not retain a mixed normal-runtime authority

### Requirement: User-perceived conversation content remains portable files

Pi Session JSONL SHALL remain the sole message, tool transcript, model-context, and compaction authority.
User-visible conversation title, branch topology, and export identity SHALL be present in a versioned
portable conversation manifest and MUST NOT exist only in SQLite.

#### Scenario: Conversation is exported without the database

- **WHEN** a user exports a conversation to another installation
- **THEN** the manifest and referenced Pi Session files restore its user-visible content and branch
  topology without copying `neko.db`

### Requirement: Agent operational state uses canonical SQLite namespaces

Agent operational state SHALL use canonical SQLite namespaces. This includes execution leases, writer
epochs, turn durability, idempotent checkpoints, task recovery state, and other non-user-managed facts
in Agent-owned state repositories. Listing/search acceleration SHALL use rebuildable cache projections.

#### Scenario: Canonical database cache is lost

- **WHEN** conversation listing projections are deleted while portable conversation files remain
- **THEN** the system rebuilds the projections without changing transcript or manifest content
- **AND** stale leases or unrecoverable in-flight operations fail visibly rather than inventing success

### Requirement: Agent memory is separated by acceptance and rebuildability

Explicit user-accepted shared project memory SHALL use the optional tracked `neko/memory.md` authority
only when the product exposes a review/edit/delete/sync surface. Inferred embeddings, semantic indexes,
and freshness cursors MAY use rebuildable SQLite cache storage, while turn/session scratch memory SHALL
remain process-scoped unless an explicit recovery use case classifies a bounded checkpoint as SQLite
state. Generic `.neko/preferences.md` and implicit `.neko/memory.md` files MUST NOT become parallel
authorities.

#### Scenario: Agent proposes a durable memory

- **WHEN** the user or project owner accepts a proposed durable fact
- **THEN** the owning memory file records the fact through its versioned/validated format
- **AND** a semantic index may be rebuilt from that file but cannot replace it as authority

### Requirement: Agent logs never become state repositories

Agent event, audit, step, model-call, and diagnostic logs SHALL remain redacted managed files with
retention policies. Agent restart, conversation restore, and memory recall MUST NOT depend on replaying
raw logs as a hidden authority.

#### Scenario: Agent log directory is removed under retention policy

- **WHEN** eligible logs expire or are explicitly cleared
- **THEN** durable conversations, explicit memory, configuration, and operational state remain valid

### Requirement: Independent Agent SQLite authorities are retired

Eligible rows from the Agent-specific metadata database SHALL migrate into Agent-owned repositories on
`~/.neko/neko.db`. After a verified migration marker commits, normal Agent startup MUST NOT open,
read, write, or fall back to the old database.

#### Scenario: Old Agent database remains on disk after migration

- **WHEN** the archived old database still exists for recovery evidence
- **THEN** a normal conversation create/reopen/branch/checkpoint path succeeds without accessing it
- **AND** any attempted normal access is a testable failure
