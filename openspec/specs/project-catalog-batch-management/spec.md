# project-catalog-batch-management Specification

## Purpose
TBD - created by archiving change add-project-catalog-batch-actions. Update Purpose after archive.
## Requirements
### Requirement: Project catalog supports local multi-selection

The Project catalog SHALL maintain page-local selection independently from the active Project and SHALL support ordinary single selection, modifier-key toggle selection, contiguous range selection, selecting all currently filtered Projects, and clearing the selection.

#### Scenario: User selects a range in the current catalog order

- **WHEN** the user selects one Project and shift-selects another visible Project
- **THEN** the catalog selects the contiguous range between the selection anchor and the target using the current filtered and sorted order

#### Scenario: User selects all filtered Projects

- **WHEN** the Project catalog has focus and the user invokes the platform select-all shortcut outside an input control
- **THEN** every Project in the current filtered result becomes selected without selecting hidden Projects

#### Scenario: Catalog data changes

- **WHEN** a selected Project is no longer present in the authoritative catalog projection
- **THEN** the catalog removes that identity from its local selection without changing the active Project identity

### Requirement: Project catalog exposes batch removal

The Project catalog SHALL show a batch action bar while one or more Projects are selected and SHALL allow the user to confirm deletion of the selected Project registrations and their authoritative conversation groups.

#### Scenario: User confirms batch removal

- **WHEN** the user invokes batch removal for selected Projects and confirms the operation
- **THEN** the Renderer sends the complete selected identity set through the canonical batch Project delete contract
- **AND** the next authoritative projection removes the selected Projects and their deleted conversation groups

#### Scenario: User cancels batch removal

- **WHEN** the user cancels the deletion confirmation
- **THEN** no mutation request is sent and the current selection remains unchanged

#### Scenario: User removes one Project from its row

- **WHEN** the user invokes the row deletion action for one Project and confirms the operation
- **THEN** the Renderer sends that identity as a single-element collection through the same batch Project delete contract

### Requirement: Batch removal is strict and atomic at the Project state boundary

The Host SHALL accept only a non-empty collection of unique, non-empty Project identities, SHALL validate every identity before committing Project state, SHALL remove the complete collection from the Project catalog and every Window projection in one state commit, and SHALL delete only conversations captured from those Projects' authoritative navigation groups.

#### Scenario: All requested Projects exist

- **WHEN** a batch deletion request contains only Projects present in the persistent or explicitly retained Project catalog
- **THEN** the Host removes all requested catalog records and associated Tabs and Views across every Window in one committed projection
- **AND** it deletes each conversation captured from those exact Project groups through Agent conversation authority

#### Scenario: Any requested Project does not exist

- **WHEN** any identity in a batch deletion request is absent from the authoritative Project catalog
- **THEN** the Host returns a visible contract error and does not commit removal of any requested Project or conversation

#### Scenario: Conversation deletion fails after Project commit

- **WHEN** Agent conversation authority cannot delete one of the captured conversations after Project state was committed
- **THEN** the operation fails visibly and does not report deletion success
- **AND** each remaining conversation stays visible as an item-local unavailable Workspace conversation for explicit user handling

#### Scenario: Removed project API is received

- **WHEN** Desktop code attempts to use the removed `removeRecent` project API or its old IPC channel
- **THEN** no handler, alias, or fallback can return success

### Requirement: Unavailable Projects remain manageable without becoming openable

The Project catalog SHALL keep unavailable Project records visible and selectable for individual or batch removal, while all open actions for those records remain disabled.

#### Scenario: User selects an unavailable Project

- **WHEN** an unavailable Project appears in the current Project catalog result
- **THEN** the user can select and remove it while its diagnostic remains visible and its open action remains disabled

### Requirement: Batch removal does not delete Project files

Removing Projects from the Project catalog SHALL update local catalog, workspace registration and Window references, SHALL delete the Projects' authoritative Agent conversations, and SHALL NOT delete the Project directory, project files, media, or generated artifacts.

#### Scenario: User confirms removal

- **WHEN** the Host completes individual or batch Project removal
- **THEN** the selected Project groups and associated conversations are absent from the next projection
- **AND** no filesystem deletion operation is performed against any Project directory or Project file
