## ADDED Requirements

### Requirement: Dialogue Provider capabilities come from the running DSH composition

The isolated DSH subprocess SHALL expose a bounded, secret-free projection of its public configurable-Provider directory and supported dialogue profile protocols. Desktop settings SHALL derive dialogue Provider and protocol choices from that projection and SHALL NOT use a product-owned Provider or protocol whitelist to remove a capability advertised by the current pinned DSH runtime.

#### Scenario: DSH advertises a catalog Provider unknown to OpenNeko presentation metadata

- **WHEN** the connected DSH runtime advertises a configurable dialogue Provider that has no OpenNeko preset
- **THEN** Desktop settings expose that Provider using the DSH identity and display name
- **AND** the user can supply the OpenNeko-owned endpoint, credential and model configuration required to activate it

#### Scenario: DSH advertises a new supported protocol

- **WHEN** the connected DSH runtime includes a protocol identity not known by the previous OpenNeko build
- **THEN** the protocol remains available as an opaque DSH capability identity
- **AND** selecting it does not require adding the identity to a Renderer or Host whitelist

#### Scenario: One DSH capability entry is malformed

- **WHEN** one Provider capability entry cannot be decoded while sibling entries are valid
- **THEN** only that entry is rejected with a visible diagnostic
- **AND** valid sibling Providers and existing OpenNeko settings remain usable

### Requirement: OpenNeko configuration remains the user Provider authority

Provider, model and default selections made from the DSH capability projection SHALL be stored only in the canonical OpenNeko TOML configuration. Provider secrets SHALL remain in the Host credential authority, and neither the capability projection nor Renderer SHALL receive secret values. DSH settings storage SHALL NOT become a parallel product configuration path.

#### Scenario: A DSH-advertised Provider is configured

- **WHEN** the user saves a Provider and model selected from the current DSH capability projection
- **THEN** the Provider, model and applicable default references are written to `~/.neko/config.toml`
- **AND** the credential is stored only through the Host credential authority
- **AND** a new DSH runtime instance is materialized from that canonical OpenNeko configuration

#### Scenario: A selected capability is no longer advertised

- **WHEN** the user attempts to save a Provider or protocol that is absent from the current connected DSH capability projection
- **THEN** the mutation is rejected before changing OpenNeko configuration
- **AND** no alternate Provider, protocol or stale capability catalog is used as fallback success

#### Scenario: DSH capability discovery is unavailable

- **WHEN** the DSH runtime cannot provide its capability projection
- **THEN** creation of a capability-dependent dialogue Provider is visibly unavailable
- **AND** existing OpenNeko Provider records remain inspectable and removable
- **AND** unrelated settings and product capabilities remain usable
