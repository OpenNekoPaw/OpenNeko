## MODIFIED Requirements

### Requirement: Model resources are projected through exact panel-scoped authorization

Desktop Main SHALL validate the primary source and enumerate only the local companion resources
declared by the standard source format. Every projected file MUST remain inside an authorized root,
MUST be registered through the view-scoped Desktop exact-resource registry, and MUST be revoked when
the Preview session closes. The stable source identity SHALL remain a validated `ContentLocator`;
the transient `openneko://resource` URL or resource-set entry MUST NOT become content identity.
Remote HTTP(S) dependencies, traversal, absolute dependency references, undeclared companion reads,
oversized dependency graphs, and unsupported MIME or extension combinations MUST fail visibly
before Three.js loads them.

#### Scenario: Load a GLB source

- **WHEN** a valid GLB file is opened from an authorized source root
- **THEN** Desktop Main registers exactly the GLB source and sends the Preview surface a typed
  descriptor containing its stable `ContentLocator`, fingerprint, format, and transient authorized
  entry URL

#### Scenario: Load a glTF bundle

- **WHEN** a valid glTF file declares relative buffers or image resources inside the authorized source root
- **THEN** Desktop Main freezes those declared resources into one exact resource set and supplies an
  `openneko://resource` entry URL that resolves only those dependencies

#### Scenario: Reject an unsafe model dependency

- **WHEN** a glTF, OBJ, or MTL source declares a remote URL, an absolute dependency, traversal outside the authorized root, or a missing companion file
- **THEN** Desktop Main returns a source-projection diagnostic and the Preview surface does not
  attempt a network request or substitute an unrelated resource
