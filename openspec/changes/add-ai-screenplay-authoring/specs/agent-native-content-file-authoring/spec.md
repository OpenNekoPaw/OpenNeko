## ADDED Requirements

### Requirement: Agent content authoring uses the native Workspace file path

Portable content-source documents MUST be read, searched, created and changed through the canonical
Workspace-scoped Agent core file path. Agent content authoring MUST NOT open a Text Document session,
call a format-specific mutation Tool or require an active editor/preview surface.

#### Scenario: Agent creates a Fountain screenplay

- **WHEN** an Agent turn creates an authorized Workspace-relative `.fountain` content file
- **THEN** the core file Tool publishes the actual Workspace file and returns durable file evidence
- **AND** no screenplay-specific Tool, Agent-owned editor session or alternate writer participates

#### Scenario: Agent edits content before an editor opens

- **WHEN** the Agent changes an authorized Markdown, Fountain or admitted plain-text file with no
  mounted Text Editor Root
- **THEN** the file write succeeds independently of Renderer lifecycle
- **AND** later Editor, parser, Search and Preview projections rebuild from the resulting bytes

### Requirement: Native content writes preserve exact target freshness

Replacing an existing content file MUST be atomic and bound to the exact file state observed by the
Agent. A stale target, unauthorized path or ignored Workspace path MUST fail visibly without partial
bytes, automatic merge, alternate writer or target substitution.

#### Scenario: Agent replaces the content it read

- **WHEN** the Agent supplies the exact current freshness evidence for an existing content file
- **THEN** one atomic core-file operation replaces that exact file
- **AND** the result exposes the new durable freshness evidence

#### Scenario: Content changes after Agent inspection

- **WHEN** the target bytes no longer match the state observed by the Agent
- **THEN** only that write fails with a conflict diagnostic
- **AND** the current file, dirty editor buffer, sibling files and Conversation remain available

### Requirement: Content parsers project diagnostics without owning writes

Markdown, Fountain and other content parsers MUST consume the resulting Workspace bytes as
rebuildable projections. Parser failure MUST NOT silently repair source, route the mutation through a
format-specific writer or convert a failed write into success.

#### Scenario: Agent writes invalid Fountain

- **WHEN** a native file write succeeds but the resulting Fountain source has parser diagnostics
- **THEN** the file remains the authoritative Agent-authored content and the diagnostic is visible
- **AND** any correction requires a later explicit Agent or user edit

### Requirement: Open Text Editors treat Agent writes as external file changes

A clean Text Document session MAY reload an observed Agent file change. A dirty session MUST preserve
its accepted buffer and report the external conflict with explicit user actions. It MUST NOT merge the
sources automatically or convert the Agent write into an editor transaction.

#### Scenario: Agent changes a clean open document

- **WHEN** a clean Text Editor observes a successful Agent write to its exact file
- **THEN** it reloads or presents the new authoritative bytes according to the canonical file-change policy
- **AND** it does not create another document session or retain stale clean content

#### Scenario: Agent changes a dirty open document

- **WHEN** a Text Editor has unsaved changes and observes an Agent write to its exact file
- **THEN** it preserves the dirty buffer and presents an external-change conflict
- **AND** no automatic merge, overwrite or active-document fallback occurs

### Requirement: Native content authoring has path-level Evaluation coverage

The Evaluation platform MUST prove one complete Desktop Agent path that publishes a durable content
file through the core file Tool and MUST reject the retired format-specific/session path even when the
final text is valid.

#### Scenario: Evaluation observes a valid native content artifact

- **WHEN** the focused real case completes content authoring
- **THEN** evidence identifies the effective model, core file Tool, exact Workspace target, terminal
  result and durable artifact
- **AND** no screenplay Tool or Agent-owned Text Document session appears
