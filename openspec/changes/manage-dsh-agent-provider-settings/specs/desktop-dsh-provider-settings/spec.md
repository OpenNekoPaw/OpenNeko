## ADDED Requirements

### Requirement: DSH settings use the canonical provider authority

Provider, LLM model and default dialogue changes SHALL update the existing TOML ConfigManager authority consumed by DSH and SHALL NOT create a parallel model configuration file.

#### Scenario: Provider is added

- **WHEN** a valid supported Provider and LLM model are saved
- **THEN** they are present in canonical config and are materialized by DSH after restart

### Requirement: Provider credentials remain host-owned

The Renderer SHALL never read stored provider secrets. A submitted API key SHALL be handed to the existing credential authority and SHALL never appear in a projection or response.

#### Scenario: Settings are reopened

- **WHEN** a provider has a stored credential
- **THEN** the UI shows only configured status and not the credential value

### Requirement: Existing sessions are not silently reconfigured

Default dialogue changes SHALL apply to future conversations. Provider catalog changes requiring DSH rematerialization SHALL be explicitly marked as requiring restart.

#### Scenario: Provider is edited during a running conversation

- **WHEN** the provider structure is saved
- **THEN** the running conversation retains its exact session identity and current runtime

### Requirement: Model configuration uses progressive disclosure

The Agent settings surface SHALL show the Provider catalog directly without an additional Provider summary wrapper. Provider editing SHALL remain collapsed until the user selects a Provider. Models SHALL be managed within their owning Provider editor, and default model selection SHALL be part of that Provider's configured model catalog rather than a separate settings block.

#### Scenario: Agent settings are opened

- **WHEN** the Agent settings category becomes visible
- **THEN** the capability-grouped Provider catalog and add action are directly visible without an outer Provider summary, accordion or management card
- **AND** no Provider editor is shown until the user selects or adds a Provider
- **AND** the canonical Agent configuration action is shown beside the Agent heading
- **AND** no separate advanced-settings content row is shown
- **AND** no separate default-model selectors are shown
- **AND** no parallel model-catalog management summary is shown

#### Scenario: Providers are grouped by configured capability

- **WHEN** the Agent settings category becomes visible
- **THEN** providers with only dialogue models and providers with only generation models are shown in separate side-by-side groups when space permits
- **AND** the groups use a single-column layout in narrow containers
- **AND** a Provider with both dialogue and generation models is shown once in a multi-capability group
- **AND** a Provider without configured models remains visible in an unconfigured group
- **AND** Provider grouping is derived from the canonical model catalog rather than a parallel Provider type

#### Scenario: Provider configuration is managed

- **WHEN** the user selects a configured Provider
- **THEN** its credential, endpoint, protocol and model catalog are edited in one scoped panel
- **AND** advanced Provider fields remain collapsed until explicitly requested

#### Scenario: Configured models are managed

- **WHEN** the user edits a configured Provider
- **THEN** configured models are grouped into dialogue and generation models
- **AND** the two groups use a side-by-side layout when space permits and a single-column layout in narrow containers
- **AND** the current default for each model type is marked on the corresponding model card
- **AND** another enabled model of the same type can be made default from its card

#### Scenario: A custom Provider is created

- **WHEN** the user chooses to add a custom Provider
- **THEN** Provider identity, display name, API endpoint, protocol and credential fields are shown as one focused form
- **AND** model configuration becomes available from the saved Provider editor without creating a second configuration authority

### Requirement: Locality and capability remain independent

The settings projection SHALL identify local Providers from canonical connection metadata while Provider capability grouping SHALL remain derived exclusively from configured model types.

#### Scenario: A local Ollama dialogue model is configured

- **WHEN** an enabled Ollama Provider owns an enabled LLM model
- **THEN** the Provider is shown in the dialogue group with a local-source indicator
- **AND** it is not duplicated in a separate local capability group
- **AND** DSH materializes it through the Provider's OpenAI-compatible local execution endpoint without requiring an API key

#### Scenario: A generation model is configured

- **WHEN** a Provider owns an image, video or audio model
- **THEN** that Provider is classified as generation-capable regardless of whether its connection source is local or remote

### Requirement: Provider and model removal is explicit and reference-safe

The Host model-settings owner SHALL support exact config-backed Provider and model removal without silently cascading models, changing defaults or selecting a fallback Provider. A Provider metadata field SHALL NOT create a second builtin catalog or make a `~/.neko/config.toml` record undeletable.

#### Scenario: A non-default model is deleted

- **WHEN** the user confirms deletion of a model that is not referenced by any default
- **THEN** only that exact model is removed from canonical config
- **AND** DSH rematerialization is marked as required

#### Scenario: A referenced model is deleted

- **WHEN** the requested model is a configured default
- **THEN** the request is rejected with a visible local diagnostic
- **AND** the model and default reference remain unchanged

#### Scenario: A configured Provider is deleted

- **WHEN** the user confirms deletion of a config-backed Provider with no configured models
- **THEN** only that Provider and its exact credential are removed
- **AND** sibling Providers and models remain available

#### Scenario: Provider deletion is unsafe

- **WHEN** the requested Provider still owns configured models
- **THEN** the request is rejected with a visible local diagnostic
- **AND** no model, default or Provider is silently changed
