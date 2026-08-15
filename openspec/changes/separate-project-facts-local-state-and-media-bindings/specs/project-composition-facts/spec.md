## ADDED Requirements

### Requirement: Project composition stores irreducible facts independently

Project SHALL store stable Project identity and each irreducible Entity-to-Character association as
independently owned synchronized facts. It MUST NOT require one monolithic composition root containing
identity, local membership, dependency summaries, and associations in order to open a Workspace or
project Project Content.

#### Scenario: One Entity Character association is invalid

- **WHEN** one association record is malformed beside valid Project identity and valid association rows
- **THEN** Project preserves the malformed bytes and reports an identity-scoped association diagnostic
- **AND** valid associations, Project Files, Character, World, and unrelated Workspace capabilities remain
  available

### Requirement: Local target membership is derived from owning records

Project local Character and World membership SHALL be derived from current Chara- and World-owned
records that declare the exact Project scope. Project MUST NOT retain a second mutable `localTargets`
authority or infer membership from names, folders, active Project, Entity kinds, or presentation history.

#### Scenario: Character belongs to a Project

- **WHEN** a valid CharacterProject owner record declares the exact ContentProject identity
- **THEN** the Project target and Project Content projections include that CharacterProject
- **AND** no Project membership list is written or consulted

#### Scenario: One World scope record is inconsistent

- **WHEN** a WorldProject record cannot prove the exact Project scope
- **THEN** only that World target is unavailable with an owner diagnostic
- **AND** Project does not attach it through name or active-Workspace inference

### Requirement: Dependencies are derived from exact consumer references

Project dependency and usage summaries SHALL be rebuilt from exact owner-qualified CharacterVersion,
WorldVersion, Asset revision, Media Library, package, and other consumer references. A derived summary
MUST NOT become an editable dependency authority or authorize deletion, publication, resolution, or
fallback.

#### Scenario: Consumer removes its final exact reference

- **WHEN** the owning document atomically removes the final reference to one external revision
- **THEN** the next Project dependency projection omits that revision
- **AND** no stale Project-level dependency row keeps it authoritative

### Requirement: Entity Character association is a Project fact

Each Entity-to-Character association SHALL be owned by the exact Project and SHALL bind one exact
ProjectEntity identity to one exact CharacterProject identity. It MUST NOT be stored in Character,
Entity projection, Search, project `.neko`, `project-composition.json`, or a user-global cache.

#### Scenario: Project local state is deleted

- **WHEN** a Project has valid Entity-to-Character associations and its entire `.neko/` directory is
  removed
- **THEN** the associations remain unchanged in synchronized Project facts
- **AND** Project Content reconstructs the same Character membership after local state initialization

### Requirement: Project Content and navigation are rebuildable projections

Project Content, target navigation, resource usage, dependency availability, and publication readiness MUST
be read-only projections of current Project facts and fixed owner ports. An invalid input MUST be
isolated to the smallest identifiable row or group and MUST NOT be replaced by an empty successful
composition.

#### Scenario: Character owner is unavailable beside valid Worlds

- **WHEN** one associated CharacterProject cannot be read while valid WorldProject records exist
- **THEN** Project Content returns a Character diagnostic and the valid World rows
- **AND** it does not fail the Project Content root or report an empty project

### Requirement: Scene transition does not depend on a complete Project projection

Desktop scene transition SHALL commit exact Window and Workspace navigation independently from optional
Project Content projection. A Project projection failure MUST remain inside the Project-owned Surface and
MUST NOT leave the Shell half-transitioned or reject unrelated Workspace access.

#### Scenario: Project Content cannot build during Workspace entry

- **WHEN** exact Workspace authorization succeeds but one Project projection owner rejects its record
- **THEN** Desktop enters the Workspace scene and the Project Content Surface shows the bounded diagnostic
- **AND** Project Files and unrelated slots remain usable
