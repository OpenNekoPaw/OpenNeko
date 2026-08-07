## MODIFIED Requirements

### Requirement: Project catalog exposes batch removal

The Project catalog SHALL show a batch action bar while one or more Projects are selected and SHALL allow the user to confirm removal of the selected Project registrations while preserving conversations and Project files.

#### Scenario: User confirms batch removal

- **WHEN** the user invokes batch removal for selected Projects and confirms the operation
- **THEN** the Renderer sends the complete selected identity set through the canonical batch Project removal contract
- **AND** the next authoritative projection removes the selected Projects while retaining their conversations under exact unavailable Workspace groups

#### Scenario: User cancels batch removal

- **WHEN** the user cancels the removal confirmation
- **THEN** no mutation request is sent and the current selection remains unchanged

#### Scenario: User removes one Project from its row

- **WHEN** the user invokes the row removal action for one Project and confirms the operation
- **THEN** the Renderer sends that identity as a single-element collection through the same batch Project removal contract

### Requirement: Batch removal is strict and atomic at the Project state boundary

The Host SHALL accept only a non-empty collection of unique, non-empty Project identities, SHALL validate every identity before committing Project state, and SHALL remove the complete collection from the Project catalog and every Window projection in one state commit without invoking Agent conversation deletion.

#### Scenario: All requested Projects exist

- **WHEN** a batch removal request contains only Projects present in the persistent or explicitly retained Project catalog
- **THEN** the Host removes all requested catalog records and associated Tabs and Views across every Window in one committed projection
- **AND** every associated conversation remains in Agent authority

#### Scenario: Any requested Project does not exist

- **WHEN** any identity in a batch removal request is absent from the authoritative Project catalog
- **THEN** the Host returns a visible contract error and does not commit removal of any requested Project
- **AND** it does not invoke Agent conversation authority

#### Scenario: Removed Project delete API is received

- **WHEN** Desktop code attempts to use the removed `projects.delete` API or its old IPC channel
- **THEN** no handler, alias or fallback can return success

### Requirement: Batch removal does not delete Project files

Removing Projects from the Project catalog SHALL update local catalog, Workspace registration and Window references, and SHALL NOT delete Agent conversations, the Project directory, Project files, media or generated artifacts.

#### Scenario: User confirms removal

- **WHEN** the Host completes individual or batch Project removal
- **THEN** the selected Project groups are absent from the Project catalog and their retained Workspace conversations remain visibly unavailable
- **AND** no conversation or filesystem deletion operation is performed
