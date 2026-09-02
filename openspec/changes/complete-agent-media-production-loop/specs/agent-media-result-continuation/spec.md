## ADDED Requirements

### Requirement: A Markdown shot row binds only a creator-chosen result

An ordinary scene and shot plan SHALL remain one editable Markdown table with local row labels. A stable generated-media reference SHALL be written into a shot row only after the creator explicitly chooses that candidate for downstream use.

#### Scenario: Candidate is only being previewed

- **WHEN** Canvas displays or highlights one Generation candidate without an explicit creator choice
- **THEN** the corresponding `SHxx` row remains unchanged
- **AND** Cut and delivery do not consume that candidate as an adopted result

#### Scenario: Creator chooses one candidate

- **WHEN** the creator explicitly chooses a committed Generation output for one unambiguous `SHxx` row
- **THEN** the Agent updates that existing row with the stable Workspace media reference
- **AND** later work reuses the updated row instead of creating a parallel shot table or approval object

#### Scenario: Shot row cannot be resolved

- **WHEN** the target `SHxx` row is missing, duplicated or changed incompatibly
- **THEN** only the result-binding operation fails visibly
- **AND** the Generation output, document and sibling shot rows remain unchanged
