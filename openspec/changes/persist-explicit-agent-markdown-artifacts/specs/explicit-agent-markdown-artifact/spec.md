## ADDED Requirements

### Requirement: Terminal output remains Markdown-native

The product SHALL treat a final assistant Markdown message as an always-present conversational summary plus an optional reviewable Markdown artifact. The optional artifact SHALL be admitted only by one Host-defined marker outside fenced code blocks and SHALL start with a non-empty H1. The product SHALL NOT require or accept a generic CompositeArtifact JSON envelope for this workflow.

#### Scenario: Agent returns an ordinary answer

- **WHEN** a final assistant message contains no admitted artifact marker
- **THEN** the complete Markdown is projected as the conversation reply
- **AND** no Workspace file or Canvas artifact node is created

#### Scenario: Agent returns an admitted long-term document

- **WHEN** a Workspace turn final message contains a non-empty summary, one admitted marker and a Markdown document beginning with H1
- **THEN** the conversation projects only the summary
- **AND** the Host derives the document title from the H1 and preserves the document Markdown as the artifact body

#### Scenario: Published long-term document is available from the conversation

- **WHEN** an admitted Markdown artifact has been published byte-identically in the exact Workspace
- **THEN** the final assistant event projects the summary and one durable document reference
- **AND** the reference contains the canonical Workspace `ContentLocator` and document title
- **AND** activating the reference opens that exact Markdown document through the sender-bound Host action
- **AND** the conversation does not duplicate the complete document body

#### Scenario: Conversation is reopened after publication

- **WHEN** the application or Agent owner is reopened with the terminal message and published Workspace file still available
- **THEN** the same document reference is rebuilt from the terminal artifact identity and exact Workspace authority
- **AND** no in-memory publication receipt or preview session is required

#### Scenario: Document publication is not available

- **WHEN** the terminal message contains a valid artifact but its exact Workspace file is missing, conflicting or publication failed
- **THEN** the conversation does not project a false document reference
- **AND** the artifact failure remains visible at its owning boundary

#### Scenario: Marker contract is invalid

- **WHEN** a marker is repeated, unadmitted, followed by no document, or followed by content without H1
- **THEN** artifact delivery fails locally with an explicit diagnostic
- **AND** the original transcript remains available
- **AND** no file is written and unrelated turns remain usable

### Requirement: Workspace artifact publication is exact and durable

For an admitted artifact, Agent Runtime SHALL derive one stable Workspace-relative Markdown path from the profile, title and content. Desktop SHALL write the bytes through the exact Workspace authority and SHALL NOT use an Agent-selected absolute or temporary path. Repeating the identical artifact SHALL be idempotent; conflicting content at the same path SHALL fail visibly.

#### Scenario: Artifact is published successfully

- **WHEN** an admitted final document passes validation
- **THEN** only the document body is written under the canonical generated Markdown directory in the bound Workspace
- **AND** the conversation summary is not included in the file

#### Scenario: Publication is replayed

- **WHEN** the same artifact publication is processed again
- **THEN** the existing byte-identical file is reused
- **AND** no duplicate file or Canvas node is created

#### Scenario: Renderer opens a published artifact

- **WHEN** the user activates a final-message document reference
- **THEN** Renderer submits only the exact conversation and message identity
- **AND** Desktop Main resolves and authorizes the canonical Workspace `ContentLocator`
- **AND** raw Host paths, temporary preview identities and Renderer-selected locators are not accepted as authority

### Requirement: Durable document projects to the admitted Canvas target

After successful publication, the product SHALL deliver exactly one locator-backed Markdown file reference to the Canvas target admitted for that turn. It SHALL NOT infer an active or recent Canvas and SHALL NOT repeat Content Tool chapter, image or source projection during terminal delivery.

#### Scenario: Board target remains available

- **WHEN** the durable Markdown file is published and the turn has an exact Canvas admission
- **THEN** one Markdown file-reference node is projected to that Canvas
- **AND** the node resolves through the persisted Workspace `ContentLocator`

#### Scenario: Board projection is unavailable

- **WHEN** file publication succeeds but the admitted Canvas target is unavailable
- **THEN** the durable file remains in the Workspace
- **AND** projection returns a visible blocked diagnostic
- **AND** no alternate Canvas is selected

### Requirement: Context and Skill refine document production without owning runtime protocol

Workspace context SHALL receive the default reviewable Markdown admission. Other conversation contexts SHALL not receive default admission. An active Skill MAY refine the document's creative structure, evidence and style, but SHALL NOT redefine the marker, Host path, file-write protocol, Canvas target selection or tool schema.

#### Scenario: Workspace Skill requires a stricter document

- **WHEN** a Workspace turn uses a Skill with a domain-specific document template
- **THEN** the Agent follows that template inside the artifact Markdown
- **AND** the Host still parses and persists it through the same terminal contract and delivery path
