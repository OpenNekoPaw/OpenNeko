## ADDED Requirements

### Requirement: Resource Browser exposes owner-preserving project resource facets

Resource Browser SHALL expose exactly `files`, `media`, `assets`, and `entities` facets rather than the
ambiguous `materials` name. Files SHALL preserve workspace Content identity, Media SHALL preserve linked
Media Library identity and availability, Assets SHALL preserve exact Asset Library identity, and Entities
SHALL preserve Project Entity identity independently from file, Media, and Asset identities. Switching
facets MUST remain Resource Browser display state and MUST NOT add a Workbench or Inspector tab bar.

#### Scenario: Switch project resource facets

- **WHEN** the user switches between Files, Media, Assets, and Entities
- **THEN** the Resource Browser queries the selected owner projection and preserves the other facets'
  selection and navigation display state without copying or converting resources

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

### Requirement: Entity interaction actions are capability-gated and owner-routed

The Entity Inspector SHALL derive available preview, reference, Character dialogue, Room open, and
Character embody actions from typed owner capabilities. It MUST hide unsupported actions and MUST route
supported actions through their owning integration contract with exact Entity and Conversation context.
It MUST NOT synthesize Agent commands, mutate sibling Webview state, or reintroduce an Agent Header
roleplay entry.

#### Scenario: Start dialogue with a confirmed Character

- **WHEN** a confirmed Character exposes the dialogue capability and the user selects Start dialogue
- **THEN** the Character conversation owner creates or opens the exact Character-scoped conversation and
  the Resource Browser does not create an Assistant or Workspace fallback conversation

#### Scenario: Inspect a non-dialogue Entity

- **WHEN** a Location or Object does not expose a dialogue or embody capability
- **THEN** those actions are absent while preview, edit, bind, and reference actions remain available as
  declared

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
