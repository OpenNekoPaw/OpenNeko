## MODIFIED Requirements

### Requirement: Host produces one authoritative grouped navigation projection

The Host Shell service SHALL combine the complete Project catalog, the existing Desktop stored recent Project context and the owner-qualified Agent Conversation catalog into one grouped navigation projection. Renderer MUST consume that projection and MUST NOT independently infer grouping from current, first or recent Project state. The projection SHALL contain Conversation-owning groups and exact recent Project groups, while omitting catalog-only Projects that have neither a Conversation nor a recent context identity.

#### Scenario: Project has multiple Workspace conversations

- **WHEN** several Conversations have a Workspace owner matching one exact Project
- **THEN** the Project appears once with those Conversations as ordered children
- **AND** the separate flat recent-Conversation section is absent

#### Scenario: Recent Project has no conversations

- **WHEN** a Desktop stored recent Project has no matching Conversation
- **THEN** it remains visible in PrimarySidebar with zero Conversation children
- **AND** no empty Conversation is created

#### Scenario: Catalog-only Project has no conversations

- **WHEN** a complete Project catalog record has no matching Conversation and no recent context identity
- **THEN** it remains available in Project Management but is absent from PrimarySidebar
- **AND** Renderer does not infer its visibility from catalog order or active state

#### Scenario: Workspace owner has no exact Project

- **WHEN** a Workspace Conversation resolves to zero or multiple Project catalog entries
- **THEN** Host projects an unavailable Workspace group with a visible identity diagnostic
- **AND** it does not attach the Conversation to another Project or fail unrelated navigation groups

#### Scenario: Group contains many conversations

- **WHEN** a navigation group exceeds the bounded initial child count
- **THEN** PrimarySidebar offers explicit expand/collapse behavior
- **AND** dynamic children do not resize or overlap window-level controls
