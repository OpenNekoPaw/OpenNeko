## MODIFIED Requirements

### Requirement: DSH settings use the canonical provider authority

Provider, model and default changes SHALL update the existing TOML ConfigManager authority consumed by DSH and SHALL NOT create a parallel model configuration file. Provider and model directory changes SHALL locally refresh the DSH runtime from that authority without restarting the Desktop application.

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
