## ADDED Requirements

### Requirement: Canvas owns its generation model catalog projection

`@neko/canvas-domain` SHALL project enabled model and provider facts into purpose-qualified Canvas
generation model options, including canonical defaults and deterministic ordering.

#### Scenario: Desktop composes the Canvas catalog

- **WHEN** Desktop supplies enabled configuration facts and the Host purpose-support predicate
- **THEN** Canvas produces the existing secret-free model option projection
- **AND** Desktop does not implement Canvas purpose mapping or ordering.

#### Scenario: Replaced Desktop path is absent

- **WHEN** repository path checks run
- **THEN** the former Desktop catalog implementation and test do not exist.
