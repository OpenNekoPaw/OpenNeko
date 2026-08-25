## ADDED Requirements

### Requirement: Management state changes the effective DSH catalog

Skill and MCP lifecycle commands SHALL be executed by the exact running DSH authority. The returned
management projection MUST reflect the same enablement used for Skill discovery/injection and MCP
Tool registration/execution.

#### Scenario: User disables a capability

- **WHEN** the exact sender-bound surface disables a manageable Skill or MCP server
- **THEN** DSH removes it from the effective invocation or Tool catalog
- **AND** the management record remains visible as disabled
- **AND** sibling capabilities remain available

#### Scenario: User changes a Skill while another Agent turn is active

- **WHEN** a sender-bound Extension Management surface changes one personal Skill while a DSH turn
  is active
- **THEN** Desktop records one pending configuration refresh and blocks new DSH work
- **AND** the active turn and its subprocess remain available until the turn reaches a terminal state
- **AND** the canonical DSH runtime refreshes before accepting subsequent work

### Requirement: Skill lifecycle is source-aware

Personal Skills SHALL support validated import, enable, disable and confirmed exact removal. Bundled and
project Skills SHALL expose only actions that their owning source can enforce without editing user
Workspace content or product resources.

#### Scenario: User attempts to delete a bundled Skill

- **WHEN** the user opens a bundled Skill detail
- **THEN** delete is unavailable with a source-specific explanation
- **AND** no product resource is modified

#### Scenario: User removes a personal Skill

- **WHEN** the user confirms removal of an imported personal Skill
- **THEN** only that Skill's content is removed from the personal DSH Skill root
- **AND** the confirmation states that the imported content is permanently removed

### Requirement: MCP lifecycle uses the official DSH client

Qualified MCP server entries SHALL be loaded by the precisely locked official DSH MCP client through
the DSH Loader. OpenNeko MUST NOT implement another MCP client, Tool registry or fallback runtime.

#### Scenario: User adds a qualified MCP server

- **WHEN** the user confirms a valid transport configuration and required trust boundary
- **THEN** DSH creates one exact Loader entry and reports readiness
- **AND** discovered Tools use the server-qualified DSH names
- **AND** secrets, raw environment and executable paths are absent from the Renderer projection

#### Scenario: Two windows mutate MCP state concurrently

- **WHEN** two sender-bound Desktop windows submit valid MCP mutations before the first Loader
  reconciliation completes
- **THEN** the DSH lifecycle completes the first persistence and Loader mutation before starting the
  second
- **AND** the final persisted file, Loader catalog and management projection contain the same exact
  ordered result without lost updates

### Requirement: Removal and failures are local and visible

Removal SHALL require confirmation and affect only the selected exact capability. Invalid config,
startup failure, permission rejection or stale identity SHALL return an explicit diagnostic and MUST
NOT disable sibling capabilities, Agent Sessions or the Desktop Shell.

#### Scenario: One MCP server fails to start

- **WHEN** DSH rejects the selected MCP server configuration or the server fails to start
- **THEN** the management surface shows an explicit diagnostic on that server
- **AND** no sibling Skill, MCP server, Agent Session or Desktop scene is disabled
