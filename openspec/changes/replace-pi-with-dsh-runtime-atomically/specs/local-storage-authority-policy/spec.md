## MODIFIED Requirements

### Requirement: Secrets and raw logs use dedicated authorities

Credentials, provider tokens, mount secrets and encryption material MUST use a protected credential authority. The production DSH credentials service SHALL delegate to the OpenNeko program-owned CredentialStore backed by SecretStorage/keychain and MUST NOT use environment variables, DSH settings, default in-memory persistence or another credential source as fallback. Raw logs/audit data MUST use owner-partitioned managed files with retention/redaction and MUST NOT be stored as ordinary SQLite rows or replayed as business facts.

#### Scenario: Provider credential is configured

- **WHEN** a DSH provider needs a secret
- **THEN** configuration stores only non-secret identity/presence metadata and the DSH credentials request resolves through the OpenNeko store
- **AND** secret bytes remain inside SecretStorage/keychain and never enter Session, settings, environment, logs or projections

### Requirement: Retired data is outside product runtime

Product startup, public entries, build output and ordinary tests MUST NOT inspect, import, classify, archive, delete, convert, repair or rewrite retired databases, Pi transcript files, mixed config sources or workspace `.neko/` data. Existing bytes MUST remain untouched. A stable current catalog MAY retain identity and bounded metadata for an unavailable record, but MUST NOT decode retired content or make it executable.

#### Scenario: Unknown retired workspace file exists

- **WHEN** a retired `.neko/` or Pi Session path contains an unknown file
- **THEN** normal product runtime ignores the retired bytes and leaves the file unchanged
- **AND** no cleanup, migration, DSH Session creation or transcript restoration is marked successful

#### Scenario: Legacy Conversation metadata remains identifiable

- **WHEN** the current catalog can identify a Conversation whose only transcript is retired Pi data
- **THEN** the catalog keeps bounded identity/metadata and a local unavailable diagnostic
- **AND** product runtime does not open the retired transcript to supply messages

## ADDED Requirements

### Requirement: DSH Session storage has a declared user-global authority

DSH Session persistence SHALL use one program-owned user-global root provided through the Agent runtime Node adapter and partitioned by stable DSH Session identity. Session metadata and physical storage paths MUST use a Host-generated virtual cwd rather than a real Workspace path. DSH Session files MUST NOT be stored in Workspace content, SQLite blobs, Renderer state or another package cache.

#### Scenario: Create a DSH Session for a Workspace Conversation

- **WHEN** an authorized Workspace Conversation starts its first turn
- **THEN** the Agent runtime creates the Session under the declared user-global DSH root with virtual cwd metadata
- **AND** no physical Workspace path is written to the Session header, model context, log or Renderer projection

#### Scenario: Move a Workspace directory

- **WHEN** the same stable Workspace identity is rebound to a new physical path
- **THEN** its existing DSH Conversation mapping remains based on stable identity and authorized Host adapters
- **AND** Session persistence does not move or select data using the old physical path
