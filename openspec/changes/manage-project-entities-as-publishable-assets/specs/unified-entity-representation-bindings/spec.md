## MODIFIED Requirements

### Requirement: Creative Entity is the only semantic identity authority

Confirmed Project Entity SHALL be the only mutable authority for character, scene, object, location, and
style identity, names, aliases, state, accepted semantic metadata, merge, and deprecation in a project.
Media Library files, ordinary Asset packages, and immutable Entity Asset snapshots MUST NOT create a
second live project semantic authority.

#### Scenario: Discover a character-named image

- **WHEN** Media Library discovers a file whose name resembles an existing or possible character
- **THEN** it may emit search or candidate evidence but does not create, rename, merge, or confirm a Project Entity

#### Scenario: Install an Entity Asset

- **WHEN** Asset Library installs an immutable Entity Asset revision
- **THEN** it exposes an instantiation source but does not create or update a Project Entity until an explicit Entity operation commits

### Requirement: Entity representations bind directly to resources

An EntityRepresentationBinding SHALL reference a closed durable representation target consisting of a
workspace-file locator, document-entry locator, generated-output identity, or package-owned representation
reference. A package-owned reference SHALL include exact Asset identity, revision/digest precondition, and
package-relative resource identity. A binding MUST NOT contain a legacy AssetEntity ID,
`project://assets/` URI, cache path, runtime token, provider URL, or physical link target.

#### Scenario: Bind a linked image

- **WHEN** a user confirms a portrait binding to `neko/assets/Characters/alice.png`
- **THEN** the binding persists the workspace-file representation reference directly and resolution uses the normal content read path

#### Scenario: Bind a generated representation

- **WHEN** a user confirms a generated image as an entity representation
- **THEN** the binding retains the generated-output identity and revision/digest preconditions without implicitly promoting it into Asset Library

#### Scenario: Bind a document entry

- **WHEN** a user binds an image or media entry inside a supported document archive
- **THEN** the binding persists the stable document source and entry locator and consumers remain unaware of archive extraction or cache paths

#### Scenario: Bind an installed Asset representation

- **WHEN** a user selects a representation owned by an installed Asset revision
- **THEN** the binding persists exact package and member identity and never the local materialized path

### Requirement: Genuine composites use package-owned references

A representation that requires multiple files SHALL use a narrow package-owned manifest/reference defining
file roles and capabilities. An ordinary composite package MUST NOT contain Project Entity semantic
identity. An Entity Asset MAY contain a frozen semantic snapshot only as an explicit `identity` Asset type;
that snapshot MUST NOT become the live Project Entity authority without instantiation.

#### Scenario: Bind a Live2D package

- **WHEN** a validated Live2D package provides model, texture, and motion roles
- **THEN** the Entity binding references the package representation and the package owner resolves its members

#### Scenario: Inspect an Entity Asset snapshot

- **WHEN** a consumer reads semantic metadata from an Entity Asset package
- **THEN** it treats the metadata as immutable publication content and routes project creation or updates through the Entity owner

### Requirement: Missing or changed path-addressed content becomes orphaned

An ordinary workspace-file binding SHALL be validated against its locator and any stored fingerprint
precondition. A package binding SHALL be validated against its exact installed Asset revision, digest, and
member. Missing or mismatched content MUST make the binding visibly orphaned or unavailable and MUST NOT
trigger automatic path replacement, latest-revision substitution, fingerprint relocation, cloud fallback,
or legacy catalog fallback.

#### Scenario: Bound file moves

- **WHEN** a bound workspace or linked file no longer exists at its persisted locator
- **THEN** the binding becomes orphaned and presents explicit rebind without modifying the Project Entity or searching for a successful fallback

#### Scenario: Similar file is found

- **WHEN** Search finds a fingerprint or filename candidate for an orphaned binding
- **THEN** it may present a rebind suggestion but cannot update the confirmed binding until the user explicitly accepts it

#### Scenario: Bound Asset has a newer revision

- **WHEN** a newer revision is installed but the binding targets an exact older revision
- **THEN** the binding remains on the older revision and exposes an explicit update workflow rather than substituting latest

### Requirement: Binding lifecycle is independent of resource lifecycle

Binding, unbinding, orphaning, and Entity deprecation SHALL NOT delete resource bytes, Media Library links,
generated outputs, Asset packages, or Project Entity identity. Resource deletion, uninstall, or remote
tombstone SHALL NOT delete the Project Entity.

#### Scenario: Unbind a portrait

- **WHEN** a user removes a confirmed portrait binding
- **THEN** only the binding fact changes and the referenced file or package remains unchanged

#### Scenario: Referenced file is deleted explicitly

- **WHEN** an authorized user deletes a referenced file through its owning file operation
- **THEN** the Entity remains and the related binding becomes orphaned

#### Scenario: Referenced Asset is uninstalled

- **WHEN** an exact package revision is no longer installed
- **THEN** the Entity remains and the package binding becomes unavailable with an explicit reinstall action
