## MODIFIED Requirements

### Requirement: Host produces one authoritative grouped navigation projection

The Host Shell service SHALL combine the Project catalog and owner-qualified Agent conversation catalog into one grouped navigation projection. Renderer MUST consume that projection and MUST NOT independently infer grouping from current, first or recent Project state. The projection SHALL contain only groups with conversation children.

#### Scenario: Project has multiple Workspace conversations

- **WHEN** several conversations have a Workspace owner matching one exact Project
- **THEN** the Project appears once with those conversations as ordered children
- **AND** the separate flat recent-conversation section is absent

#### Scenario: Project has no conversations

- **WHEN** a stored Project has no matching conversation
- **THEN** it remains in the Project catalog but is absent from PrimarySidebar conversation navigation
- **AND** no empty conversation is created

#### Scenario: Workspace owner has no exact Project

- **WHEN** a Workspace conversation resolves to zero or multiple Project catalog entries
- **THEN** Host projects an unavailable Workspace group with a visible identity diagnostic
- **AND** it does not attach the conversation to another Project or fail unrelated navigation groups

#### Scenario: Group contains many conversations

- **WHEN** a navigation group exceeds the bounded initial child count
- **THEN** PrimarySidebar offers explicit expand/collapse behavior
- **AND** dynamic children do not resize or overlap window-level controls

### Requirement: Lifecycle operations validate exact conversation and owner identity

Delete, restore and future association operations SHALL carry exact conversation identity, owner identity and applicable revision fences. Host SHALL compare them with the authoritative projection before delegating and MUST NOT require a Project identity for standalone owners. Project removal SHALL NOT act as a conversation lifecycle operation.

#### Scenario: Assistant conversation is deleted

- **WHEN** the user confirms deletion of an exact Assistant conversation with current revisions
- **THEN** Host validates its Assistant owner and delegates canonical Agent lifecycle/Pi deletion
- **AND** no Project record is required

#### Scenario: Owner identity is stale or mismatched

- **WHEN** an operation supplies the right `conversationId` but the wrong owner identity
- **THEN** Host rejects the operation visibly
- **AND** neither transcript nor grouping metadata is modified

#### Scenario: Project is removed while conversations remain

- **WHEN** a Project is removed while Workspace, Assistant, Character or Room conversations remain
- **THEN** the Project catalog operation does not delete those conversations
- **AND** Workspace conversations remain under an unavailable Workspace group
- **AND** standalone-owner conversations remain accessible under their exact owner grouping
