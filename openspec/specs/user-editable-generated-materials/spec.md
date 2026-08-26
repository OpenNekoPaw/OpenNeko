# user-editable-generated-materials Specification

## Purpose

Define one durable file authority for generated materials, create-only automatic publication, and explicit user editing without Generation or Canvas rewriting published content.

## Requirements

### Requirement: Generated materials have one file authority

Every successful generated material SHALL be represented by one durable file locator. Canvas and other consumers MUST reference that locator and MUST NOT persist a second editable copy of the generated content.

#### Scenario: Generated Markdown is projected to Canvas

- **WHEN** a Prompt Generation Job publishes a Markdown result and binds it to a Canvas node
- **THEN** the node persists the exact file locator and Generation provenance
- **AND** its displayed text and downstream text input are read from that file

### Requirement: Automatic publication never updates an existing material

Generation SHALL publish each result exactly once with a create-only operation. If the exact target already exists, the current Job MUST fail locally and MUST NOT compare, reuse, rename or overwrite the existing file.

#### Scenario: A generated target already exists

- **WHEN** result publication reaches an existing target path
- **THEN** the current Generation Job fails with a visible conflict
- **AND** the existing bytes remain unchanged

#### Scenario: User regenerates a material

- **WHEN** the user requests generation again after an earlier result was published or edited
- **THEN** Generation creates a new Job and output locator
- **AND** the earlier material remains unchanged

### Requirement: Explicit user editing remains available

The product SHALL allow a user to open and save a supported generated file through the canonical application editor. That explicit editor operation MUST update the referenced file without granting Generation, Canvas projection or recovery logic authority to update it.

#### Scenario: User edits generated Markdown in the application

- **WHEN** the user explicitly opens a generated Markdown file, changes it and saves
- **THEN** the Text Editor writes the user's content to the same authorized locator
- **AND** consumers read that updated file content on their next read
