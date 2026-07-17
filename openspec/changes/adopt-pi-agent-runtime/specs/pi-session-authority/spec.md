## ADDED Requirements

### Requirement: Pi Session is the sole transcript authority
The system MUST store messages, model changes, active-tool changes, compaction, and model context in Pi Session JSONL for each conversation branch. OpenNeko `conversationId`, `branchId`, and Pi `sessionId` MUST remain distinct and be explicitly mapped. No journal, history store, diagnostic log, or catalog table may act as a second complete transcript authority.

#### Scenario: Persist and reopen a conversation
- **WHEN** a conversation branch completes messages, closes, and reopens
- **THEN** its mapped Pi Session rebuilds the transcript and context using the same branch/session mapping without hydrating from a legacy journal or duplicate message store

#### Scenario: Branch from a historical entry
- **WHEN** the user continues from history or rolls back to create an alternative branch
- **THEN** OpenNeko creates or selects a distinct branch-to-session mapping, binds the conversation's single active Pi Agent to it, and preserves the previous branch as history

#### Scenario: Build compacted context
- **WHEN** the transcript requires compaction
- **THEN** OpenNeko policy selects the trigger/budget/retained product references and Pi compaction entries plus `buildContext` produce the next model context while preserving the authoritative JSONL tree

### Requirement: Session storage is user-global and program-owned
The program MUST own one user-global Pi Session root and SQLite metadata root shared by TUI and VS Code and partitioned by workspace, conversation, and branch identity. Workspace files MUST NOT store Pi transcripts. Loss of user-global state SHALL NOT trigger recovery from workspace files.

Pi `cwd` MUST be a Host-generated virtual workspace locator used only for Pi partition/header semantics. It MUST NOT be treated as a physical path, `${VAR}` path, Skill locator, ContentAccess input, or generic file-tool argument.

#### Scenario: Open a moved workspace
- **WHEN** a workspace with the same stable `workspaceId` is opened from a new physical location
- **THEN** the program reuses its user-global conversation partition and gives Pi the same virtual workspace locator without moving transcript files

#### Scenario: User-global metadata is missing
- **WHEN** orphan Pi JSONL or workspace identity exists but the user-global Conversation/Branch metadata authority is missing
- **THEN** the system does not guess or rebuild the product aggregate and may clean orphan sessions through GC

### Requirement: Product facts remain separately authoritative
OpenNeko SQLite SHALL retain conversation catalog, active/historical branch mapping, default workspace binding, turn/run/task identity, permission facts, provider task identity, ResourceRef, and UI projection as product-owned facts and SHALL NOT rely on Pi custom entries as their sole storage. Authorized attachments, Tool inputs, and ResourceRefs MAY add inputs without changing the default workspace binding.

#### Scenario: Store authoritative and projected catalog fields
- **WHEN** a conversation or branch changes
- **THEN** SQLite durably stores product identity/binding/lifecycle fields while message count, preview, last model/activity, and compaction status remain replaceable listing projections without copying transcript messages

### Requirement: Session writes have explicit save points
The conversation runtime MUST create one idempotent checkpoint at each turn terminal point and persist that turn's ordered Pi entries. The UI MAY display a completed but unsaved result and MUST expose whether it is volatile, persisting, durable, or persistence-delayed.

#### Scenario: Session storage fails
- **WHEN** Pi Session append or flush fails for a turn checkpoint
- **THEN** the runtime emits a storage diagnostic, marks the turn persistence-delayed, queues process-local idempotent backfill, and does not report the turn as durable

#### Scenario: Process exits with delayed persistence
- **WHEN** best-effort shutdown flush does not persist a delayed checkpoint or the process crashes
- **THEN** the unsaved turn may be lost and the system does not recover it from a durable outbox, secondary WAL authority, or legacy journal

### Requirement: Cross-Host conversation execution has one fenced writer
TUI and VS Code MAY observe the same conversation, but only the Host holding the current `ConversationExecutionLease` epoch MAY advance its Pi Agent or commit a turn checkpoint. Other Hosts MUST remain read-only unless an explicit takeover obtains a higher epoch. Expired or replaced holders MUST fail writes through fencing checks.

#### Scenario: Open one conversation in two Hosts
- **WHEN** TUI holds the current execution lease and VS Code opens the same conversation
- **THEN** VS Code receives the read-only projection and cannot submit a turn until it explicitly takes over or the lease expires

#### Scenario: Stale holder writes after takeover
- **WHEN** another Host obtains a higher lease epoch and the former holder later submits a checkpoint
- **THEN** SQLite rejects the stale epoch and no Pi Session or product metadata is advanced by that write

### Requirement: Pi executes compaction under OpenNeko policy
Pi MUST remain the only summarization/context/compaction-entry implementation. OpenNeko MAY retain a policy that chooses trigger timing, budget, and required product-reference retention but MUST NOT retain its own compaction engine or storage path.

#### Scenario: OpenNeko policy triggers compaction
- **WHEN** the configured policy determines that a branch requires compaction
- **THEN** it invokes Pi compaction primitives and the resulting Pi entry remains the sole compacted-context authority

### Requirement: Legacy transcript paths cannot provide fallback success
Legacy ConversationManager, Journal reader/writer/projection, duplicate history hydration, custom compaction, and AgentSession persistence MUST be deleted, poisoned, or migration-only and MUST NOT serve a normal Pi conversation.

#### Scenario: Poison legacy transcript hydration
- **WHEN** every legacy transcript reader is configured to throw
- **THEN** create, append, close, reopen, and context build succeed exclusively through Pi Session primitives
