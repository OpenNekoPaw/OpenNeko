## ADDED Requirements

### Requirement: Skill locators use one opaque protocol

The Agent runtime SHALL present Skill catalog locators as process-local opaque values accepted only by `read_skill` and MUST NOT instruct the model to resolve them into absolute host paths or pass them to file, shell, content, cache or Webview operations.

#### Scenario: Model receives the Skill catalog

- **WHEN** an exact Turn has one or more invocable Skills
- **THEN** the system prompt presents their name, description and opaque locator with one `read_skill`-only rule
- **AND** no filesystem path-resolution instruction is present

#### Scenario: Skill resource is read

- **WHEN** an activated Skill refers to a contained relative resource
- **THEN** the runtime resolves it as a virtual child locator through `read_skill`
- **AND** no host path is exposed to the model

### Requirement: Capability guidance matches the immutable Turn tools

Every capability operation prompt fragment MUST declare the exact canonical Tool names it describes. The runtime SHALL inject a fragment only when all declared Tools are present in the same immutable filtered Tool snapshot passed to the provider Turn.

#### Scenario: Exact authoring target exposes mutation guidance

- **WHEN** a content-document authoring receipt admits `Write` for the exact Turn
- **THEN** the corresponding content mutation guidance is eligible for composition
- **AND** the recorded prompt and Tool facts identify the same Turn

#### Scenario: Mutation Tool is withheld

- **WHEN** the exact Turn is unbound or bound to a different authoring target
- **THEN** fragments requiring the withheld mutation Tool are absent
- **AND** the runtime does not imply that the capability may be called

#### Scenario: One fragment is inapplicable

- **WHEN** one provider fragment references a Tool absent from the exact Turn while sibling fragments remain applicable
- **THEN** only that fragment is omitted
- **AND** sibling Tools, fragments, Conversations and Workspace remain available

### Requirement: Prompt composition preserves provenance and priority

The runtime SHALL compose base system policy, applicable capability fragments and user instructions as distinct labeled sections. Host `customSystemPrompt` configuration SHALL be mapped once at the controller boundary into Turn-owned `userInstructions`; the Turn contract MUST NOT expose that value as a second system prompt. Capability fragments SHALL be ordered by descending declared priority and stable fragment identity, and duplicate identities MUST fail visibly at their owning registration boundary.

#### Scenario: Multiple capability fragments apply

- **WHEN** an exact Turn admits fragments with different priorities and owners
- **THEN** the effective prompt records owner-qualified sections in deterministic priority order
- **AND** user instructions remain a separate final section

#### Scenario: Host custom prompt enters one canonical composer

- **WHEN** Host settings contain `customSystemPrompt`
- **THEN** the controller maps its value to the Turn's `userInstructions`
- **AND** the final composer appends it after capability guidance under the user-instructions section
- **AND** no Turn-level `customSystemPrompt` or parallel system-prompt composition path exists

#### Scenario: Duplicate fragment identity is registered

- **WHEN** two providers contribute the same prompt fragment identity
- **THEN** the conflicting registration fails visibly
- **AND** no first-writer, last-writer or provider-priority fallback selects a successful prompt

#### Scenario: Turn snapshot fragment validation fails

- **WHEN** strict fragment aggregation fails while creating an exact Turn snapshot
- **THEN** that Turn rejects through the canonical Turn error boundary
- **AND** active Turn ownership is cleaned up
- **AND** a later valid Turn in the same Conversation can proceed

#### Scenario: Surface detaches during an accepted Turn

- **WHEN** a Session Surface detaches after Turn acceptance but before final prompt composition
- **THEN** the background Turn continues under its exact Conversation identity
- **AND** final prompt facts and terminal evidence complete before the connection-owned projector is disposed
- **AND** presentation attachments are released without retaining the UI Root
- **AND** no projector fallback, retry or background Turn cancellation occurs

### Requirement: Completion and persistence claims require runtime evidence

The cross-domain system prompt SHALL instruct the Agent to deliver the requested result concisely and MUST distinguish chat or composite artifacts from durable files, project revisions and generated assets. The Agent MUST NOT claim persistence or execution completion without matching Tool/runtime terminal evidence.

#### Scenario: User requests a saved document without a writable target

- **WHEN** the exact Turn has no admitted document mutation capability
- **THEN** the Agent reports the missing target or capability concisely
- **AND** does not describe chat Markdown or a composite artifact as a saved document

#### Scenario: Durable mutation succeeds

- **WHEN** the exact Tool returns a successful durable file, revision or asset identity
- **THEN** the Agent may report completion with that evidence
- **AND** avoids repeating speculative plans after the requested result exists
