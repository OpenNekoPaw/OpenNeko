# assistant-generation-ownership Specification

## Purpose
Define durable Generation Job and artifact ownership for Workspace and personal Assistant interactions.
## Requirements
### Requirement: Generation binds Jobs to an explicit owning scope

Generation SHALL bind every Job owner to exactly one Project Workspace or Assistant Space identity and one authorized durable root. The same owner identity MUST NOT resolve to another root, and a failure in one owner MUST NOT disable a sibling owner.

#### Scenario: Project generation uses its authoritative Workspace

- **WHEN** a Project Agent requests generation
- **THEN** Generation uses the exact UUID-backed Workspace identity and authorized Project root
- **AND** the Workspace descriptor, Job partition and generated-output projection remain unchanged

#### Scenario: Assistant generation has no Project Workspace

- **WHEN** an Assistant conversation requests generation without an open Project
- **THEN** Generation uses the exact Assistant Space identity and its user-owned root
- **AND** it does not require, create or select a Project Workspace identity

### Requirement: Assistant generated output is durable user data

Assistant Generation Jobs, generated-output projections and successful output files SHALL persist under the owning Assistant Space in user storage. Temporary or scratch paths MUST NOT be returned as successful output identity or retained by the transcript.

#### Scenario: Assistant image survives owner reopen

- **WHEN** an Assistant image Job succeeds and the Generation owner or application is reopened
- **THEN** the Job and generated-output ContentLocator resolve from the same Assistant Space owner
- **AND** the file remains under that Assistant Space `neko/generated/image` directory
- **AND** no active/recent Workspace, Asset import or tmp path participates

#### Scenario: Assistant owner initialization fails

- **WHEN** one Assistant Space metadata partition or root is invalid
- **THEN** only that owner fails with an explicit diagnostic before provider execution
- **AND** Project and sibling Assistant owners remain usable

### Requirement: Artifact delivery follows the interaction owner

Creator-visible artifacts produced by a Workspace conversation SHALL be offered to the exact Workspace Board delivery port. Artifacts produced by an Assistant conversation SHALL remain in the Assistant transcript and Generation persistence and MUST NOT be collected or delivered as Workspace Board content.

#### Scenario: Assistant generation completes without Workspace Board delivery

- **WHEN** an Assistant generation Tool returns a durable generated-output artifact
- **THEN** the artifact and Generation Job remain available from the owning Assistant Space and conversation
- **AND** no Workspace Board delivery request or Board delivery diagnostic is produced

#### Scenario: Workspace generation retains Board delivery semantics

- **WHEN** a Workspace generation Tool returns a creator-visible artifact
- **THEN** the exact Workspace Board delivery port receives that Workspace, Conversation, Turn and artifact identity
- **AND** a missing or blocked Workspace Board port remains fail-visible for only that delivery
