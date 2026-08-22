## MODIFIED Requirements

### Requirement: Agent configuration authorities are separated

UI-managed runtime selections SHALL use an Agent-owned stable state repository. User-editable
provider/model/MCP definitions SHALL use the product configuration owner or explicit local export.
An explicitly authored provider `api_key` SHALL remain owned by the product configuration document and
MUST be consumed only through a Host-only credential port. Credentials entered through protected UI
interaction SHALL remain in SecretStorage/keychain. Each provider SHALL select one explicit credential
owner; an invalid declared source MUST fail closed without reading another source. No migration, dual
write, environment fallback or product legacy import path may combine these authorities.

#### Scenario: Agent configuration is loaded

- **WHEN** Agent starts with canonical configuration
- **THEN** each field and provider credential is read from its exact owner
- **AND** missing or invalid configuration fails with an owner-qualified local diagnostic
- **AND** valid sibling providers, models and bindings remain available

#### Scenario: Inline provider credential is invalid

- **WHEN** a provider explicitly declares an invalid `api_key`
- **THEN** Agent reports that provider's config credential source as invalid
- **AND** it does not read SecretStorage or an environment variable for that provider
