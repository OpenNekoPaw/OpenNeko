# workspace-resource-acquisition Specification

## Purpose

Define explicit Project file import and external Media Library linking through authorized, target-free owner paths.

## Requirements

### Requirement: Ordinary import copies files into the Project

The Project Files source SHALL provide an Import Files action that copies explicitly selected regular files into
the selected project directory. Imported bytes MUST become project-owned workspace files and MUST NOT retain an
absolute source path, global connection identity or external authorization dependency.

#### Scenario: User imports ordinary media

- **WHEN** the user selects Import Files and chooses readable regular files
- **THEN** the system copies them atomically into the selected Project Files directory and refreshes that source
- **AND** later project sync and portable packaging treat the imported bytes as project-owned content

#### Scenario: Import is cancelled or fails

- **WHEN** native selection is cancelled or one selected file cannot be safely copied
- **THEN** cancellation leaves the project unchanged or failure is shown with the exact affected file
- **AND** no partial destination is presented as a successful imported file

### Requirement: Copy is the low-decision default

The ordinary add/import workflow SHALL copy into Project Files without presenting a copy-versus-link decision.
External retention MUST be a separately named advanced action with explicit portability semantics.

#### Scenario: User opens the Project Files add menu

- **WHEN** the user opens the add menu in Project Files
- **THEN** Import Files is presented as the ordinary acquisition action
- **AND** no mandatory storage-mode dialog blocks that action

### Requirement: External folders require explicit linking

The External Media source SHALL expose Link External Folder as an explicit action. A successful fresh link SHALL
create one direct managed link at `neko/assets/<libraryName>`, MAY create or select a user-global directory record
only for user-facing management, MAY initially
be unreferenced, and MUST NOT copy bytes, create project document references or mutate the selected directory.

#### Scenario: User links a fresh external folder

- **WHEN** the user explicitly chooses Link External Folder and selects an available directory whose logical
  name does not conflict with the current Project managed-link set
- **THEN** External Media shows that source as locally linked and unreferenced
- **AND** project facts and external bytes remain unchanged

#### Scenario: Selected folder already has a global connection

- **WHEN** the user links an available directory that already owns the exact user-global connection but has no
  current Project managed link
- **THEN** the system reuses that connection for selection, creates the direct project managed link and shows the source
  in External Media
- **AND** it does not report a duplicate connection, create another connection or mutate external bytes

#### Scenario: Same logical name identifies another directory

- **WHEN** the selected directory has the same logical name as an existing global connection but resolves to a
  different physical directory
- **THEN** linking fails visibly before writing the project managed link
- **AND** the existing global connection and both external directories remain unchanged

#### Scenario: Link action is cancelled

- **WHEN** the user cancels directory selection or confirmation
- **THEN** no global connection or project managed link is created

### Requirement: Missing external sources recover in place

An External Media source required by current project references SHALL expose Reconnect on that exact source.
Recovery MUST validate the selected authorized connection and every currently referenced descendant before
applying an immutable current plan. The toolbar MUST NOT infer or apply a same-named global connection.

#### Scenario: Project opens after local state deletion

- **WHEN** `.neko` has been deleted while project facts still contain External Media locators
- **THEN** each exact logical source appears as requiring reconnection with its reference count
- **AND** Project Files and Project Content remain usable

#### Scenario: Selected folder is incomplete

- **WHEN** the user selects a recovery directory missing one currently referenced descendant
- **THEN** recovery fails visibly for that exact source and no managed link is written
- **AND** no alternate connection, raw path or cached content is attempted

### Requirement: External Media remains local and removable

Project-local external Media Libraries SHALL be direct managed links under `neko/assets`, SHALL be excluded from
sync and packaging without being followed, and SHALL have no parallel `.neko` binding. Removing an unreferenced
or user-confirmed link MUST remove only local
authorization and MUST NOT delete the global connection, project references or external bytes.

#### Scenario: User removes an external source

- **WHEN** the user confirms removal of a locally linked source
- **THEN** only the exact project-local managed link is removed
- **AND** referenced entries remain visible as unavailable while all external bytes are preserved
