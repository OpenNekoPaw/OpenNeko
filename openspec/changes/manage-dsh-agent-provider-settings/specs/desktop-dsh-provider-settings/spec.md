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
