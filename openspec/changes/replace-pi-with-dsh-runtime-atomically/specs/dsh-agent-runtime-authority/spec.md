## ADDED Requirements

### Requirement: DSH subprocess is the sole Agent runtime authority

Desktop Main SHALL start and supervise one independent DSH subprocess from the officially maintained, precisely locked OpenNeko DSH profile. Production communication between OpenNeko and DSH SHALL use only ACP JSON-RPC over stdio. OpenNeko MUST NOT embed Cordis or `ctx.agents`, use DSH Web/Client Runtime, TypeScript SDK or Remote API as a parallel transport, or invoke Pi or a self-developed Agent runtime as fallback. Stdout SHALL contain only ACP protocol frames; diagnostics and logs SHALL use stderr or an explicit protocol diagnostic.

#### Scenario: Execute a normal Agent turn

- **WHEN** Desktop submits a validated turn for an executable Conversation through the canonical ACP client
- **THEN** the independent DSH Agent and its exact DSH Session execute the turn and Tool calls
- **AND** path evidence contains no Pi runtime, embedded Cordis, alternate transport, direct test runner or fallback provider

#### Scenario: DSH subprocess is unavailable

- **WHEN** the subprocess cannot start, negotiate ACP or recover the required Session
- **THEN** the affected request or Conversation fails with an explicit diagnostic
- **AND** sibling product records remain accessible without instantiating another runtime

### Requirement: Host-neutral application logic and Desktop process ownership remain separate

`@neko/agent-runtime` SHALL own the host-neutral ACP application client, Conversation-to-DSH-Session coordination and canonical event projection. Desktop Main SHALL own only executable resolution, subprocess lifecycle, stdio concrete transport, SecretStorage, sender-bound IPC and OS/owning-domain concrete adapters that require the Electron trust boundary. Desktop Main MUST NOT own Agent, Session, inbox, extension or domain workflow policy.

#### Scenario: Desktop starts the DSH backend

- **WHEN** the application root wires Agent capability
- **THEN** Desktop injects a concrete subprocess/stdio port into the package-owned ACP application adapter
- **AND** Electron objects do not enter host-neutral Agent contracts or domain services

#### Scenario: ACP behavior is tested without Electron

- **WHEN** the package-owned application adapter is tested with a deterministic transport fixture
- **THEN** Session binding, routing and projection behavior can be verified without starting Electron
- **AND** authoritative subprocess/security tests remain in the Desktop boundary

### Requirement: DSH Session owns transcript, context and pending input

Each executable Conversation SHALL reference one exact DSH Session identity. DSH Session SHALL be authoritative for transcript, model context, turn/call lineage, qualified compaction and the DSH inbox. OpenNeko catalogs, projections and presentation state MUST NOT copy a complete transcript, retain an executable queue or become fallback authorities.

#### Scenario: Reopen an executable Conversation

- **WHEN** the complete Desktop owner reopens a Conversation with a valid DSH Session reference
- **THEN** transcript and context are restored from DSH through ACP load/resume and history replay
- **AND** no catalog preview, Pi JSONL, raw Session file or Renderer state hydrates the transcript

#### Scenario: Edit pending input

- **WHEN** the user edits or removes a pending message using its exact projected identity
- **THEN** the bridge applies the corresponding DSH inbox operation and projects the resulting snapshot
- **AND** OpenNeko does not mutate an independent pending map or queue

#### Scenario: Submit a Workspace turn with product context

- **WHEN** the user submits from a Workspace Agent Surface
- **THEN** Host resolves the exact durable Conversation context and Canvas-owned canonical Workspace Board
- **AND** the bridge materializes that validated value through the exact DSH Agent scope as dynamic runtime context before the prompt
- **AND** the user message stored and projected by DSH remains unchanged

#### Scenario: Product context is unavailable or unsupported

- **WHEN** the exact Conversation context, Workspace grant or owning-domain context cannot be resolved
- **THEN** only that prompt fails with an explicit diagnostic before model execution
- **AND** no Renderer value, active Workspace, recent Canvas, empty context or legacy handoff is used as fallback

### Requirement: The ACP bridge supplements DSH without becoming another runtime

Because the official `dsh-acp` rc.7 bridge is automation-only, OpenNeko SHALL ship one thin official DSH ACP bridge plugin/profile. It SHALL reuse public DSH Agent/Session APIs to provide the standard ACP session list/load/resume/history replay, Tool/progress updates and per-session close required by the product. Only capabilities not expressible in standard ACP MAY use one canonical extension surface: DSH inbox snapshot/edit/remove, official extension inventory/readiness/configuration/diagnostics, and typed DSH-to-Host domain Tool requests and responses. The bridge MUST NOT implement an Agent loop, Session store, queue, Tool registry, Skill runtime, MCP runtime or Plugin runtime.

#### Scenario: Resume a known Session

- **WHEN** Desktop requests load or resume for a bound Session
- **THEN** the bridge delegates to the exact public DSH Session/Agent owner and replays history over ACP
- **AND** it does not consult or create a Host transcript repository

#### Scenario: A requested product surface needs private DSH internals

- **WHEN** Q0 shows that a required surface can only be implemented by copying a DSH state machine or depending on an unqualified private module
- **THEN** qualification fails and production consumer cutover stops
- **AND** the bridge is not expanded into a second runtime to satisfy the surface

### Requirement: DSH lifecycle events project precise identities and stop semantics

The canonical product contract SHALL preserve the qualified DSH Session, turn, call, request and inbox identities. Permission, cancellation, close and progress SHALL target those exact identities. Bidirectional JSON-RPC SHALL use bounded payloads and fair backpressure across Sessions. A long-running domain operation SHALL additionally retain the owning-domain Job identity; a DSH call identity MUST NOT replace or infer that Job identity. Late events after cancel, close or disconnect SHALL be contained to their exact operation and SHALL NOT reopen settled work or block sibling Sessions.

#### Scenario: Tool starts a durable Generation Job

- **WHEN** a DSH Tool call submits an authorized long-running Generation operation
- **THEN** the response correlates the exact DSH call identity with the returned Generation Job identity
- **AND** Job cancellation, recovery, progress and result remain owned by Generation

#### Scenario: Stale identity targets another execution

- **WHEN** cancellation, approval, inbox mutation or Tool response names an identity from another Session, turn or call
- **THEN** the current operation is rejected with a local diagnostic
- **AND** neither valid execution owner is changed

#### Scenario: User resolves a pending Tool permission

- **WHEN** the UI selects an option for the exact Conversation, DSH Session, turn and Tool call
- **THEN** the pending approval owner returns only that option when it was advertised by the ACP request
- **AND** a stale, cross-Conversation or unadvertised decision cannot settle the request

#### Scenario: One Session floods progress updates

- **WHEN** one Session exceeds the frozen buffering or payload limits
- **THEN** its exact stream applies bounded backpressure or fails locally according to the canonical contract
- **AND** requests and events for sibling Sessions continue to make progress

### Requirement: Domain Tools preserve package ownership

Generation and Canvas SHALL be the first vertical official domain Tool slice registered in DSH; Cut, Assets, Character, World and remaining domain capabilities SHALL follow. DSH SHALL own Tool registration, selection, call identity and execution lifecycle. Each owning package SHALL remain authoritative for the Tool schema, semantic validation, authorization, exact resource identity, business transaction, durable facts and long-running Job. The Host adapter SHALL validate with the package-owned canonical validator before invoking the owning service. Domain capabilities SHALL NOT be wrapped in MCP merely to reach DSH, and direct UI operations SHALL call the same owning application service without creating a hidden Agent turn.

#### Scenario: DSH emits semantically invalid Canvas arguments

- **WHEN** arguments violate a locator, range, array bound or cross-field invariant
- **THEN** the Canvas-owned validator rejects the request before resource access or mutation
- **AND** DSH receives an explicit failed Tool result for the exact call

#### Scenario: User starts Generation directly from UI

- **WHEN** the user invokes a Generation action from a native product control
- **THEN** the UI delegates directly to the Generation application service through its typed Desktop port
- **AND** no Conversation, Agent turn or MCP wrapper is created

### Requirement: Clear and compact retain one authoritative path

Product clear SHALL create a new Conversation identity bound to a newly created empty DSH Session; it MUST NOT erase or rebind the source Conversation. The new Session SHALL be created and validated before one catalog transaction publishes the complete binding. Pre-publication cleanup MAY target only the exact provisional Session created by that request. Window selection occurs after durable publication and MUST NOT roll back or hide the new record. Compaction SHALL use only the qualified DSH compaction path.

#### Scenario: User clears the current Conversation

- **WHEN** creation, Session validation and catalog publication succeed
- **THEN** Desktop selects the new Conversation and empty DSH Session
- **AND** the source Conversation remains listable with unchanged transcript authority

#### Scenario: DSH compaction is unavailable

- **WHEN** the qualified DSH compaction operation cannot complete
- **THEN** the operation fails visibly for that Conversation
- **AND** no self-developed compactor, hidden Session or stale projection returns success

### Requirement: Native UI creates a Conversation through one durable publication path

The package-owned Agent application SHALL own the only new-Conversation publication path. It SHALL reserve canonical Host Conversation metadata and exact domain context, create one DSH Session through standard ACP `session/new`, revalidate that exact Session through the complete bounded `session/list` path, and publish one Conversation-to-Session binding. Desktop Main SHALL resolve the exact sender-bound Agent Surface and attach the published Conversation to that draft only after durable publication. Renderer MUST NOT provide Workspace authority, provider/model facts, cwd or a DSH Session identity, and no active/recent Conversation fallback is allowed.

#### Scenario: User creates a Conversation from an exact Workspace Agent Surface

- **WHEN** the user activates the create control on an unbound Workspace Agent Surface
- **THEN** the Host resolves that Surface's exact Workspace and grant context
- **AND** the package-owned publication path creates, revalidates and binds one DSH Session
- **AND** Desktop selects the resulting Conversation only after its catalog record and binding are durable

#### Scenario: Session creation succeeds but publication cannot complete

- **WHEN** DSH returns a new Session but exact revalidation or binding publication fails
- **THEN** the request fails visibly and the reserved Host Conversation remains visible with a local diagnostic
- **AND** no raw DSH file deletion, private DSH API, `session/close`-as-delete, Pi path or recent-Session fallback reports success
- **AND** release readiness remains blocked until exact provisional cleanup is available through a qualified public seam
