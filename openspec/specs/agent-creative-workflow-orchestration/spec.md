# agent-creative-workflow-orchestration Specification

## Purpose

Define human-reviewed Agent coordination for multi-stage creative work without creating a second workflow runtime or expanding the current request into unverified production detail.

## Requirements

### Requirement: Multi-stage creative work keeps a compact end-to-end route

For a multi-stage creative work, the Agent SHALL establish or refresh a compact route from current Workspace facts through the stages needed for the requested final work. The route SHALL identify each necessary stage's intended output, dependency and completion condition without pre-writing unverified downstream content.

#### Scenario: Creator requests a media concept

- **WHEN** the creator requests a media design without authorizing generation, editing or delivery
- **THEN** the Agent returns the current reviewable creative artifact and a compact route through the relevant later stages
- **AND** it does not present downstream prompt packets, edit instructions or delivery manifests as completed work

#### Scenario: Current work already contains reusable facts

- **WHEN** current Canvas nodes, documents, references or generated results still satisfy the requested stage
- **THEN** the Agent reuses those facts and updates only the affected route dependency
- **AND** it does not reread unchanged source material or recreate the existing artifact

### Requirement: The current creator-reviewable stage receives the detailed work

The Agent SHALL develop only the creator-requested current stage in detail and SHALL include the plot or subject intent, character function, scene progression, style, sound and continuity decisions that materially constrain that stage. Content that changes no creative input, production unit or review decision MUST be omitted.

#### Scenario: Creator requests an adaptation design

- **WHEN** plot, character, scene, style, sound or continuity affect the requested adaptation artifact
- **THEN** the artifact makes those decisions concrete enough for creator review
- **AND** generic background analysis and speculative later-stage instructions are omitted

#### Scenario: Source evidence supports only a local scope

- **WHEN** the available evidence cannot support a whole-work or volume-level claim
- **THEN** the Agent narrows the artifact title and content to the proven opening, scene or selected sequence
- **AND** it does not preserve a broad title by appending a disclaimer

### Requirement: Creator feedback advances the route without workflow state

After the current stage, the Agent SHALL return one state-grounded next operation. An unqualified continuation SHALL perform that operation, while a requested revision SHALL update the current artifact and route. The system MUST NOT create an approval object, Gate, budget state or global production state machine for this interaction.

#### Scenario: Creator says continue

- **WHEN** the preceding result recommends one valid next operation and the creator says “continue” without another objective
- **THEN** the Agent performs that next operation from current Workspace facts
- **AND** it does not restart analysis, ask what continue means or skip automatically to later stages

#### Scenario: Creator requests a revision

- **WHEN** the creator changes a material decision in the current artifact
- **THEN** the Agent revises that artifact and any affected route dependency
- **AND** it does not require a separate reapproval record or preserve contradictory old content
