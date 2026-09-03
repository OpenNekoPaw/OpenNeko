# dsh-text-file-authoring Specification

## Purpose

Define DSH-native portable text-file authoring under exact Session Workspace, sandbox and structured-project ownership boundaries.

## Requirements

### Requirement: DSH is the sole Agent authority for portable Workspace text files

The product SHALL expose DSH-native `read`, `write` and `edit` operations for Markdown, Fountain, TXT, HTML, subtitles and ordinary JSON/YAML/CSV in a Workspace or authoring Session. Successful creation and revision SHALL be committed by the DSH filesystem Tool under the exact Session cwd and SHALL NOT be repeated by an OpenNeko Host writer.

#### Scenario: Agent creates a requested Markdown document

- **WHEN** a user explicitly requests a durable Markdown document in a Workspace Session running with write permission
- **THEN** the Agent creates the file through the DSH `write` Tool under that Session's Workspace
- **AND** the final assistant response reports the already-created file without carrying bytes for a second publication step

#### Scenario: Agent revises an existing text document

- **WHEN** the Agent must update an existing supported text file
- **THEN** it reads the current file and applies the revision through the DSH `write` or `edit` contract
- **AND** stale or unobserved content fails visibly instead of overwriting a newer user edit

#### Scenario: Agent returns an ordinary answer

- **WHEN** the user requests information but does not request a durable text artifact
- **THEN** the final response remains ordinary Conversation Markdown
- **AND** no marker parser, terminal publisher or implicit Workspace write runs

### Requirement: Native text access remains confined to the exact Session Workspace

Every DSH-native text-file request SHALL resolve its model-controlled path against the immutable cwd of the exact calling Session. Read, write and edit SHALL fail locally when the canonical target escapes that Workspace, and write or edit SHALL additionally obey the effective DSH sandbox mode.

#### Scenario: Workspace-write Session creates a contained file

- **WHEN** a `workspace-write` Session requests a supported text-file mutation whose canonical target is inside its exact cwd
- **THEN** DSH performs the mutation through its sandboxed filesystem and observation policy
- **AND** no active, recent or process-level Workspace participates

#### Scenario: Read-only Session requests a mutation

- **WHEN** a `read-only` Session invokes DSH `write` or `edit`
- **THEN** the exact Tool call fails without modifying any file
- **AND** unrelated files, Sessions and Workspaces remain available

#### Scenario: Model supplies an escaping path

- **WHEN** a native read, write or edit target resolves outside the exact Session Workspace through an absolute path, traversal or symbolic link
- **THEN** the exact Tool call is denied before file content is read or modified
- **AND** approval or a wider sandbox mode does not convert the target into a Workspace file

### Requirement: Protected and non-text formats retain their owning capabilities

The generic DSH filesystem Tool SHALL reject Canvas `.nkc`, Cut `.otio` and every other owner-declared protected structured project format for read, write and edit. Images, packaged documents, archives, media and binary outputs SHALL continue through their existing Content, Media, Generation or domain capabilities.

#### Scenario: Agent attempts raw Canvas mutation

- **WHEN** the Agent invokes native `read`, `write` or `edit` for an `.nkc` target
- **THEN** the Tool call fails with a protected-format diagnostic
- **AND** Canvas state can be queried or changed only through the Canvas capability

#### Scenario: Agent attempts raw Cut mutation

- **WHEN** the Agent invokes native `read`, `write` or `edit` for an `.otio` target
- **THEN** the Tool call fails with a protected-format diagnostic
- **AND** Cut state can be queried or changed only through the Cut capability

#### Scenario: Agent needs a packaged or binary document

- **WHEN** the requested source or output is not a supported UTF-8 text file
- **THEN** the Agent uses the owning reader, exporter or generation capability
- **AND** generic filesystem failure does not fall back to raw binary mutation
