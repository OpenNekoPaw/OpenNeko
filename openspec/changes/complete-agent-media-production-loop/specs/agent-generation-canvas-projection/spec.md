## ADDED Requirements

### Requirement: Canvas candidate focus is not downstream adoption

Canvas SHALL keep Generation candidates and may project one candidate as the current preview, but that presentation choice MUST NOT become a creator-adopted shot result, Cut input or delivery fact without an explicit creator action and a successful owning authoring operation.

#### Scenario: Latest candidate becomes visible

- **WHEN** a succeeded Generation snapshot adds a new committed output and Canvas displays it
- **THEN** the Generation node retains the stable output binding and current preview
- **AND** no Markdown shot row or Cut document is modified

#### Scenario: Creator adopts the visible candidate

- **WHEN** the creator explicitly chooses the visible committed output for a resolvable shot row
- **THEN** the owning Markdown authoring operation records its stable Workspace reference
- **AND** Canvas remains a projection of Generation candidates rather than an approval authority
