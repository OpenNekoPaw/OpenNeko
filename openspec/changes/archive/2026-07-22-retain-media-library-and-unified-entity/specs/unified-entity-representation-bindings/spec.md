## ADDED Requirements

### Requirement: Creative Entity is the only semantic identity authority
Character, scene, object, location, and style identity, names, aliases, state, semantic metadata, merge, and deprecation SHALL be owned only by Creative Entity. Media Library files and resource packages MUST NOT create a second semantic entity authority.

#### Scenario: Discover a character-named image
- **WHEN** Media Library discovers a file whose name resembles an existing or possible character
- **THEN** it may emit search or candidate evidence but does not create, rename, merge, or confirm a Creative Entity

### Requirement: Entity representations bind directly to resources
An EntityRepresentationBinding SHALL reference a closed durable representation target consisting of a workspace-file locator, document-entry locator, generated-output identity, or package-owned representation reference. It MUST NOT require or contain an AssetEntity ID, `project://assets/` URI, cache path, runtime token, or physical link target.

#### Scenario: Bind a linked image
- **WHEN** a user confirms a portrait binding to `neko/assets/Characters/alice.png`
- **THEN** the binding persists the workspace-file representation reference directly and resolution uses the normal content read path

#### Scenario: Bind a generated representation
- **WHEN** a user confirms a generated image as an entity representation
- **THEN** the binding retains the generated-output identity and revision/digest preconditions without promoting it into an Asset catalog

#### Scenario: Bind a document entry
- **WHEN** a user binds an image or media entry inside a supported document archive
- **THEN** the binding persists the stable document source and entry locator and consumers remain unaware of archive extraction or cache paths

### Requirement: Genuine composites use package-owned references
A representation that requires multiple files SHALL use a narrow package-owned manifest/reference defining file roles and capabilities. The package MUST NOT contain Creative Entity semantic identity or recreate a generic AssetEntity hierarchy.

#### Scenario: Bind a Live2D package
- **WHEN** a validated Live2D package provides model, texture, and motion roles
- **THEN** the entity binding references the package representation and the package owner resolves its members

### Requirement: Missing or changed path-addressed content becomes orphaned
An ordinary workspace-file binding SHALL be validated against its locator and any stored fingerprint precondition. Missing or mismatched content MUST make the binding visibly orphaned and MUST NOT trigger automatic path replacement, fingerprint relocation, or legacy catalog fallback.

#### Scenario: Bound file moves
- **WHEN** a bound workspace or linked file no longer exists at its persisted locator
- **THEN** the binding becomes orphaned and presents explicit rebind without modifying the Creative Entity or searching for a successful fallback

#### Scenario: Similar file is found
- **WHEN** Search finds a fingerprint or filename candidate for an orphaned binding
- **THEN** it may present a rebind suggestion but cannot update the confirmed binding until the user explicitly accepts it

### Requirement: Binding lifecycle is independent of resource lifecycle
Binding, unbinding, orphaning, and entity deprecation SHALL NOT delete resource bytes, Media Library links, generated outputs, packages, or Creative Entity identity. Resource deletion SHALL NOT delete the Creative Entity.

#### Scenario: Unbind a portrait
- **WHEN** a user removes a confirmed portrait binding
- **THEN** only the binding fact changes and the referenced file or package remains unchanged

#### Scenario: Referenced file is deleted explicitly
- **WHEN** an authorized user deletes a referenced file through its owning file operation
- **THEN** the entity remains and the related binding becomes orphaned
