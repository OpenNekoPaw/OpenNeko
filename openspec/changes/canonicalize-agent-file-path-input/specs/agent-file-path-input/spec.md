## ADDED Requirements

### Requirement: Core file Tools use one relative-or-absolute path input

Read, Write, Grep and ListDirectory SHALL accept one string path field. The field MAY contain a normalized relative path or an absolute path, and both forms SHALL enter the same canonical resolver and authorization path.

#### Scenario: Relative path identifies an authorized file

- **WHEN** the Agent submits normalized relative path `docs/brief.md` in an exact Workspace
- **THEN** the resolver authorizes that Workspace file and the Tool executes once
- **AND** the result identifies it as `docs/brief.md`

#### Scenario: Absolute path identifies the same authorized file

- **WHEN** the Agent submits the absolute Host path for the same `docs/brief.md` inside the exact Workspace
- **THEN** the same resolver, authorization and Tool handler execute once
- **AND** the result identifies it as `docs/brief.md`

### Requirement: Absolute syntax does not grant filesystem authority

An absolute input SHALL be accepted only when it resolves through the Tool's exact authorized Workspace authority. Existence, process readability or a previously active Workspace SHALL NOT independently authorize the path.

#### Scenario: Absolute path is outside the authorized Workspace

- **WHEN** a core file Tool receives an existing absolute path outside its exact authorized Workspace root
- **THEN** the current call fails with an outside-authority diagnostic
- **AND** no alternate root, active Workspace, home directory or direct filesystem reader is attempted

#### Scenario: Absolute path traverses an unauthorized symlink

- **WHEN** an in-Workspace lexical path resolves through a symlink outside the authorized target boundary
- **THEN** the current resource is rejected by the Host authorization boundary
- **AND** valid sibling resources remain usable

### Requirement: Canonical file identity is Workspace-relative

Successful results, matches, directory entries, `WorkspaceFileContentLocator` values and persisted Agent facts SHALL contain only the normalized Workspace-relative path. Host absolute paths SHALL remain transient IO values and SHALL NOT become a second content identity.

#### Scenario: Grep is called with an absolute directory

- **WHEN** Grep receives an authorized absolute Workspace directory and finds matches
- **THEN** every returned match path is Workspace-relative
- **AND** neither Tool data nor transcript facts contain the absolute Workspace root

#### Scenario: Write is called with an absolute file target

- **WHEN** Write successfully creates or replaces a file through an authorized absolute input
- **THEN** the mutation result and durable content locator use the canonical Workspace-relative path
- **AND** no absolute-path field is persisted alongside it

### Requirement: Invalid path failures are visible and local

Malformed, traversal, outside-authority, ignored and protected-domain inputs SHALL reject the current call with a typed diagnostic. The system SHALL NOT retry the input through a second interpretation, reader, root or runtime.

#### Scenario: Input is malformed

- **WHEN** a core file Tool receives an empty, NUL-containing or non-normalizable path
- **THEN** that call fails with an invalid-path diagnostic
- **AND** unrelated Tools and Workspace entries remain available

#### Scenario: Protected project document is targeted

- **WHEN** generic Read, Write or Grep targets a `.nkc` or `.otio` document using either path form
- **THEN** the request is rejected with the owning-domain routing diagnostic
- **AND** the system does not access the raw document through another file path

### Requirement: Agent runtimes share the OpenNeko path contract

Pi, DSH and any later Agent runtime adapter SHALL expose the same OpenNeko-owned core file Tool schema and result semantics. An adapter SHALL NOT expose an upstream absolute-path contract, relative-only variant or fallback Tool registration in parallel.

#### Scenario: Runtime adapter registers core file Tools

- **WHEN** an Agent session is composed with Pi or DSH
- **THEN** exactly one OpenNeko core file Tool registration exists for each operation
- **AND** its path schema and canonical Workspace-relative result contract are identical across runtimes
