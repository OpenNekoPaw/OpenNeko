## ADDED Requirements

### Requirement: Draft and Session share one canonical input catalog

The Agent application SHALL compose one canonical `AgentInputCatalogEntry` projection for mention, command and Skill triggers and SHALL filter or diagnose entries by exact phase, binding, source and runtime availability rather than by Renderer presentation booleans.

#### Scenario: Entry Draft opens command and Skill discovery

- **WHEN** the user types or activates `/` or `$` in a Draft
- **THEN** the composer displays all currently available Draft-safe command or Skill entries from the canonical catalog with the same identity and descriptions used for submission

#### Scenario: Session opens command and Skill discovery

- **WHEN** the user types or activates `/` or `$` in a Conversation
- **THEN** the composer uses the same catalog contract and includes entries permitted for that exact Session binding and phase

#### Scenario: Future domain policy contributes restricted capabilities

- **WHEN** a future authoritative Character or World provider disallows a command or Skill for its exact interaction
- **THEN** the shared catalog excludes it from executable results or projects it unavailable with an owner-qualified reason and raw text cannot bypass that restriction

### Requirement: Catalog entries retain exact source provenance

Command and Skill catalog entries SHALL distinguish builtin, personal, project, plugin and command-artifact origins through stable Host-owned identity and SHALL NOT resolve execution from display name alone.

#### Scenario: Entry composer discovers capabilities by typing

- **WHEN** the user types `/`, `$`, or `@` in the Entry composer
- **THEN** the composer projects the current Draft catalog without adding duplicate trigger buttons, and an unbound Draft does not invoke Workspace-only mention search or report its expected lack of Workspace authority as a global application error

#### Scenario: Same-named Skills exist in multiple sources

- **WHEN** project, personal, plugin or builtin sources expose the same Skill name
- **THEN** the existing canonical source precedence selects one exact executable identity, preserves source provenance and reports duplicates without trying another source after failure

#### Scenario: Project command artifact is discovered

- **WHEN** an exact Workspace contains a valid command artifact
- **THEN** the Workspace-bound Draft and Session catalog expose it with project provenance while unbound and unrelated Workspace catalogs do not

#### Scenario: One catalog artifact is invalid

- **WHEN** one Skill or command artifact fails strict discovery or validation
- **THEN** only that item receives a diagnostic or is excluded and valid sibling commands, Skills, mentions and domains remain available

### Requirement: Draft submit preserves typed command and Skill intent

The composer SHALL resolve a selected or directly typed command/Skill against the current catalog and submit its exact typed invocation; Draft submit SHALL NOT convert it to an ordinary model message.

#### Scenario: Skill is the first Draft input

- **WHEN** the user selects an available `$skill` in a Draft and submits arguments
- **THEN** first submit creates the exact Conversation and executes the selected Skill through the canonical Skill invocation path with a Skill receipt

#### Scenario: Launch-safe command is the first Draft input

- **WHEN** the user submits an available Draft-safe command
- **THEN** the command executes according to its declared launch semantics and does not become an ordinary provider prompt

#### Scenario: Unknown trigger is submitted

- **WHEN** the input begins with a command or Skill trigger that is absent or stale in the current catalog
- **THEN** submission fails with an unknown-or-stale input diagnostic and does not create a model Turn or try another command/Skill source

### Requirement: Session-only operations cannot execute in Draft

Commands requiring an existing Conversation SHALL declare Session phase and SHALL fail visibly when invoked without the exact Conversation identity.

#### Scenario: Compact is requested in Entry

- **WHEN** the user types or attempts to invoke `/compact` in an Entry or bound Draft
- **THEN** Agent reports `session-required`, creates no Conversation or provider Turn for that command, and does not compact another active or recent Conversation

#### Scenario: Compact is requested in Session

- **WHEN** the user invokes `/compact` in an exact Conversation
- **THEN** Agent compacts only that Conversation context, preserves its owner and transcript continuity, and projects completion or failure to the same Conversation

### Requirement: Mention search uses the exact Draft or Conversation authority

Mention discovery and selected references SHALL be resolved through the current exact binding and SHALL NOT query or authorize resources through an active, current, recent or first Project fallback.

#### Scenario: Workspace has been selected in Entry

- **WHEN** the user types `@` after selecting an exact Workspace target but before first submit
- **THEN** search returns authorized files and entities from that Workspace through its Draft binding receipt without creating a Conversation

#### Scenario: Entry remains unbound

- **WHEN** the user types `@` in an unbound Entry
- **THEN** search returns only scope-neutral and explicitly granted Assistant resources and does not search any Project implicitly

#### Scenario: Mention belongs to another Project

- **WHEN** a selected reference belongs to a different Project or Workspace than the current binding
- **THEN** only that reference or submit is rejected with both expected and actual owner diagnostics and no current-Project substitution occurs

#### Scenario: Fountain screenplay is selected as a text reference

- **WHEN** a Workspace-bound Draft or Session selects an authorized `.fountain` file through its exact ContentLocator
- **THEN** the Host reads it as bounded text context without requesting binary preprocessing, exposing a raw path, or changing the Conversation owner

#### Scenario: Workspace image is selected for a vision-capable Turn

- **WHEN** a Workspace-bound Draft or Session selects an authorized image through its exact ContentLocator and the exact selected model supports image input
- **THEN** the Agent workspace owner loads bounded image bytes through the canonical content access runtime and provides one native image part to that Turn while the message and UI retain only the locator

#### Scenario: Selected image cannot be used by the exact model

- **WHEN** an authorized image is selected but its MIME is invalid, its bounded read fails, or the exact selected model does not support image input
- **THEN** only that reference or Turn fails with an exact diagnostic before provider execution and the application does not switch model, provider, source or analysis path

#### Scenario: Selected reference requires unsupported preprocessing

- **WHEN** an authorized reference is audio, video, another unsupported binary type or requires a structured parser that is not composed for Agent context
- **THEN** only that reference or Turn fails with an exact diagnostic and the Host does not decode it as text, submit an empty context, or switch to another source

### Requirement: Target changes invalidate target-scoped input state

Changing or losing a Draft binding SHALL invalidate all catalog entries, mention results, selected references and pending searches owned by the previous binding while preserving unrelated Draft text and scope-neutral settings.

#### Scenario: User switches from Workspace A to Workspace B

- **WHEN** a Draft with Workspace A results and Project Skills is rebound to Workspace B
- **THEN** Workspace A results and executable identities are removed before Workspace B catalog becomes available and a late Workspace A response is ignored as stale

#### Scenario: Bound owner becomes unavailable

- **WHEN** the underlying Project or explicitly composed future-domain binding is removed or invalidated while its Draft is open
- **THEN** target-scoped actions become unavailable with a local diagnostic and scope-neutral Draft content remains recoverable

### Requirement: Catalog availability is fail-visible and fail-local

Every non-executable catalog entry SHALL either be absent by declared product presentation policy or carry a stable availability diagnostic, and no missing handler, provider or context SHALL be represented as enabled success.

#### Scenario: Required provider is missing

- **WHEN** a command, Skill or mention contributor requires a provider that is not registered for the exact binding
- **THEN** the affected item is unavailable with a diagnostic and the system does not invoke a default handler or fallback provider

#### Scenario: Catalog is partially available

- **WHEN** one source fails while other sources load successfully
- **THEN** valid entries remain usable and the source failure is observable without clearing the complete input catalog
