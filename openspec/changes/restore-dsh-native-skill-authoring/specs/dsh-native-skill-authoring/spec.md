## ADDED Requirements

### Requirement: Skill authoring publishes DSH-native packages

The product SHALL expose one approval-gated `CreateSkill` Host Tool that creates a package accepted by the precisely locked DSH filesystem provider. The Tool MUST NOT depend on the active Skill name or implement a second Skill parser, registry or loader.

#### Scenario: Any eligible turn creates a Skill

- **WHEN** an eligible Agent turn receives approval and calls `CreateSkill` with a valid DSH package
- **THEN** the Host SHALL validate and publish it through the canonical authoring path
- **AND** the caller SHALL NOT be required to load `skill-creator`

### Requirement: Exact Conversation authority fixes the destination

The Host SHALL derive the writable personal or Workspace Skill root from the exact Conversation owner. Tool input MUST NOT contain a destination, Workspace identity or filesystem root, and the Host MUST NOT use active, recent or first-available Workspace state.

#### Scenario: Workspace Conversation creates a project Skill

- **WHEN** the exact Conversation is bound to an authorized writable Workspace
- **THEN** the Skill SHALL be published only under that Workspace's configured DSH-supported project Skill root
- **AND** no personal or sibling Workspace root SHALL be modified

#### Scenario: Binding is unavailable

- **WHEN** the exact Conversation target cannot be authorized
- **THEN** creation SHALL fail visibly before publication
- **AND** no fallback target SHALL be selected

### Requirement: Native provider validation precedes publication

Candidate bytes SHALL be staged outside the destination and validated by the locked DSH filesystem provider in an isolated non-Agent scope. Publication SHALL occur only after DSH snapshot/get returns the requested complete definition. OpenNeko MUST NOT duplicate the DSH frontmatter parser.

#### Scenario: DSH rejects frontmatter

- **WHEN** the staged main file has invalid or unsupported DSH frontmatter
- **THEN** the provider validation SHALL reject it and the Host SHALL leave the target root unchanged
- **AND** no temporary provider or candidate SHALL appear in an Agent catalog

#### Scenario: Upstream validation API cannot be isolated

- **WHEN** the locked DSH release cannot validate a staged package through a public provider boundary
- **THEN** the authoring operation SHALL remain visibly unavailable
- **AND** OpenNeko SHALL NOT add a copied parser or optimistic write path

### Requirement: DSH layouts, invocation policy and safe resources are preserved

The authoring contract SHALL support DSH directory-bundle and flat Markdown layouts, canonical frontmatter including invocation policy and metadata, and safe relative resources using the resource base supplied by DSH for either layout. Product defaults MUST NOT disable manual discovery of another DSH-supported layout.

#### Scenario: Directory Skill includes a reference guide

- **WHEN** DSH validates a directory Skill with a safe relative reference
- **THEN** the Host SHALL publish the main file and reference atomically
- **AND** DSH SHALL later discover the same resource base without an OpenNeko overlay

#### Scenario: Flat Skill requests sibling resources

- **WHEN** a flat-file request includes package-relative sibling resources
- **THEN** creation SHALL validate and publish collision-safe resource paths relative to the DSH-supplied flat resource base
- **AND** SHALL NOT reject, drop or relocate them merely because the main Skill uses flat layout

### Requirement: Publication is non-destructive and observed by DSH

The Host SHALL publish with no-replace semantics. Existing targets, unsafe paths, symlinks, duplicate resources and partial writes SHALL fail without changing target or sibling bytes. Success readiness SHALL be derived from a subsequent DSH catalog observation rather than a Host-owned registry entry.

#### Scenario: Same-name target exists

- **WHEN** the destination already contains the requested Skill target
- **THEN** creation SHALL fail visibly and preserve the existing target byte-for-byte
- **AND** SHALL NOT merge, overwrite, rename or shadow it through another root

#### Scenario: Catalog refresh is incomplete after publish

- **WHEN** files are atomically published but the DSH snapshot is temporarily incomplete
- **THEN** the result SHALL report created-but-not-yet-authoritatively-discovered
- **AND** SHALL NOT claim that the Skill is ready or injected
