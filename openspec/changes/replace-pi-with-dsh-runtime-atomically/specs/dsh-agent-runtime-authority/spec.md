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

### Requirement: The official standard preset is the sole general Agent capability composition

The official OpenNeko DSH profile SHALL compose every executable Agent through the shipped DSH `standard` preset using the public agent-preset roster. File editing, Shell, filesystem and web search, Skills, planning, goals, subagents and workflows SHALL come from that preset and its canonical Host services. The profile MUST disable the corresponding process-global model-facing rows inherited from `dsh-base`, and OpenNeko MUST NOT register aliases, copied tools or fallback implementations for those capabilities. Official OpenNeko domain Tools MAY contribute to the same DSH layered Tool registry without replacing the standard preset.

#### Scenario: Create or resume an executable Conversation

- **WHEN** the bridge creates, loads, resumes or rebuilds the exact DSH Agent
- **THEN** it mounts the shipped `standard` preset before publishing the Agent
- **AND** a missing or broken preset rejects only that Session operation with an explicit diagnostic
- **AND** no empty Agent, process-global duplicate Tool path or OpenNeko fallback is used

#### Scenario: A standard capability lacks its Host dependency

- **WHEN** web search lacks its provider credential or another standard capability lacks a required Host service
- **THEN** that exact capability fails visibly through the DSH-owned error path
- **AND** OpenNeko does not hide the capability failure, invent a result or route to a self-developed implementation

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

#### Scenario: A completed turn displays its processing duration

- **WHEN** DSH publishes matching `turn/start` and `turn/end` events for an exact Session and turn
- **THEN** the bridge preserves both DSH event timestamps and the package-owned projection derives one canonical `startedAt` and `completedAt`
- **AND** the existing Agent turn status presentation displays the completed duration from those values for both live and replayed events
- **AND** Renderer receipt time, local clocks, Tool durations and adjacent turns cannot become replacement timing authorities or replay facts

#### Scenario: An active turn displays live processing state and elapsed time

- **WHEN** the projection identifies `currentTurn` and contains that exact turn's DSH `startedAt`
- **THEN** the existing Agent turn status presentation displays a transient processing row at the transcript tail and refreshes its elapsed presentation from that DSH start time
- **AND** the Renderer current clock only drives the transient refresh and is not written to the contract, projection, persistence or completed duration
- **AND** matching `turn/end` removes the processing row and displays the canonical completed duration
- **AND** replay without an active `currentTurn` does not display a processing row

#### Scenario: Turn timing is invalid

- **WHEN** a turn end has no matching start, names another turn or precedes the matching start time
- **THEN** the affected event is rejected with a local diagnostic
- **AND** sibling events, Sessions and Conversations remain available without a fabricated duration

#### Scenario: DSH streams assistant text and reasoning

- **WHEN** an active DSH step publishes `assistant/chunk` text or reasoning deltas with exact turn, step and block identities
- **THEN** the bridge projects those deltas through standard ACP message or thought chunks and the package-owned projection incrementally assembles the corresponding existing Agent presentation
- **AND** DSH remains the only output and transcript authority without a provider token reader, Renderer stream connection, second transcript or Pi path
- **AND** interleaved blocks remain ordered by their DSH block index and reasoning cannot be merged into visible answer text

#### Scenario: DSH settles a streamed assistant step

- **WHEN** DSH publishes `assistant/message` for a step that already has live text or reasoning assembly
- **THEN** the stable DSH message identity and final blocks replace the matching transient assembly atomically
- **AND** the final answer appears exactly once without concatenating the final message after its deltas
- **AND** Session replay rebuilds the same final presentation through the canonical bridge/projection path without replaying historical token animation

#### Scenario: A streamed frame is invalid or exceeds its bound

- **WHEN** a frame has an invalid or stale sequence, unknown turn or step, invalid block identity, unsupported delta shape or causes the exact live assembly to exceed its fixed bound
- **THEN** that frame fails locally with an explicit diagnostic and cannot fabricate a final message
- **AND** sibling streams, Sessions and Conversations continue without switching to a raw Session reader, cached transcript or alternate runtime

#### Scenario: A model streams a Tool call

- **WHEN** DSH emits `tool-call-delta` chunks before the canonical `tool/call` event
- **THEN** OpenNeko does not expose incomplete arguments or create Tool lifecycle facts from those deltas
- **AND** the exact DSH `tool/call` and `tool/result` events remain the only Tool presentation authority

### Requirement: Domain Tools preserve package ownership

Generation and Canvas SHALL be the first vertical official domain Tool slice registered in DSH; Cut, Assets, Character, World and remaining domain capabilities SHALL follow. DSH SHALL own Tool registration, selection, call identity and execution lifecycle. Each owning package SHALL remain authoritative for the Tool schema, semantic validation, authorization, exact resource identity, business transaction, durable facts and long-running Job. The Host adapter SHALL validate with the package-owned canonical validator before invoking the owning service. Domain capabilities SHALL NOT be wrapped in MCP merely to reach DSH, and direct UI operations SHALL call the same owning application service without creating a hidden Agent turn.

#### Scenario: DSH advertises a first-party domain Tool to the model

- **WHEN** the Generation or Canvas DSH plugin registers its Tool
- **THEN** it uses the owning package's exact model-facing parameter schema with the canonical operation envelope, required fields and field names
- **AND** nested operation input rejects undeclared fields before Host dispatch while the Host-owned decoder remains the semantic validation authority
- **AND** the plugin does not replace the schema with unconstrained JSON, compatibility aliases or prose-only parameter instructions

#### Scenario: DSH emits semantically invalid Canvas arguments

- **WHEN** arguments violate a locator, range, array bound or cross-field invariant
- **THEN** the Canvas-owned validator rejects the request before resource access or mutation
- **AND** DSH receives an explicit failed Tool result for the exact call

#### Scenario: User starts Generation directly from UI

- **WHEN** the user invokes a Generation action from a native product control
- **THEN** the UI delegates directly to the Generation application service through its typed Desktop port
- **AND** no Conversation, Agent turn or MCP wrapper is created

### Requirement: Attachments and perception use one capability-negotiated input path

ACP Prompt content blocks SHALL be the sole Desktop-to-DSH message input path. The bridge SHALL advertise only content types it can preserve into the DSH Session and current provider request. Images SHALL use DSH durable image attachments and image blocks after Host authorization and DSH admission. Audio, video, document and other file inputs without a qualified DSH native block SHALL be converted only by their owning media/content service into bounded source-attributed evidence. OpenNeko MUST NOT serialize raw paths, bearer URLs or a second Agent multimodal packet into the Session.

The product SHALL use the selected current model directly when its authoritative model capability includes the input modality. Otherwise it SHALL require an explicitly configured perception model and produce structured evidence before the same DSH turn is submitted. Missing capability, missing perception configuration or failed perception SHALL reject only the affected input visibly; it MUST NOT silently drop the attachment, infer a provider or retry through another model.

#### Scenario: User submits a supported image

- **WHEN** the selected Agent model supports image input and the image passes Host authorization and DSH attachment admission
- **THEN** the exact DSH Session receives one native image content block with its durable attachment reference
- **AND** no OpenNeko multimodal runtime or text-placeholder path is used

#### Scenario: Current model cannot perceive the selected media

- **WHEN** an explicitly configured perception model supports the media type
- **THEN** the owning perception path returns bounded structured evidence with exact source and model identity
- **AND** that evidence is injected into the same exact turn context before the Agent prompt

#### Scenario: No qualified input path exists

- **WHEN** neither the current model nor the configured perception model can process the selected attachment
- **THEN** the Composer reports the unsupported input and does not submit the turn
- **AND** the attachment is not discarded or replaced by fabricated text

### Requirement: DSH lifecycle remains minimal and does not create shadow state

The product lifecycle SHALL use only create, bounded list/revalidation, load/resume, prompt, cancel, close/release and exact-binding reload after restart. OpenNeko MUST NOT mirror Agent handles, Session persistence or pending inbox. A missing public DSH delete or inbox-preserving close seam SHALL remain an explicit capability blocker; `session/close` MUST NOT be treated as deletion and a Host shadow queue MUST NOT be introduced.

#### Scenario: Conversation publication fails after DSH Session creation

- **WHEN** the locked DSH release exposes no public Session delete operation
- **THEN** the reserved Conversation remains visible with an unavailable diagnostic and the created Session is not deleted through private storage access
- **AND** the product does not report cleanup success

#### Scenario: Pending inbox cannot survive release

- **WHEN** the public DSH handle lifecycle cannot close while preserving pending inbox
- **THEN** offline inbox editing remains unavailable or is removed from the release surface
- **AND** OpenNeko does not retain a shadow queue or leak the DSH owner

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

#### Scenario: Entry creates a Project-bound Conversation

- **WHEN** the user selects a stable Project in the unbound Entry and submits its first prompt
- **THEN** Renderer submits only that Project choice with the exact Agent Surface identity
- **AND** Desktop Main resolves the Project to its exact Workspace, signs a process-scoped grant, publishes a Workspace Conversation and attaches the original Draft before prompting
- **AND** it does not publish an Assistant Conversation or switch Scene when the Project is merely selected

#### Scenario: Persisted Workspace Conversation reattaches after restart

- **WHEN** an exact persisted Workspace Conversation is opened in a new Desktop process
- **THEN** its current sender-bound Agent Surface restores the same `workspaceGrantId` for the same Window and Workspace before composer projection or prompt
- **AND** a missing Workspace or failed restore disables only that Conversation with an explicit diagnostic
- **AND** no replacement grant, active/recent Workspace or Assistant context is used

#### Scenario: Persisted DSH Session belongs to a retired preset

- **WHEN** the Conversation binding references a DSH Session that canonical `session/list` does not advertise for the current profile
- **THEN** the Conversation remains visible and locally unavailable with its original binding preserved
- **AND** OpenNeko does not load it through a compatibility preset, rebind it or create a replacement Session

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

### Requirement: Composer input triggers use DSH and Host canonical authorities

The retained native Composer SHALL reuse its existing `/`, `$` and `@` presentation components. For an exact loaded DSH Session, slash commands SHALL be discovered and executed through DSH `commands`; user-invocable Skills SHALL be discovered through the DSH Skill catalog and submitted as the DSH-native `/skill-name` user gesture after exact catalog validation. Host mentions SHALL contain only sender-bound, authorized product resources with canonical identities. No trigger may fall back to an ordinary Prompt, Pi, a self-developed Skill/MCP/Plugin runtime, raw filesystem search or an active/recent Workspace.

Product-shipped first-party Skills SHALL be exposed to the DSH `standard` preset only as the exact read-only bundled Skill resource resolved by Desktop and passed through the DSH-supported subprocess environment. DSH SHALL remain the discovery, parsing, catalog and execution authority. OpenNeko MUST NOT scan that directory into a second catalog or mix ordinary Workspace, personal or third-party roots into the bundled resource.

#### Scenario: User executes a DSH slash command

- **WHEN** the user selects or submits `/name args` from the existing Composer menu
- **THEN** the Host revalidates the exact command against the current DSH Session catalog and invokes DSH command execution without creating a model turn
- **AND** DSH `command/run` and `command/done` records project as one persistent Command activity with the native result
- **AND** an unknown or stale command fails visibly without being sent as a Prompt

#### Scenario: User explicitly invokes a DSH Skill

- **WHEN** the user selects or submits `$skill-name args` and that exact Skill is still user-invocable in the current DSH Session catalog
- **THEN** the typed Session boundary sends `/skill-name args` as the direct user message so DSH performs its canonical Skill injection
- **AND** the user-facing transcript preserves the original `$skill-name args` intent
- **AND** a missing, stale, incomplete or non-user-invocable Skill fails visibly without a normal-message fallback

#### Scenario: User opens the mention menu

- **WHEN** the Composer belongs to an exact authorized Workspace or bound product context
- **THEN** `@` candidates are projected only from canonical Host resource identities authorized for that binding
- **AND** locator-backed files and media carry exactly one `ContentLocator`, while available Assets and active Project Entities carry exactly one bounded `AgentContextPayload`
- **AND** selecting a candidate produces the existing reference token/chip presentation
- **AND** the selected locator is submitted as one ACP resource link or the selected context receipt is appended as untrusted data to the exact DSH turn context
- **AND** missing authority remains local and cannot search raw paths or infer another Workspace
