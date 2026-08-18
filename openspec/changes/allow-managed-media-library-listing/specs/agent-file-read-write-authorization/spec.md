## ADDED Requirements

### Requirement: Read-only Workspace tools may follow symbolic links

The Agent SHALL allow `Read`, `ListDirectory`, and read-only `Grep` to follow a symbolic link reached through a lexically authorized Workspace-relative path when the current operating system user can read the requested target.

#### Scenario: Read follows a linked text file

- **WHEN** `Read` receives a Workspace-relative path whose final component is a symbolic link to a readable UTF-8 text file
- **THEN** the Tool returns the target text with the submitted Workspace path and no physical target path

#### Scenario: ListDirectory follows a linked directory

- **WHEN** `ListDirectory` receives a Workspace-relative path whose resolved directory is a readable symbolic-link target
- **THEN** the Tool returns the bounded single-level catalog using the submitted Workspace-relative directory path and does not reject the listing solely because it crosses a symbolic link

#### Scenario: Grep follows linked directories and files

- **WHEN** read-only `Grep` recursively searches a Workspace-relative path that contains a readable symbolic-link directory or file
- **THEN** matching results are returned under submitted Workspace-relative display paths, with bounded results and no physical target path

### Requirement: Read-only failures remain local and visible

The Agent SHALL reject only the affected read operation when a symbolic link is broken, loops, or cannot be read, and SHALL return an explicit diagnostic without an empty-success fallback or sibling invalidation.

#### Scenario: Broken link is reported

- **WHEN** a read-only tool targets a broken symbolic link
- **THEN** that operation fails with a visible not-found or unavailable diagnostic and no target path is projected

#### Scenario: Symlink cycle is bounded

- **WHEN** recursive `Grep` encounters a directory realpath already visited in the same request
- **THEN** that branch is skipped or reported as a local diagnostic, the request remains bounded, and unrelated sibling branches continue

### Requirement: Write authority does not follow symbolic links

The Agent SHALL keep `Write` and directory creation on strict Workspace content authorization; a symbolic link SHALL NOT grant authority to create, replace, or redirect a target outside the authorized Workspace content namespace.

#### Scenario: Write through a linked file is denied

- **WHEN** `Write` targets a Workspace-relative symbolic link to a file outside the Workspace authority
- **THEN** the write fails with an explicit authorization diagnostic and the physical target remains unchanged

#### Scenario: Directory creation through a linked parent is denied

- **WHEN** directory creation targets a path whose parent crosses a symbolic link
- **THEN** creation fails with an explicit authorization diagnostic and no directory is created at the physical target

### Requirement: Read/list projections do not leak physical paths

Read-only Core Tools SHALL project only canonical submitted Workspace paths, stable entry names, and bounded content metadata; they SHALL NOT return absolute symbolic-link targets or use physical target paths as durable identity.

#### Scenario: Linked result omits target path

- **WHEN** `Read`, `ListDirectory`, or `Grep` succeeds through a symbolic link
- **THEN** serializing the result contains no absolute physical target path and all returned locators remain Workspace-relative
