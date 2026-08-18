## MODIFIED Requirements

### Requirement: Secrets and runtime logs use dedicated authorities

Provider credentials, tokens and encryption material SHALL remain in the program-owned CredentialStore backed by SecretStorage/keychain. DSH SHALL request an exact credential through the typed Host boundary and SHALL NOT receive the whole environment or a general secret store. Environment credentials, DSH settings, Session data, SQLite rows, Renderer state, logs and Evaluation reports MUST NOT become credential sources or fallbacks. Protocol/diagnostic logs SHALL be redacted and owner-partitioned; DSH stdout SHALL remain ACP-frame-only.

#### Scenario: DSH provider requests a credential

- **WHEN** the exact configured provider needs a secret
- **THEN** the Host resolves it through the program-owned credential authority for that request
- **AND** secret bytes do not enter Session, environment, stdout, projection or report data

#### Scenario: Credential is missing

- **WHEN** the requested secret cannot be resolved or user access is denied
- **THEN** only that provider request fails with an explicit diagnostic
- **AND** DSH does not try environment variables, settings or another provider

### Requirement: DSH profile owns DSH Session storage

DSH Session persistence SHALL be owned by the DSH subprocess/profile under the single writable `DSH_HOME` rooted at Electron `userData/dsh`; the official profile SHALL therefore own Session artifacts below its `sessions/` directory. OpenNeko MUST NOT implement another Session store or read/write, copy, migrate, reset or repair DSH Session files directly. Desktop MAY materialize only the verified official profile configuration and exact package links under `profiles/openneko`, and this operation MUST preserve `sessions/` and every other DSH-owned durable file. Desktop MAY provide a virtual Workspace identity configuration at launch. Physical Workspace paths MUST NOT enter durable Session metadata, model-visible content, Renderer projection or logs merely to establish identity. DSH Session data MUST NOT be stored in project files, Workspace `.neko/`, SQLite transcript blobs or presentation caches.

#### Scenario: Create a Session for a Workspace Conversation

- **WHEN** an authorized Conversation creates its DSH Session
- **THEN** DSH persists it under the declared profile-owned root using stable virtual Workspace identity
- **AND** no physical Workspace path is exposed to the model or Renderer

#### Scenario: Official profile is refreshed after an application update

- **WHEN** Desktop materializes the verified packaged OpenNeko profile into the writable DSH home
- **THEN** only the official profile configuration and exact package links are replaced
- **AND** existing `sessions/` bytes and unrelated DSH-owned durable files remain unchanged

#### Scenario: Workspace physical path changes

- **WHEN** the same stable Workspace identity is rebound to another authorized path
- **THEN** the Conversation-to-Session relation remains stable
- **AND** Host adapters resolve the new path only at the operation boundary

### Requirement: Host projections and caches never copy transcript authority

OpenNeko SHALL consume transcript history only through ACP/bridge replay. Host-side caches and projections MAY retain bounded rebuildable display facts but MUST NOT contain a complete alternate transcript or serve as a successful source when DSH replay fails. Cache hit or miss SHALL not change identity, contract or result semantics.

#### Scenario: Session replay fails

- **WHEN** DSH cannot replay a corrupt or unsupported Session
- **THEN** the affected Conversation reports an exact diagnostic
- **AND** Host cache, preview and Renderer state are not used to restore it

### Requirement: Retired local data remains byte-preserved and unreachable

Normal product startup, public entries, build output and ordinary recovery MUST NOT inspect, import, classify, archive, delete, convert, repair or rewrite retired Pi databases, transcript files, mixed configuration sources or Workspace `.neko/` data. Existing bytes SHALL remain unchanged. A current catalog MAY retain stable identity and bounded metadata for an unavailable record without decoding retired content.

#### Scenario: Unknown retired file exists

- **WHEN** an old Pi or `.neko/` root contains an unknown file
- **THEN** normal product runtime ignores and preserves it
- **AND** no cleanup, migration or DSH Session creation is reported as successful

#### Scenario: Data-protection gate runs

- **WHEN** startup, list, open, clear, compact and injected failure scenarios complete
- **THEN** recorded hashes for retired fixtures remain equal
- **AND** any byte change fails the migration release gate
