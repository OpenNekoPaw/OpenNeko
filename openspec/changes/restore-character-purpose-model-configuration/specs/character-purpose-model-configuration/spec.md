## ADDED Requirements

### Requirement: Character operations require explicit purpose bindings

Character Dialogue and Embody Character MUST resolve `character.dialogue` and
`character.profile` from independent explicit flat purpose bindings before model-backed work. They MUST
NOT infer either binding from the active Agent conversation, `agent.main`, `default_models.llm`, catalog
order or a legacy chat adapter.

#### Scenario: Existing explicit bindings are ready
- **WHEN** both Character purpose bindings reference available compatible models
- **THEN** the role session proceeds through the existing Chara semantic port and exact Pi purpose runtime
- **AND** no configuration prompt or fallback model participates

#### Scenario: A binding is absent
- **WHEN** a role session requires a Character purpose whose explicit binding is missing
- **THEN** model readiness is unresolved until the user explicitly selects a compatible model
- **AND** the responder is not invoked through another purpose or model

### Requirement: Missing Character bindings have an explicit Host setup flow

The VS Code Host MUST list selectable compatible LLM models from the canonical Platform catalog when one
or more Character purpose bindings are missing. A confirmed selection MUST bind only the missing
`character.dialogue` and `character.profile` entries and MUST preserve existing entries.

#### Scenario: Configure a fresh roleplay installation
- **WHEN** neither Character purpose is bound and the user selects one compatible model
- **THEN** the Host atomically persists that exact provider/model under both independent purpose keys
- **AND** the role session uses the persisted `character.dialogue` binding

#### Scenario: Preserve an existing profile binding
- **WHEN** `character.profile` is already bound but `character.dialogue` is missing
- **THEN** the confirmed model is written only to `character.dialogue`
- **AND** the existing `character.profile` binding remains unchanged

#### Scenario: Cancel setup
- **WHEN** the user cancels model selection
- **THEN** role session launch or continuation fails visibly without creating model output
- **AND** no config entry, session fallback or ordinary Agent turn is created

### Requirement: Purpose binding persistence validates before writing

Platform MUST reject unknown purposes and provider/model selections that are missing, disabled,
provider-mismatched or capability-incompatible before changing the user configuration. Valid updates MUST
merge and persist atomically through the canonical user config manager.

#### Scenario: Reject an incompatible model
- **WHEN** the Host attempts to bind `character.dialogue` to a model without a compatible chat capability
- **THEN** Platform returns an explicit validation error
- **AND** the existing purpose map is not modified

#### Scenario: Persist valid missing bindings
- **WHEN** all requested purpose/model pairs are valid
- **THEN** Platform performs one config persistence operation and reloads the effective snapshot
- **AND** later purpose resolution returns the exact persisted refs

### Requirement: Character session state is gated by model readiness

Chara Host controllers MUST await their injected model-readiness port before creating a new role session
and before routing a message to an existing role session. A failed readiness check MUST use the existing
visible error projection and MUST NOT mutate the transcript or call the responder.

#### Scenario: Launch without a completed binding
- **WHEN** model preparation is cancelled or fails during Character Dialogue launch
- **THEN** no Character session or tab is created
- **AND** the failure is projected visibly

#### Scenario: Repair an already-open session
- **WHEN** an existing Character session routes a message after its binding was removed
- **THEN** readiness runs before transcript mutation or responder execution
- **AND** a confirmed new binding allows the same canonical session path to continue
