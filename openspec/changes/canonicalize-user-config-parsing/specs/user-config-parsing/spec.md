## ADDED Requirements

### Requirement: Unknown user configuration fields are inert

The canonical user TOML reader SHALL ignore unsupported fields at every nesting level. Unsupported
fields MUST NOT produce a blocking or local diagnostic, enter runtime configuration, select a parser,
be exported, or participate in a fallback path.

#### Scenario: Internal version field remains in an existing file

- **WHEN** a valid user config also contains `version` or another unsupported field
- **THEN** all valid canonical fields are loaded normally
- **AND** the unsupported field has no runtime or diagnostic projection

#### Scenario: Unsupported provider option is adjacent to canonical fields

- **WHEN** one provider record contains a canonical identity, endpoint and an unsupported field
- **THEN** the provider loads from canonical fields
- **AND** the unsupported field is discarded without invalidating the provider or its siblings

### Requirement: Known invalid configuration fails at its local owner

The user config owner SHALL decode known fields and records independently. A known invalid field MUST
produce an exact owner-qualified diagnostic and invalidate only that field, record or binding. Valid
siblings MUST remain usable and visible. Only unreadable input or malformed TOML syntax MAY block the
whole document.

#### Scenario: One provider has an invalid protocol profile

- **WHEN** a valid provider and model exist beside a provider with an invalid `protocol_profile`
- **THEN** the invalid provider is reported with its identity and exact field
- **AND** the valid provider and model remain selectable and usable

#### Scenario: One default binding is invalid

- **WHEN** one default binding references an unavailable record and another binding is valid
- **THEN** only the invalid binding reports an unavailable diagnostic
- **AND** valid records and bindings remain available

#### Scenario: TOML syntax is malformed

- **WHEN** the TOML parser cannot establish a document structure
- **THEN** the complete document reports a blocking syntax diagnostic
- **AND** the runtime does not fabricate an empty successful configuration

### Requirement: Canonical configuration has one field path

The user config owner SHALL use `api_url` for provider endpoints and `protocol_profile` for provider and
model protocol selection. It MUST NOT implement aliases, override maps, retired locale fields, legacy
model protocol fields, dual reads, dual writes, or compatibility fallback.

#### Scenario: Removed alias remains in a prelaunch config

- **WHEN** a document contains `base_url`, model `protocol`, a `*_overrides` map, `ui_locale`, or
  `prompt_locale`
- **THEN** the field is treated as unsupported and inert
- **AND** only canonical fields determine the runtime result

### Requirement: Provider API keys use a secret-only parse channel

The user config owner SHALL accept a non-empty provider `api_key` and project it only through a
Host-only credential snapshot keyed by exact provider identity. Secret bytes MUST NOT enter ordinary
provider/model configuration, diagnostics, logs, renderer messages, or portable exports.

#### Scenario: Provider declares a valid API key

- **WHEN** a valid provider contains a non-empty `api_key`
- **THEN** its secret-only credential snapshot contains that provider credential
- **AND** all ordinary and portable configuration projections remain secret-free

#### Scenario: Provider declares an invalid API key

- **WHEN** a provider contains an empty or non-string `api_key`
- **THEN** that provider receives an owner-qualified credential diagnostic
- **AND** the secret value is never included in the diagnostic

### Requirement: Structured config writes preserve only canonical valuable data

An explicit structured config write SHALL preserve valid provider API keys through the Host-only
document contract while emitting only canonical supported fields. Startup MUST NOT rewrite, migrate,
delete or repair the source file.

#### Scenario: A non-secret setting is updated

- **WHEN** a user updates a canonical non-secret setting in a document containing valid provider keys
- **THEN** the writer preserves each key under its exact provider identity
- **AND** unknown, retired, alias and override fields are not emitted
