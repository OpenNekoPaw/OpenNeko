## ADDED Requirements

### Requirement: Desktop tests use isolated storage authority

Every canonical Desktop functional or Agent Evaluation run SHALL bind its runtime HOME, Local Metadata
SQLite database, Electron `userData`, and prepared Workspace to one explicit temporary fixture root
before application storage opens. A functional launch with a missing, relative, unsafe, or escaping
storage path MUST fail visibly and MUST NOT fall back to the system HOME or `~/.neko/neko.db`.

#### Scenario: Canonical functional run starts

- **WHEN** the shared Desktop functional runner prepares a UI or Agent Evaluation scenario
- **THEN** it launches Desktop with an explicit fixture argument and absolute contained HOME, userData,
  and Workspace paths
- **AND** Desktop opens `${FIXTURE_HOME}/.neko/neko.db` rather than the user database

#### Scenario: Functional userData escapes the fixture root

- **WHEN** a functional launch supplies Electron `userData` outside its fixture HOME
- **THEN** Desktop rejects startup before Local Metadata opens
- **AND** no fallback database is selected

#### Scenario: Ordinary product startup begins

- **WHEN** Desktop starts without the explicit functional fixture argument or fixture environment
- **THEN** it uses the system HOME and canonical user database
- **AND** it does not inspect or import discarded functional fixture databases

### Requirement: Historical fixture records are not inferred or rewritten

Product runtime and test orchestration MUST NOT classify, hide, migrate, rewrite, or delete existing
user catalog rows by matching path names associated with tests, reports, or temporary directories.
Identifiable unavailable rows SHALL remain visible for explicit identity-scoped user handling.

#### Scenario: User database contains an old fixture-looking Workspace

- **WHEN** a retained Workspace locator includes a temporary, report, or Agent Evaluation path
- **THEN** the project catalog displays the record and its local diagnostic according to normal catalog
  rules
- **AND** only an explicit user removal for that exact identity may delete the catalog record
