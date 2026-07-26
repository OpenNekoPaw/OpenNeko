# Neko Chara Domain Package

## ADDED Requirements

### Requirement: Chara is the sole owner of current Character runtime behavior

OpenNeko MUST provide a top-level `@neko/chara` package that owns Character Dialogue, Embody Character, Character evidence, Character profile assembly, character-specific prompt projection, character runtime policy, and character purpose-model operations. `@neko/entity` and `@neko-agent/extension` MUST NOT retain parallel implementations or compatibility exports.

#### Scenario: A Character Dialogue turn executes

- **WHEN** the VS Code Agent host starts a Character Dialogue session and routes a user message
- **THEN** the session, profile, evidence, prompt and turn orchestration execute through `@neko/chara`
- **AND** the configured Agent purpose-model runtime is supplied through an injected public port

### Requirement: Chara core is host-neutral

Chara core and application modules MUST depend only on shared contracts and package-owned modules. They MUST NOT import VS Code, React, Webview implementation, Agent Extension implementation, concrete provider runtime, Entity Host adapters, or Search/Content Host adapters.

#### Scenario: Core package boundaries are checked

- **WHEN** repository architecture tests scan Chara core and application source
- **THEN** host/UI/Agent implementation imports are rejected
- **AND** package compilation succeeds without VS Code runtime access

### Requirement: VS Code behavior lives behind the Chara Host entry

VS Code-specific Character controllers, Entity facade calls, evidence file access, Project Search commands, Webview message projection and tab integration MUST live under `@neko/chara/host-vscode`. The Host entry MAY depend on public Agent message contracts but MUST NOT import Agent Extension implementation.

#### Scenario: Agent Extension composes Chara

- **WHEN** ChatProvider initializes role-session support
- **THEN** it constructs controllers from `@neko/chara/host-vscode` and injects Webview/tab/model ports
- **AND** Agent Extension does not assemble profiles, load Character evidence or own role-session state

### Requirement: Entity remains the generic fact owner

`@neko/entity` MUST continue to own generic Entity/Candidate facts, relationships, occurrences, representation hints, asset bindings, search/reference contribution and Entity memory contribution processing. It MUST expose those facts to Chara through public contracts without owning Character session, prompt, roleplay or Embody behavior.

#### Scenario: Character profile assembly reads Entity facts

- **WHEN** Chara assembles a Character profile
- **THEN** it reads stable Entity facts through injected/public Entity readers
- **AND** no Character runtime implementation is imported from `@neko/entity`

### Requirement: Old Character ownership paths are removed

The migration MUST delete the old Entity Character runtime exports and old Agent Extension Character controller/evidence files. New requests MUST NOT succeed through re-export shims, aliases, duplicate implementations or fallback imports.

#### Scenario: Repository callers compile after migration

- **WHEN** all current Character callers are built and tested
- **THEN** they import `@neko/chara` public entries
- **AND** static path tests prove the retired Entity and Agent files are absent

### Requirement: Existing observable behavior is preserved

The migration MUST preserve current Character Dialogue and Embody launch, route, cancel, exit, evidence safety, candidate confirmation, transcript artifact, evaluation and Webview projection behavior unless a fail-visible defect is explicitly corrected with a regression test.

#### Scenario: Existing focused tests are moved

- **WHEN** Character implementation moves to Chara
- **THEN** its existing deterministic tests move with the owning module and continue to pass
- **AND** Agent host tests verify composition through the Chara entry rather than mocking a legacy controller

### Requirement: Agent Evaluation status remains explicit

The change MUST record a `create` decision for target-scoped Character role-session Evaluation. If the canonical TUI lacks CharacterRun input and observability, real execution MUST be reported blocked and MUST NOT be replaced by direct session injection, mock responder output or final-text matching.

#### Scenario: Evaluation infrastructure cannot start roleplay

- **WHEN** the key-free harness passes but no canonical TUI Character role-session operation exists
- **THEN** verification records the exact input/observability blocker
- **AND** it does not claim provider-backed Character behavior acceptance

## MODIFIED Requirements

### Requirement: Character and World reuse one Agent canonical path

Character roleplay and Embody behavior MUST be owned by `@neko/chara` while using the existing configured Agent purpose-model/Pi runtime through injected public ports. The implementation MUST NOT create a second generic Agent loop, provider adapter, Tool protocol or Task runtime.

#### Scenario: Chara requires model reasoning

- **WHEN** Character Dialogue or Embody needs a model response
- **THEN** Chara invokes the Host-injected purpose-model contract backed by the existing Agent runtime
- **AND** Chara does not construct a provider client or AgentSession implementation
