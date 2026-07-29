## ADDED Requirements

### Requirement: Desktop resource and Agent mention share confirmed Entity authority

Desktop Resource Browser and Agent mention search SHALL query the same project-scoped confirmed
Creative Entity authority and representation bindings. A candidate, deprecated Entity, malformed fact
or unavailable binding MUST NOT be projected as a confirmed mention through a fallback path.

#### Scenario: Search a confirmed Entity

- **WHEN** a confirmed Entity matches by canonical name, display name or alias
- **THEN** Resource Browser and Agent mention return the same stable Entity kind/id and active
  representation locator
- **AND** neither consumer infers identity from file name, thumbnail, active Project or label

#### Scenario: Candidate resembles a confirmed Entity

- **WHEN** semantic discovery produces an observed, suggested or ambiguous candidate without an
  explicit promotion decision
- **THEN** Resource Browser may show it in a clearly identified candidate/diagnostic group
- **AND** Agent confirmed mention search does not return it as an EntityRef

### Requirement: Desktop Entity projection exposes owner status and binding state

Desktop Entity rows SHALL project stable identity, kind, canonical/display name, aliases, status,
bounded semantic metadata and active representation/binding availability from Entity owner contracts.
They MUST NOT copy source bodies, cache paths or provider-private objects into renderer state.

#### Scenario: Entity has an active representation

- **WHEN** a confirmed Entity has one confirmed active representation binding
- **THEN** the row can display a thumbnail and preview/add capabilities backed by that ContentLocator
- **AND** moving or losing the referenced content changes binding availability rather than Entity
  identity

#### Scenario: Entity has no representation

- **WHEN** a confirmed Entity has no active representation
- **THEN** the row remains searchable and referenceable by Entity identity
- **AND** preview and add-to-Canvas remain unavailable with an explicit reason
