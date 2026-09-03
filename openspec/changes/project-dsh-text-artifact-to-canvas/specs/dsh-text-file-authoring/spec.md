## MODIFIED Requirements

### Requirement: DSH is the sole Agent authority for portable Workspace text files

The product SHALL expose DSH-native `read`, `write` and `edit` operations for Markdown, Fountain, TXT, HTML, subtitles and ordinary JSON/YAML/CSV in a Workspace or authoring Session. Successful creation and revision SHALL be committed by the DSH filesystem Tool under the exact Session cwd and SHALL NOT be repeated by an OpenNeko Host writer. A named, reusable and substantially complete analysis, plan, specification, copy draft or other creator-reviewable document SHALL be treated as a durable portable text request even when the user does not literally say to save or write a file.

#### Scenario: Agent creates a requested Markdown document

- **WHEN** a user requests a named, reusable and substantially complete creator-reviewable Markdown document in a Workspace Session running with write permission
- **THEN** the Agent creates the file through the DSH `write` Tool under that Session's Workspace
- **AND** the final assistant response contains a concise Agent summary, the already-created Workspace-relative document reference and at most one state-grounded recommended operation without carrying the document bytes

#### Scenario: Agent revises an existing text document

- **WHEN** the Agent must update an existing supported text file
- **THEN** it reads the current file and applies the revision through the DSH `write` or `edit` contract
- **AND** stale or unobserved content fails visibly instead of overwriting a newer user edit

#### Scenario: Agent returns an ordinary answer

- **WHEN** the user requests information but does not request a durable text artifact
- **THEN** the final response remains ordinary Conversation Markdown
- **AND** no marker parser, terminal publisher or implicit Workspace write runs

#### Scenario: Durable document creation is unavailable

- **WHEN** a Workspace request requires a durable text document but the native filesystem Tool is unavailable or its write fails
- **THEN** the Agent reports the exact blocker
- **AND** the complete document body is not returned as a persistence fallback or presented as a successfully generated document

## ADDED Requirements

### Requirement: Successful DSH text writes project one Canvas document reference

An exact completed DSH `write` Tool event for a normalized Workspace-relative portable text path SHALL project that verified Workspace `ContentLocator` to the Canvas target admitted for the same turn. Canvas SHALL persist only a reference node and delivery provenance; it SHALL NOT receive document bytes or invoke another file writer.

#### Scenario: Written Markdown appears on the current Canvas

- **WHEN** DSH successfully writes an admitted Markdown document in a Workspace-bound turn with an exact Canvas target
- **THEN** the Content owner verifies the written Workspace locator
- **AND** Canvas creates one output reference node for that locator
- **AND** replaying the same completed Tool event does not create another node

#### Scenario: Write fails before persistence

- **WHEN** the native `write` Tool is denied, fails or does not complete
- **THEN** no Canvas document reference is projected
- **AND** no Host writer or terminal response parser attempts an alternative write

#### Scenario: Written locator cannot be projected

- **WHEN** DSH has created the document but Content verification or exact Canvas mutation fails
- **THEN** the durable Workspace file remains unchanged
- **AND** the affected Canvas delivery reports a visible local diagnostic without creating a fabricated reference or disturbing sibling Workspace content
