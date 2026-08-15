## MODIFIED Requirements

### Requirement: Creative Entity is the only semantic identity authority

Project Entity SHALL be the only mutable project authority for character, scene, object, location and
style semantic identity, kind, names, aliases, lifecycle and accepted project representation bindings.
It MUST NOT own unrestricted domain payload, Character definition/version/interaction, usage statistics,
recent-use, Search projections or portable package lifecycle. Media Library files, Asset packages and
CharacterProject MUST NOT create a second live
project semantic identity authority.

#### Scenario: Discover a character-named image

- **WHEN** Media Library discovers a file whose name resembles an existing or possible character
- **THEN** it may emit search or candidate evidence but does not create, rename, merge or confirm a
  Project Entity

#### Scenario: Character facts are authored

- **WHEN** Character authoring accepts background, canon, knowledge, behavior, expression, Storyline or
  memory content
- **THEN** Chara stores the content in its exact owning record and does not copy it into Project Entity
  facts

### Requirement: Genuine composites use package-owned references

A representation that requires multiple files SHALL use a narrow package-owned manifest/reference
defining file roles and capabilities. An ordinary composite package MUST NOT contain Project Entity
semantic identity or recreate a generic AssetEntity hierarchy. Project Entity publication as a generic
identity Asset MUST remain unavailable unless a later independent change establishes a real non-Character,
non-World consumer and complete portable lifecycle.

#### Scenario: Bind a Live2D package

- **WHEN** a validated Live2D package provides model, texture and motion roles
- **THEN** the Entity or Character binding references the exact package representation and the package
  owner resolves its members

#### Scenario: Request Entity publication

- **WHEN** a user or caller requests Project Entity publication, instantiation, provenance update or
  three-way Asset diff/apply
- **THEN** the product reports the capability unavailable and does not route to a hidden Entity Asset
  service or generic Asset fallback

## ADDED Requirements

### Requirement: Entity interaction is association-derived and Chara-owned

Project Entity management SHALL NOT own Character dialogue, Room, embody, Conversation or Agent launch
lifecycle. When an exact project-owned Entity-to-Character association exists, product composition MAY
project Chara-owned Open Character, Open Studio or Start Interaction handoffs using exact
CharacterProject and required CharacterVersion identity.

#### Scenario: Start interaction from a Project Element

- **WHEN** a confirmed Character Entity has an exact CharacterProject association and the user invokes a
  Chara-provided interaction action
- **THEN** Chara validates or requests the exact CharacterVersion and launches through its canonical
  interaction contract
- **AND** Entity does not synthesize an Agent command, Conversation, Room or latest-version selection

#### Scenario: Inspect an unassociated Character Entity

- **WHEN** a confirmed Character Entity has no CharacterProject association
- **THEN** project presentation may offer an explicit Enable interaction workflow but exposes no dialogue,
  Room or embody success action
