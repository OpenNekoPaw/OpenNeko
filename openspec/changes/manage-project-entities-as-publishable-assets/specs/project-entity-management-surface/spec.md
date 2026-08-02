## ADDED Requirements

### Requirement: Resource Browser exposes an Entity facet

Resource Browser SHALL expose Project Entities through an `entities` facet rather than the ambiguous
`materials` name. The facet SHALL distinguish confirmed, candidate, needs-attention, and deprecated
states while preserving Project Entity identity independently from file and Asset identities.

#### Scenario: Browse Entity states

- **WHEN** the user selects the Entity facet
- **THEN** confirmed and candidate results are visibly distinguished and filterable by lifecycle and kind

#### Scenario: Search across resource owners

- **WHEN** one query matches a Project Entity, Entity Asset, and ordinary file
- **THEN** every result retains its owner, identity, status, and owner-specific operations

### Requirement: Entity Inspector owns semantic management intents

The Entity Inspector SHALL expose typed create, confirm, edit, bind, unbind, merge, deprecate, instantiate,
publish, diff, and apply-update intents according to the selected Entity state. It MUST NOT write project
files, mutate Asset packages, or infer destructive intent in the Renderer.

#### Scenario: Confirm a candidate

- **WHEN** the user reviews candidate evidence and confirms its kind and accepted facts
- **THEN** the UI submits an expected-revision confirmation intent and shows the resulting confirmed Entity

#### Scenario: Merge has unresolved references

- **WHEN** the host reports reference blockers for a proposed merge
- **THEN** the Inspector displays those blockers and does not report or locally project a completed merge

### Requirement: Candidate evidence supports inline decisions

Candidate results SHALL expose source evidence, confidence provenance, possible confirmed matches, and
explicit confirm, merge-into, dismiss, or inspect actions. Dismissal SHALL affect only rebuildable candidate
workflow state and MUST NOT delete source content.

#### Scenario: Merge candidate into an existing Entity

- **WHEN** the user accepts a suggested existing Entity and selected evidence
- **THEN** the host commits only the explicitly accepted semantic facts and retains source resources unchanged

### Requirement: Asset provenance and update state remain visible

An Entity instantiated from an Entity Asset SHALL display origin Asset, applied revision, available
revision, local modifications, and binding availability. The surface MUST require an explicit diff/apply
operation before changing project facts.

#### Scenario: Entity Asset update is available

- **WHEN** Asset Library installs a newer revision for an Entity's origin Asset
- **THEN** the Entity shows update availability with inspect/diff action and retains current project facts

#### Scenario: Origin Asset is unavailable remotely

- **WHEN** the remote revision is tombstoned but the Project Entity exists
- **THEN** the Entity remains fully manageable and shows provenance availability separately
