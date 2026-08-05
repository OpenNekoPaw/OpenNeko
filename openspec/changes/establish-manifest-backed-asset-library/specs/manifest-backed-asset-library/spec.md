## ADDED Requirements

### Requirement: Managed Assets require explicit package lifecycle

The Asset Library SHALL contain only reusable Assets explicitly imported, installed, or published through
a validated package lifecycle. Filesystem discovery MUST NOT create Asset membership, Asset identity, or
package metadata for ordinary workspace or Media Library files.

#### Scenario: Browse an ordinary file

- **WHEN** a supported workspace or linked file has never been imported as an Asset
- **THEN** it remains directly usable through its content locator without an Asset record

#### Scenario: Import a reusable Asset

- **WHEN** the user explicitly imports selected content and supplies or confirms the required package facts
- **THEN** the system validates and installs a managed Asset package without changing the source file owner

### Requirement: Asset revisions have stable immutable identity

Every installed or published Asset revision SHALL be identified by stable `assetId`, immutable `revision`,
and verified package `digest`. A committed revision MUST NOT change its manifest or member bytes; any
change requires a new revision.

#### Scenario: Read an installed revision

- **WHEN** a consumer requests an installed `(assetId, revision)`
- **THEN** the system resolves exactly the manifest and bytes whose verified digest belongs to that revision

#### Scenario: Detect revision identity collision

- **WHEN** content claims an existing `(assetId, revision)` with a different digest
- **THEN** installation or publication fails with an integrity-conflict diagnostic and changes no installed revision

### Requirement: Manifests are closed portable package contracts

An Asset manifest SHALL declare schema version, type, source/provenance, package-relative members,
dependencies, license policy, and type-specific metadata required by its Asset type. It MUST NOT persist
absolute paths, physical Media Library targets, cache paths, provider credentials, or runtime URLs as
durable package identity.

#### Scenario: Package a linked media representation

- **WHEN** an Asset publication selects content from a linked Media Library
- **THEN** publication requires an owned package copy or an explicit installable Asset dependency and rejects the physical link target

#### Scenario: Validate an unknown manifest version

- **WHEN** an installer receives a manifest schema version it does not support
- **THEN** it rejects the package visibly before writing installed state

#### Scenario: Read remote provenance

- **WHEN** a manifest records a portable non-secret remote or registry origin
- **THEN** the system treats it only as provenance and resolves synchronization through an explicit local account/repository binding

#### Scenario: Encounter credential-bearing source URI

- **WHEN** migration or installation finds a signed, credential-bearing, machine-private, or otherwise unsafe source URI
- **THEN** it rejects or archives the value without using or copying it into the installed manifest or synchronization state

### Requirement: Dependencies commit as a validated closure

Installation SHALL resolve and verify the full required dependency closure before exposing a requested
Asset revision as installed. Missing, cyclic, incompatible, or digest-mismatched dependencies MUST fail
the commit visibly.

#### Scenario: Install an Asset with dependencies

- **WHEN** every required dependency revision is available and valid
- **THEN** the system atomically makes the verified closure available and records exact dependency revisions

#### Scenario: Dependency verification fails

- **WHEN** a required dependency is missing or has a mismatched digest
- **THEN** the requested revision remains uninstalled and no partial closure is exposed

### Requirement: Local removal preserves referenced data

Uninstall and garbage collection SHALL be explicit local operations. The system MUST reject removal of a
revision still pinned by an installed dependency or known project reference unless the user first resolves
those references through their owning workflows.

#### Scenario: Remove an unreferenced revision

- **WHEN** the user confirms uninstall of an unreferenced installed revision
- **THEN** the system removes its installed projection and deletes only package bytes no longer referenced by any revision

#### Scenario: Attempt to remove a pinned revision

- **WHEN** an installed dependency or project reference pins the revision
- **THEN** uninstall fails with the exact blockers and preserves all package data

### Requirement: Removing an Asset Library record preserves all bytes

The ordinary Asset Library remove action SHALL remove only the mutable library membership record. It MUST NOT
move a source file to the system trash, uninstall an immutable revision, delete a blob, or mutate a project
reference. Uninstall and garbage collection SHALL remain separate explicit operations.

#### Scenario: User removes a material from the Asset Library

- **WHEN** the user confirms the remove-record action for an active Asset membership
- **THEN** the record is absent from subsequent searches and after application restart
- **AND** the source file and installed package bytes remain byte-for-byte unchanged
- **AND** the Electron trash capability is not invoked

#### Scenario: User imports the same preserved material again

- **WHEN** the user explicitly imports content whose prior membership was removed
- **THEN** the Asset owner creates or reactivates a validated membership through the canonical record path
- **AND** filesystem discovery alone does not silently restore it

### Requirement: Entity Assets use the generic Asset lifecycle

The Asset Library SHALL support `identity` Entity Asset packages through the same manifest, revision,
dependency, install, publish, and removal lifecycle as other Asset types. Asset Library MUST NOT become
the mutable Project Entity fact authority.

#### Scenario: Install an Entity Asset

- **WHEN** a valid Entity Asset revision is installed
- **THEN** Asset Library exposes its immutable package and metadata without creating or modifying a Project Entity
