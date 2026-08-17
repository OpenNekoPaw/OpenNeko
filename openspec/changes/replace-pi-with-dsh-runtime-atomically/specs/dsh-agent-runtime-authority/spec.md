## ADDED Requirements

### Requirement: DSH is the sole Agent runtime authority

`@neko/agent-runtime` SHALL compose one minimal Cordis Context in which qualified DSH packages are the sole Agent, Session, Tool and model-loop runtime. Production code MUST NOT register, select or fall back to Pi Agent/Session/Skill/Tool loop, a generic multi-engine runtime port, an OpenNeko Tool registry or another transcript executor.

#### Scenario: Execute a normal Agent turn

- **WHEN** Desktop submits a validated turn for an executable Conversation
- **THEN** one DSH Agent and its exact DSH Session execute the turn and Tool calls
- **AND** path evidence contains no Pi runtime, alternate Tool registry, direct test runner or fallback provider

#### Scenario: Required DSH runtime is unavailable

- **WHEN** the qualified DSH composition or required package registration is absent
- **THEN** Agent startup or the affected Conversation fails with an explicit diagnostic
- **AND** the system does not instantiate Pi or another runtime to return success

### Requirement: DSH Session owns transcript and context

Each executable Conversation SHALL reference one exact current DSH Session identity. DSH Session SHALL be authoritative for user, assistant and Tool events, turn/call lineage, actual model context and qualified compaction events. OpenNeko catalog and projection stores MUST NOT copy a complete transcript or become a fallback authority.

#### Scenario: Reopen an executable Conversation

- **WHEN** the complete Desktop owner closes and reopens a Conversation with a valid DSH Session reference
- **THEN** the transcript, context and next turn are restored from that exact DSH Session
- **AND** no catalog preview, legacy Pi JSONL or renderer state hydrates the transcript

#### Scenario: One DSH Session cannot be decoded

- **WHEN** one Conversation references an unsupported or malformed DSH Session while sibling Conversations are valid
- **THEN** only that Conversation becomes non-executable with an identity-scoped diagnostic
- **AND** its source bytes, sibling Conversations and unrelated Workspaces remain available

### Requirement: Agent and Tool identities use qualified DSH coordinates

The Agent runtime SHALL project the exact DSH Session, turn and call identities qualified in Q0. A domain operation that survives the Tool call SHALL retain its owning-domain Job identity; DSH call identity MUST NOT replace, infer or own that Job.

#### Scenario: Tool starts a durable domain Job

- **WHEN** a DSH Tool call submits a Generation, Cut or other durable domain operation
- **THEN** the Timeline correlates the exact DSH call identity to the returned owning-domain Job identity
- **AND** cancellation, recovery and result facts remain owned by the domain Job service

#### Scenario: Stale identity targets another turn

- **WHEN** a cancellation, approval, queue mutation or result uses a call identity from another Session or turn
- **THEN** the current operation is rejected without affecting either valid execution owner

### Requirement: Tool adapters preserve canonical validation and authorization

OpenNeko Tool and Capability owners SHALL remain authoritative for canonical schema, semantic validation, permission, workspace trust, resource authorization, bounded result projection and domain invocation. DSH Tool definitions MAY project the model-facing schema but MUST invoke the same canonical validator before the owning service, including constraints not enforced by the DSH schema DSL.

#### Scenario: DSH emits semantically invalid Tool arguments

- **WHEN** Tool arguments violate a discriminated locator, numeric range, array bound or cross-field requirement
- **THEN** the package-owned validator rejects the call before resource access or domain mutation
- **AND** DSH receives an explicit failed Tool result tied to the exact call identity

#### Scenario: Tool returns authorized content

- **WHEN** a Tool reads a document, image or generated artifact
- **THEN** its DSH result preserves bounded short references and `ContentLocator`-based authorization
- **AND** no absolute path, raw locator, secret or unbounded media payload enters the model or Renderer

### Requirement: DSH inbox owns pending Agent input

Pending follow-up, steering and queued input SHALL use the qualified DSH Agent inbox and durable `MessageId` operations. OpenNeko MUST NOT retain an independent runtime message queue, pending-operation map or pause state as a second authority. Product operations without an exact DSH inbox equivalent MUST be removed atomically or remain presentation-only drafts that cannot execute.

#### Scenario: Edit a queued message

- **WHEN** the user edits a pending message by its exact product projection identity
- **THEN** the runtime applies the mapped DSH inbox replacement to the same pending item
- **AND** the Renderer snapshot is rebuilt from the DSH inbox events

#### Scenario: Cancel the active turn and retain pending input

- **WHEN** product semantics request turn cancellation while retaining the inbox
- **THEN** the exact DSH cancellation operation uses its qualified retain-inbox behavior
- **AND** no OpenNeko queue is paused or replayed independently

### Requirement: Clear creates a new Conversation and compact uses DSH

Product clear SHALL create a new Conversation identity with a new empty DSH Session and navigate the current Window to it after an atomic catalog/session commit. It MUST NOT erase or replace the source Conversation transcript. Context compaction SHALL use only the DSH compaction implementation qualified in Q0.

The cross-store commit SHALL create and validate the new Session in an unpublished provisional scope before one catalog transaction publishes the complete binding. A pre-publish failure MAY remove only the exact provisional Session created by the current request. Window selection is presentation state after durable publication; its failure MUST preserve the valid new Conversation, keep the source Conversation selected and return the new identity with an exact local diagnostic.

#### Scenario: User clears the current conversation

- **WHEN** the user confirms clear on an executable Conversation
- **THEN** a new Conversation and empty DSH Session are committed and selected
- **AND** the source Conversation remains listable and restorable with unchanged transcript bytes

#### Scenario: DSH compaction is unavailable

- **WHEN** the current Session requires compaction but the qualified DSH compaction path cannot complete
- **THEN** the operation fails visibly for that Conversation
- **AND** no OpenNeko compaction engine, hidden Session or old transcript projection returns success

#### Scenario: Catalog publication fails after provisional Session creation

- **WHEN** the new Session is flushed and reopenable but the catalog transaction cannot publish its binding
- **THEN** no new Conversation is visible and only that request's exact unpublished Session may be removed
- **AND** the source Conversation and every unrelated Session remain unchanged

#### Scenario: Window selection fails after publication

- **WHEN** the new Conversation and Session binding are durably published but the current Window cannot select it
- **THEN** the valid new Conversation remains listable and the source Conversation remains selected
- **AND** the operation reports the new identity and selection diagnostic without rollback or a half-bound record

### Requirement: OpenNeko CredentialStore is the only production credential authority

The production Cordis composition SHALL resolve DSH provider credentials through an OpenNeko implementation backed by the program-owned CredentialStore and Desktop SecretStorage/keychain adapter. Environment credential providers, default in-memory persistence and provider fallback MUST NOT participate in production success.

#### Scenario: DSH provider resolves an API credential

- **WHEN** a configured provider begins an authorized request
- **THEN** DSH resolves the exact provider credential through the OpenNeko credentials implementation
- **AND** secret bytes do not enter settings, environment variables, Session, SQLite, logs, Renderer or Evaluation facts

#### Scenario: Credential persistence fails after refresh

- **WHEN** a provider refreshes a credential but keychain persistence fails
- **THEN** the current request or refresh operation reports a provider-qualified diagnostic
- **AND** the credential is not presented as durably updated and no environment fallback is attempted
