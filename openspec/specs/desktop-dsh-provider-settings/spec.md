# desktop-dsh-provider-settings Specification

## Purpose

Define the canonical host-owned DSH Provider, model, credential, removal and runtime-refresh settings path.

## Requirements

### Requirement: Dialogue Provider capabilities come from the running DSH composition

The isolated DSH subprocess SHALL expose a bounded, secret-free projection of its public configurable-Provider directory and supported dialogue profile protocols. Desktop settings SHALL derive dialogue Provider and protocol choices from that projection and SHALL NOT use a product-owned Provider or protocol whitelist to remove a capability advertised by the current pinned DSH runtime.

#### Scenario: DSH advertises an unknown catalog Provider or protocol

- **WHEN** the connected DSH runtime advertises a configurable Provider or protocol identity unknown to OpenNeko presentation metadata
- **THEN** Desktop settings expose the DSH identity without requiring a Renderer or Host whitelist update
- **AND** optional OpenNeko metadata may refine presentation without hiding the capability

#### Scenario: One DSH capability entry is malformed

- **WHEN** one Provider or protocol capability entry cannot be decoded while sibling entries are valid
- **THEN** only that entry is rejected with a visible diagnostic
- **AND** valid sibling capabilities and existing OpenNeko settings remain usable

### Requirement: DSH settings use the canonical provider authority

Provider, model and default changes SHALL update the existing OpenNeko TOML ConfigManager authority consumed by DSH and SHALL NOT create a parallel model configuration file. Provider secrets SHALL remain in the Host credential authority. Provider and model directory changes SHALL locally refresh the DSH runtime from that authority without restarting the Desktop application.

#### Scenario: A DSH-advertised Provider is configured

- **WHEN** the user saves a Provider selected from the current DSH capability projection
- **THEN** its non-secret configuration is written to `~/.neko/config.toml`
- **AND** its credential is stored only through the Host credential authority
- **AND** a new DSH runtime instance is materialized from those OpenNeko authorities

#### Scenario: A selected capability is no longer advertised

- **WHEN** the user attempts to save a Provider or protocol absent from the current connected DSH projection
- **THEN** the mutation is rejected before changing OpenNeko configuration
- **AND** no stale catalog or alternate Provider or protocol is used as fallback success

#### Scenario: DSH capability discovery is unavailable

- **WHEN** the DSH runtime cannot provide its capability projection
- **THEN** capability-dependent dialogue Provider creation is visibly unavailable
- **AND** existing Provider records remain inspectable and removable
- **AND** unrelated settings remain usable

#### Scenario: Provider is added while DSH is idle

- **WHEN** a valid Provider and model are saved and no DSH turn is running
- **THEN** they are present in canonical config
- **AND** DSH rematerializes its profile, credential environment, subprocess and execution catalog before the mutation reports `applied`
- **AND** a newly created conversation can use the updated catalog without restarting OpenNeko

#### Scenario: Provider is added while a turn is running

- **WHEN** a valid Provider or model is saved while a DSH turn is active
- **THEN** the running turn retains its exact runtime and session identity
- **AND** the refresh reports `pending`
- **AND** new DSH work is rejected rather than using the stale catalog
- **AND** the latest canonical configuration is applied automatically after the active turn ends

### Requirement: Provider credentials remain host-owned

The Renderer SHALL never read stored provider secrets. A submitted API key SHALL be handed to the existing credential authority and SHALL never appear in a projection or response.

#### Scenario: Settings are reopened

- **WHEN** a provider has a stored credential
- **THEN** the UI shows only configured status and not the credential value

### Requirement: Existing sessions are not silently reconfigured

Default dialogue changes SHALL refresh the execution configuration used by future conversations. Provider catalog and default changes SHALL replace only the ephemeral DSH runtime generation and SHALL preserve existing Conversation records, DSH session identities, bindings and transcripts.

#### Scenario: Runtime is refreshed after a Provider edit

- **WHEN** a Provider structure change is applied
- **THEN** the Desktop application remains running
- **AND** existing durable conversations remain addressable by the same exact identities
- **AND** future conversations use the rematerialized execution catalog

#### Scenario: Runtime refresh fails

- **WHEN** the updated profile or ACP subprocess cannot be started
- **THEN** DSH becomes locally unavailable with a visible diagnostic
- **AND** the previous Provider catalog is not advertised as a fallback
- **AND** unrelated projects, assets and settings remain usable

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
