## ADDED Requirements

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
