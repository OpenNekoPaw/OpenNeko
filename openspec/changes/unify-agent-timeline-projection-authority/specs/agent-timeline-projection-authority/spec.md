## ADDED Requirements

### Requirement: Active Agent Turn display has one authority

For each conversation and active turn, the system MUST use exactly one conversation-scoped Timeline projection as the mutable display authority. Pi product events MUST be normalized by one host-neutral projector and applied to one `ConversationProjectionStore`. Extension, Webview and TUI MUST NOT maintain another writable assistant text, thinking, Tool or terminal state for the same turn.

Every Timeline item, turn projection, update and patch MUST carry an explicit `conversationId`, `turnId`, `runId` and `messageId` ownership tuple. Missing, stale or mismatched identity MUST fail visibly and MUST NOT resolve through active UI selection.

#### Scenario: Pi streams assistant text

- **WHEN** Pi emits thinking and assistant text deltas for an identified conversation/turn/run
- **THEN** the host-neutral projector emits ordered Timeline operations and the conversation projection advances monotonically
- **AND** no mutable assistant `Message`, `ContentBlock`, legacy stream handler or Host-local delta accumulator becomes another active content authority

#### Scenario: Two conversations stream concurrently

- **WHEN** two conversations execute concurrent turns and one emits a Tool result
- **THEN** each conversation applies events only to its own projector/store and attachment replicas
- **AND** neither active Tab selection nor a global stream map can route the result to the other conversation

#### Scenario: A stale run writes to a retained turn

- **WHEN** an operation carries the expected conversation and turn but a stale or mismatched `runId`
- **THEN** the store rejects the complete update before changing any item or projection version
- **AND** it does not infer the run from the current message, active Tab or latest execution

### Requirement: Timeline covers the complete visible Tool and turn lifecycle

The Timeline contract MUST represent assistant text, thinking, Tool start/progress/confirmation/result, typed work/domain observation, diagnostic, cancellation and terminal completion with exact identity and order. A visible state MUST update its existing Timeline item instead of creating a semantically equivalent message or card authority.

#### Scenario: A Tool requests confirmation and completes

- **WHEN** Pi starts a Tool, requests confirmation, receives approval and returns a result
- **THEN** one Tool item identified by the same `toolCallId` advances through pending confirmation and terminal result revisions
- **AND** no parallel `toolCall`, `toolConfirmation`, `toolResult` message or generic TaskCard owns the Tool state

#### Scenario: Provider-final assistant content differs from streamed content

- **WHEN** the provider's completed assistant message differs from the accumulated deltas
- **THEN** the projector reconciles the same Timeline source using a typed replacement/new source generation before terminal completion
- **AND** it does not publish `finalContentBlocks` or mutate a second completed message to hide the mismatch

#### Scenario: An event arrives after terminal completion

- **WHEN** any text, thinking, Tool, diagnostic or completion event arrives after the turn is completed, cancelled or failed
- **THEN** the projector rejects the mutation with an explicit diagnostic
- **AND** the event cannot update a retained message, active Tab or legacy stream state

### Requirement: Webview active content uses versioned projection attachments

The Extension MUST deliver active conversation content to Webview only through an immutable projection snapshot followed by acknowledged, ordered patches. Webview MUST derive active rendering from its projection replica and MUST NOT consume legacy active-content messages as fallback.

#### Scenario: A Tab attaches while a turn is streaming

- **WHEN** a Tab attaches after the turn has already produced Timeline items
- **THEN** the Extension sends the current snapshot, waits for the exact snapshot acknowledgement, and then sends patches based on that projection version
- **AND** the Tab does not render shared active message content before the matching Timeline/Markdown projection is installed

#### Scenario: A patch base is stale

- **WHEN** a Webview replica receives a patch whose attachment identity or base projection version does not match
- **THEN** the attachment fails visibly and no part of the patch is applied
- **AND** recovery creates a new attachment and installs a fresh snapshot without replaying legacy stream messages

#### Scenario: A hidden Tab becomes visible

- **WHEN** a hidden Tab bound to the same conversation becomes visible
- **THEN** it renders its existing or freshly attached projection replica for that exact conversation
- **AND** visibility does not transfer projection ownership or rebind another Tab's mutable state

### Requirement: Transcript and Timeline remain separate authorities

Pi Session MUST remain the transcript authority, while the Timeline store MUST remain a runtime display projection. The system MUST NOT persist active Timeline mutations as a second transcript or use a mutable history message as live stream state.

#### Scenario: A turn completes durably

- **WHEN** a turn reaches terminal completion and its Pi checkpoint becomes durable
- **THEN** the Host MAY create one immutable completed-history projection bound to the same conversation/turn/message identity
- **AND** later stream events cannot mutate that record or cause it to replace Pi Session transcript authority

#### Scenario: A conversation reopens

- **WHEN** a Host reopens a conversation after process restart
- **THEN** transcript/history is rebuilt from Pi Session plus product conversation metadata and live projection begins from a new runtime projection identity
- **AND** no legacy stream message, cached `ContentBlock`, Webview URI or active-message accumulator is imported

### Requirement: Host display projection preserves stable resource identity

Canonical Timeline snapshots and patches MUST contain stable product resource/artifact identities and MUST NOT contain Webview URI, blob URL, terminal presentation text, absolute cache path or Host-private live handle. Host-specific display projection MUST be derived without mutating canonical projection identity or version.

#### Scenario: A Tool returns an image ResourceRef

- **WHEN** a Tool result adds a stable image `ResourceRef` to a Timeline item
- **THEN** Extension derives an authorized display value for each Webview attachment and TUI derives terminal presentation from the same stable ref
- **AND** the canonical store retains the stable ref rather than either Host-specific representation

#### Scenario: Webview resource materialization fails

- **WHEN** an attachment cannot materialize a display value for an otherwise valid stable resource
- **THEN** the Host returns a typed attachment/resource diagnostic without claiming the Tool result failed or succeeded differently
- **AND** it does not insert an absolute path or legacy tool-result message as fallback

### Requirement: TUI and VS Code share event-to-Timeline semantics

TUI and VS Code MUST consume the same host-neutral Pi event-to-Timeline projector contract. Host renderers MAY differ, but Tool identity, item order, revisions, terminal status and failure semantics MUST remain equivalent.

#### Scenario: The same Tool turn is observed by either Host

- **WHEN** equivalent configured TUI and VS Code conversations execute a Tool-using turn
- **THEN** both Hosts observe the same canonical Timeline event semantics and terminal Tool result identity
- **AND** TUI does not use a direct Pi conversation-store mutation path while VS Code uses projection

#### Scenario: A TUI turn is cancelled

- **WHEN** the user cancels an active TUI turn
- **THEN** the shared projector publishes one cancelled terminal completion, rejects late events and leaves the TUI fully idle
- **AND** no independent TUI stream accumulator can append text or Tool results after cancellation

### Requirement: Legacy active-content paths cannot return success

The prelaunch replacement MUST remove or poison legacy active-content Webview message types, handlers, presenters, dual active-stream maps, TUI direct-stream mutation and `finalContentBlocks` fallback. No feature flag, compatibility adapter, dual-read or dual-write path MAY allow them to participate in a new Pi turn.

#### Scenario: A removed Webview stream message is received

- **WHEN** a new Webview endpoint receives `streamText`, `streamThinking`, `toolCall`, `toolResult`, `toolResultBackfill`, `toolConfirmation` or `streamComplete`
- **THEN** strict protocol validation rejects the unknown/retired message
- **AND** conversation state remains unchanged

#### Scenario: The legacy processor is poisoned

- **WHEN** tests configure the legacy active-stream processor or mutable-message path to throw during a Pi turn
- **THEN** the canonical Timeline path completes without invoking the poison
- **AND** path evidence identifies projection snapshot/patch as the only active display delivery
