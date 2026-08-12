## ADDED Requirements

### Requirement: Creative concepts retain one exact owner

The system SHALL model File content, Media Library connections and local managed Assets as foundational
resources, Project Entities as semantic information, and Characters as authoring projects according to
their distinct authority and lifecycle. It MUST NOT create a universal
Resource, CreativeObject, Version, Graph or Session aggregate that copies their facts or routes their
mutations.

#### Scenario: One resource appears in aggregated search

- **WHEN** one query matches a workspace file, a linked Media projection, a locally installed Asset, a
  Project Entity and a Character
- **THEN** the result presentation retains every exact owner identity, lifecycle, availability and
  owner-declared operation without converting records into one catalog identity

#### Scenario: Discover ordinary content

- **WHEN** file or Media reconciliation discovers new authorized content
- **THEN** it refreshes only source-derived projections and creates no Asset, Entity or Character
  identity

### Requirement: Project Character association is explicit and project-owned

Project composition SHALL own an exact association between one confirmed project Character Entity and
one CharacterProject without copying either owner's payload. A standalone Character SHALL NOT require an
Entity; a project-local Character SHALL have exactly one association; and a Character Entity MAY remain
without interactive Character capability.

#### Scenario: Create a project-local Character

- **WHEN** a user explicitly creates a Character in one authorized Content Project
- **THEN** the workflow creates or selects one exact Character Entity, creates one fresh project-local
  CharacterProject, records Project membership and commits their exact association
- **AND** no standalone catalog record, implicit active Project or usable CharacterVersion is selected

#### Scenario: Create a standalone Character

- **WHEN** a user creates a Character in the authorized standalone Character library
- **THEN** Chara creates the CharacterProject without creating a Content Project or Project Entity

#### Scenario: Enable interaction for a discovered person

- **WHEN** the user confirms one Character candidate and explicitly selects Enable interaction
- **THEN** the project confirms or reuses the exact ProjectEntity and associates one fresh
  CharacterProject through the canonical Chara creation path
- **AND** candidate confidence or name matching alone cannot create or associate the Character

### Requirement: Character creation seeds one canonical fresh draft

Manual input, prompts, file evidence, ordinary Asset representations and confirmed Entity context SHALL
act only as seed inputs to the same fresh CharacterProject creation contract and repository. The system
MUST NOT create FileCharacter, AssetCharacter, EntityCharacter or provider-specific Character types.

#### Scenario: Create from a setting document

- **WHEN** a user supplies an authorized document and approves Character Creator output for an exact
  destination
- **THEN** Chara creates one fresh CharacterProject whose accepted fields and evidence refs come from the
  reviewed operation while the source file remains Content-owned

#### Scenario: Create from a Live2D Asset

- **WHEN** a user selects a validated exact Live2D Asset member and chooses Create Character
- **THEN** Chara creates one fresh CharacterProject and records the selected representation ref without
  treating the Asset package as Character identity or inventing Character definition facts

#### Scenario: Import a portable Character

- **WHEN** a user imports a valid `.neko-character` archive
- **THEN** the Chara import workflow validates and installs its exact selected Character records
- **AND** it does not route the archive through Character Creator or retain the archive as a live
  repository

### Requirement: Authoritative references and usage projections remain separate

Each consuming owner SHALL persist its exact dependency facts. Search/local metadata MAY derive
occurrence, usage-count, recent-use, dependency-summary, freshness and availability projections, but
those projections MUST NOT authorize merge, delete, uninstall, rebind or version replacement.

#### Scenario: Display current Character usage

- **WHEN** Conversation, Room and Project owners reference an exact CharacterVersion or
  CharacterProject
- **THEN** management MAY show an incrementally refreshed usage summary keyed by owner-qualified
  identities without writing that summary into Entity or Character facts

#### Scenario: Delete a referenced CharacterVersion

- **WHEN** the user requests deletion of a CharacterVersion while a usage projection reports no references
- **THEN** Chara queries every required current typed reference owner before deciding the operation
- **AND** any unavailable, incomplete or blocking owner prevents deletion without trusting the projection

#### Scenario: Source evidence changes

- **WHEN** a referenced file fingerprint or Entity occurrence projection changes
- **THEN** the system marks the evidence or representation stale and MAY create a review candidate
- **AND** it does not modify CharacterProject facts, immutable CharacterVersion or Entity
  identity automatically

### Requirement: Portability remains domain-owned

Ordinary reusable representations SHALL use locally installed Asset packages and Character portability
SHALL use Chara-owned transport. Project Entity SHALL remain project-local and
the product MUST NOT expose Entity Asset publication, instantiation, provenance update or three-way
diff/apply as a successful operation.

#### Scenario: User wants to share a Character

- **WHEN** the user exports a Character with selected records and resources
- **THEN** Chara creates a `.neko-character` transport without publishing a Project Entity or copying
  Conversation, Room, memory or model configuration

#### Scenario: Existing Entity Asset implementation is present

- **WHEN** public-entry and production reachability audits find Entity Asset contracts or services
- **THEN** the change removes their registrations and exports atomically before deleting the replaced
  implementation
- **AND** existing user bytes remain untouched and receive an exact unsupported-state diagnostic rather
  than a compatibility or fallback reader
