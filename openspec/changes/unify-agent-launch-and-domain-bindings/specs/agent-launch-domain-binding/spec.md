## ADDED Requirements

### Requirement: Invalid persisted Conversation lifecycle fails locally during bootstrap

The system SHALL retain a persisted Conversation whose lifecycle payload does not satisfy the
single current canonical shape and SHALL return a typed unavailable bootstrap result for that exact
Conversation Surface. The lifecycle owner MUST NOT add missing-field defaults, read an obsolete
shape as success, rewrite or delete the record, and the Desktop bootstrap boundary MUST NOT expose
the decode failure as a rejected IPC handler. Sender, Scene, owner and trust-boundary mismatches
MUST continue to fail closed.

#### Scenario: Historical lifecycle record does not prevent Desktop UI rendering

- **GIVEN** a retained Conversation catalog record whose lifecycle payload uses `initialMessage` or omits the canonical `contextReferences`
- **WHEN** Desktop restores the exact Conversation Agent Surface
- **THEN** the bootstrap returns an exact Conversation-unavailable diagnostic without creating an Agent connection
- **AND** Window Shell, Workspace Main, navigation and valid sibling Conversations remain usable
- **AND** the stored lifecycle payload remains unchanged

#### Scenario: Valid sibling Conversation still bootstraps

- **GIVEN** one invalid historical lifecycle record and one valid canonical lifecycle record
- **WHEN** each exact Conversation is opened independently
- **THEN** only the invalid Conversation Surface is unavailable
- **AND** the valid sibling follows the canonical ready bootstrap path

#### Scenario: Trust-boundary failures are not converted to local record diagnostics

- **GIVEN** a forged sender, Scene, View, Workspace or Conversation identity
- **WHEN** Desktop validates bootstrap authority
- **THEN** the request fails closed
- **AND** it does not return a conversation-invalid success-shaped diagnostic

### Requirement: Launch phase and domain binding are orthogonal

The Agent application SHALL model Draft or Session phase independently from unbound, Assistant, Workspace, Character, or World binding, and SHALL NOT derive either dimension from the current Scene, input text, active Project, mounted component, or execution state.

#### Scenario: Fresh Agent Entry creates an unbound Draft

- **WHEN** the user opens the Agent Entry
- **THEN** the Host creates a new exact Draft identity with unbound binding and no Conversation, Turn, provider execution, domain Run, or hidden AgentSession

#### Scenario: Unbound Entry submits without target selection

- **WHEN** the user submits a valid input from an unbound Entry Draft without selecting a domain target
- **THEN** the Agent application materializes the explicitly configured default Assistant owner, commits one Assistant Conversation and pending Turn, and never requires the user to pre-bind or infers an active, current, recent, or first Workspace

#### Scenario: Running Turn does not change owner binding

- **WHEN** a bound Conversation moves between idle, queued, running, approval, completed, or failed execution states
- **THEN** its exact domain binding and Conversation owner remain unchanged

### Requirement: Entry target selection produces an exact Draft binding receipt

The Agent launch authority SHALL bind a selected Assistant or Workspace target, and any future domain target supplied by an explicitly composed authoritative provider, to the exact Draft, launch connection, sender, and owner identity without creating a Conversation or provider Turn.

#### Scenario: Workspace is selected for the next Conversation

- **WHEN** the user selects an exact Project or authorized directory from an unbound Draft
- **THEN** the Draft receives one sender-bound Workspace binding receipt and remains a Draft without activating another Project or creating a Conversation

#### Scenario: Draft target is replaced

- **WHEN** the user replaces one Draft target with another exact target
- **THEN** the launch authority releases the old receipt and its target-scoped queries and makes only the new binding available to later Draft operations

#### Scenario: Stale target receipt is submitted

- **WHEN** a submit request carries a replaced, consumed, cross-Draft, cross-Window, or unknown binding receipt
- **THEN** only that submit request fails with an exact diagnostic and no Conversation, Run, grant mutation, or provider Turn is created

### Requirement: Domain surfaces create bound Drafts through the same launch path

Implemented Assistant and Workspace product surfaces SHALL create a bound Draft through the canonical Agent launch application entry and SHALL reuse the same composer, catalog, configuration, submit, and error contracts as the unbound Entry. Future Character and World surfaces SHALL remain unavailable until their authoritative owners are composed through that same entry.

#### Scenario: Workspace Surface starts a new Conversation

- **WHEN** the user invokes New Conversation from an exact Workspace Surface
- **THEN** the Agent Root opens a Draft whose Workspace identity and grant are fixed by that Surface while editable launch fields remain governed by its projected configuration policy

#### Scenario: Character Surface owner is not composed

- **WHEN** no Chara-owned published CharacterVersion and CharacterRun provider is composed
- **THEN** Desktop exposes no successful Character interaction entry and Agent does not fabricate a binding from Entity data, a fixture, a slash-command string, or free-form prompt

#### Scenario: Product opens a Project without selecting it as Agent context

- **WHEN** the user chooses the Window navigation action to open a Project
- **THEN** the Host changes only the exact Window Scene and does not mutate an unrelated Agent Draft binding or create a Conversation

### Requirement: Domain owners provide bounded launch context

Each supported domain SHALL own validation and projection of its facts through an explicit host-neutral binding/context port, while the Agent SHALL own Conversation and Turn lifecycle and Desktop SHALL only wire concrete Electron adapters.

#### Scenario: Workspace context is prepared

- **WHEN** a Workspace-bound Draft or Conversation requests context
- **THEN** the Workspace owner validates the exact Workspace grant and provides bounded references, search and capability projections without exposing raw paths or copying Workspace facts into Agent persistence

#### Scenario: Future domain context provider is absent

- **WHEN** a typed Character or World binding is presented without its authoritative provider
- **THEN** Agent returns an owner-qualified unavailable diagnostic and creates no Conversation, domain Run, context payload, or alternate owner success

#### Scenario: One domain provider fails

- **WHEN** one target provider is missing, invalid, or cannot read its authoritative facts
- **THEN** that target or Conversation becomes locally unavailable with an owner-qualified diagnostic while other Draft targets, Conversations, Workspaces and domains remain usable

### Requirement: World remains the authority for World interaction

World integration SHALL use the canonical AgentSession only through World-owned participant and AI-role scopes, and World SHALL remain the sole authority that validates and commits World actions, events and state.

#### Scenario: World runtime is not implemented

- **WHEN** no World application provider can resolve an Entry or Surface target
- **THEN** Agent returns an owner-qualified unavailable result and does not expose a fake successful World binding, World Conversation, World Run or model-only fallback

#### Scenario: Available World binding is submitted

- **WHEN** a future World owner provides a valid WorldExperience or WorldRun binding and the user submits an interaction
- **THEN** Agent attaches the exact Conversation or role scope requested by World while model output remains an untrusted proposal and cannot directly commit World state

### Requirement: First submit is one canonical local transaction and execution chain

The Agent application SHALL validate the exact Draft, binding, resources, typed input and configuration before atomically committing Conversation owner/context, initial input intent and durable pending Turn, and SHALL materialize the same Conversation before Scene handoff and provider execution.

#### Scenario: Valid Workspace Draft is submitted

- **WHEN** the user submits a valid typed input from a Workspace-bound Draft
- **THEN** the application commits one exact Workspace Conversation and pending Turn, materializes that Conversation in the Workspace AgentSession, switches to its Workspace Scene, and starts the same Turn without duplicating the initial input

#### Scenario: Validation rejects first submit

- **WHEN** target, grant, typed input, domain context, model configuration, or local persistence validation fails
- **THEN** the Draft remains available with a diagnostic and no partial Conversation, domain Run, Scene handoff, grant binding, or provider execution is reported as successful

#### Scenario: Provider fails after local commit

- **WHEN** local Conversation and pending Turn commit succeeds but provider execution fails
- **THEN** the exact Conversation remains visible with a failed or recoverable Turn diagnostic and the system does not roll back to Draft, switch owner/provider, or repeat the first input

#### Scenario: First submit is retried

- **WHEN** the same exact submit request is retried after an uncertain response
- **THEN** the application returns or resumes the same Conversation and Turn identities without creating duplicate messages, Conversations, Runs, grants or provider calls

### Requirement: First submit persists one content-derived Conversation title

The Agent application SHALL derive one bounded deterministic Conversation title from the canonical
typed first input and SHALL persist it through the same Pi Conversation materialization path before
the Home catalog is projected. It SHALL NOT call a model, translate user content, or substitute a
Renderer-only title or English placeholder as the persisted result.

#### Scenario: Chinese message starts a Conversation

- **WHEN** the user first submits a Chinese message from an Entry or bound Draft
- **THEN** the materialized Pi Conversation and Home catalog use a compact title derived from that exact Chinese message, and reopening the Conversation preserves the same title

#### Scenario: Command or Skill starts a Conversation without arguments

- **WHEN** the first typed input is a launch-safe command or Skill with no optional arguments
- **THEN** the persisted title retains the exact `/command` or `$skill` identity instead of displaying an English default placeholder

#### Scenario: Home catalog observes materialization

- **WHEN** the titled Conversation is materialized during first submit
- **THEN** the authoritative Home projection is invalidated once and the Project or Assistant navigation row reads the persisted Pi catalog title

### Requirement: Visible execution activity converges with terminal Conversation projection

The Agent Webview SHALL treat the exact Conversation projection as authoritative for visible Turn
completion and SHALL NOT keep a generic execution activity visible after the current Turn projects a
non-streaming final Assistant response.

#### Scenario: Final Assistant response is projected before transient state cleanup

- **WHEN** the current Turn projects a non-streaming final Assistant response after the latest user input while an older non-idle Agent state is still present
- **THEN** the transcript keeps the final response and does not display the generic processing activity for that completed Turn

#### Scenario: Current Turn still has canonical live work

- **WHEN** the current Turn has streaming text, a pending Tool, a queued message, or no terminal Assistant response
- **THEN** the appropriate canonical live record or generic activity remains visible until that exact work reaches its terminal projection

### Requirement: Content references preserve one user-visible message and one deterministic processing route

The Agent application SHALL preserve the original user text and locator-backed reference metadata as
the durable transcript presentation while preparing a separate transient provider prompt. Textual
formats SHALL be read directly through the bounded Agent content runtime; structured documents,
images, audio, video and unknown binary content SHALL use exactly the capability selected for their
content class and current Turn policy.

#### Scenario: Textual creative source is referenced

- **WHEN** a user references UTF-8 text, Markdown, Fountain, JSON, YAML or HTML content
- **THEN** Agent reads the bounded text directly and injects it only into the current provider request without requiring `ReadDocument` or persisting extracted text

#### Scenario: Structured or binary content is referenced

- **WHEN** a user references a supported structured document, image, audio or video
- **THEN** Agent preserves the locator and uses only the exact registered document, native multimodal or perception capability selected before execution, with no provider, reader or source fallback

#### Scenario: Pi reads a semantic document range

- **WHEN** Pi selects a locator from a `ReadDocument` manifest and requests range mode
- **THEN** the model-visible Tool contract accepts only the returned `unit_ref` and optional bounded read limit
- **AND** a ContentLocator, DocumentLocator, nested locator object or another undeclared field is rejected with an exact corrective diagnostic and is not interpreted through an alias or alternate reader

#### Scenario: ReadImage returns native image content to Pi

- **WHEN** `ReadImage` successfully reads one or more exact content or representation locators in a Workspace Turn
- **THEN** the Workspace Agent runtime uses its canonical content access authority to project bounded image payloads into the same Pi Tool result and the next reasoning step
- **AND** Desktop does not inject a private file loader and Pi does not read raw paths, cache paths or locator URIs as an alternate source

#### Scenario: ReadImage result cannot be materialized

- **WHEN** an attachment lacks an exact locator, content access rejects it, the bytes are not an image, or the provider transport budget is exceeded
- **THEN** only the exact Tool/Turn fails visibly and no URI, source, provider, reader or sibling attachment is used as fallback success

#### Scenario: Model calls content Tools with Conversation-scoped references

- **WHEN** the model calls `ReadDocument` or `ReadImage` for authorized input or a prior document result
- **THEN** it supplies only `input_ref`, `unit_ref`, `cursor_ref` or `image_ref` strings issued in the exact Conversation
- **AND** Agent resolves those references to canonical locators inside the application boundary without asking the model to copy fingerprints, locator unions, entry paths or representation specs

#### Scenario: Model submits a stale or cross-Conversation reference

- **WHEN** a Tool call supplies an unknown, stale, cross-owner or cross-Conversation short reference
- **THEN** only that Tool call fails with an exact reference diagnostic and the UI, sibling Tool results, Conversations and Workspaces remain available

#### Scenario: Document image batch is bounded before provider delivery

- **WHEN** document analysis needs image evidence from more than five pages or entries
- **THEN** Agent requires a selected batch of at most five `image_ref` values and Host projects bounded overview or detail payloads using image normalization or contact sheets
- **AND** it never sends more than five source images or an unbounded document payload in one provider continuation

#### Scenario: Referenced content has no valid processing capability

- **WHEN** an unknown binary, invalid UTF-8 source or unsupported media reference cannot use the selected Turn capability
- **THEN** only the exact Turn fails with a visible diagnostic, its activity reaches a terminal state, and sibling Conversations and Surfaces remain available

#### Scenario: Model discovers a Workspace directory before reading text

- **WHEN** a Workspace Conversation calls `ListDirectory` with a Workspace-relative directory path
- **THEN** the Core Tool returns a bounded single-level structured catalog backed by authorized `workspace-file` locators and no absolute path or shell output
- **AND** Pi projects a text entry as `workspace_path` so the model can call the basic `Read` Tool without constructing a locator

#### Scenario: Directory entry requires a content capability

- **WHEN** the same directory contains a structured document, image, audio, video, protected project file or unsupported binary
- **THEN** Pi projects only the exact `input_ref`, `image_ref`, owning-domain route or unavailable diagnostic selected for that class
- **AND** it does not expose a basic text path for known non-text content, call `Read` as a format probe, or switch reader, Tool, provider or source after failure

#### Scenario: Directory traversal crosses a symlink

- **WHEN** `ListDirectory` targets a symlink or a descendant whose real path leaves an authorized root
- **THEN** only that listing is rejected before enumeration and no physical target path or child entry is projected
- **AND** linked Media Library discovery remains owned by its existing Assets contributor rather than an ordinary file-walker fallback

#### Scenario: Basic Read receives non-text bytes

- **WHEN** `Read` is called directly with a known non-text format, oversized file, invalid UTF-8 bytes or NUL-containing content
- **THEN** that Tool Call fails with an exact text-boundary diagnostic before returning content
- **AND** valid sibling files, Tool calls, Conversations and the Agent Surface remain available

#### Scenario: Referenced message is projected or reopened

- **WHEN** a Turn used transient extracted text, native image bytes or an internal locator instruction
- **THEN** the transcript displays one user message containing the original text and structured reference token, and does not display a duplicate provider prompt or internal `Attached Context`/`ContentLocator` text

### Requirement: Conversation domain binding is immutable

An existing Conversation SHALL retain its exact owner and domain context for its lifetime; selecting a different Workspace, Character, Assistant, or World target SHALL create a new Draft and Conversation rather than rebinding the existing one.

#### Scenario: User changes Workspace target during a Conversation

- **WHEN** the user chooses another Workspace while viewing an existing Workspace Conversation
- **THEN** the product creates or navigates to a separate Draft and leaves the original Conversation transcript, owner, runtime and background work unchanged

#### Scenario: Conversation is reopened

- **WHEN** the user reopens an exact persisted Conversation after UI unload or application restart
- **THEN** the Host restores the same owner-qualified context and never substitutes the current, recent, first or active Project, Assistant, Character or World

### Requirement: Invalid persisted bindings fail locally without rewriting user facts

Conversation records that cannot satisfy the canonical owner or context contract SHALL remain visible with a diagnostic and SHALL NOT be migrated, repaired, defaulted, hidden or deleted automatically.

#### Scenario: Persisted Workspace owner is missing

- **WHEN** a persisted Conversation references a Workspace that cannot be resolved
- **THEN** that Conversation is marked unavailable with its original record preserved, execution is disabled for it, and sibling Conversations and Workspaces remain available

#### Scenario: Persisted future-domain binding cannot be resolved

- **WHEN** a persisted Character or World Conversation binding cannot be resolved by an authoritative owner
- **THEN** Agent preserves and rejects only that Conversation and does not guess from a current domain record, current Project, fixture or transcript text

### Requirement: Persisted Workspace Draft grant authority is restored exactly and fails locally

Desktop Main SHALL restore the same process-scoped Workspace grant identity from the exact persisted
Window, Workspace and Draft binding when that Draft attaches after application restart. It SHALL NOT
generate a replacement grant, resolve another Workspace, or let restoration failure reject Window Shell
startup or replace the complete Desktop UI with an IPC error.

#### Scenario: Workspace Draft attaches after application restart

- **WHEN** a persisted Workspace Draft attaches in a new application process whose grant authority does not yet contain its `workspaceGrantId`
- **THEN** Desktop restores that same grant identity for the exact Window and Workspace before composing the Draft catalog, and the Agent Root mounts normally

#### Scenario: Persisted Workspace cannot restore its grant

- **WHEN** the exact persisted Workspace is missing or its grant cannot be restored
- **THEN** attach returns an owner-qualified unavailable diagnostic for only that Agent Surface, preserves the persisted identities and sibling UI, and does not use an active, current, recent or first Workspace

#### Scenario: Agent attach fails unexpectedly in Renderer

- **WHEN** an Agent attach or bootstrap request rejects after the Desktop Surface has mounted
- **THEN** Renderer displays an internationalized local Agent diagnostic with an explicit retry action, does not expose raw IPC, path or grant identity text, and does not prevent the Window Shell or sibling Surfaces from rendering
