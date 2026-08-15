## ADDED Requirements

### Requirement: Media Library locator is portable and owner-qualified

The canonical Content contract SHALL define a Media Library locator containing only exact logical
library name, normalized relative descendant, and optional content fingerprint. Project facts MUST NOT
encode linked media as a workspace-file path, `.neko` path, `neko/assets` path, physical target, global
connection identity, provider path, or runtime resource.

#### Scenario: Canvas persists linked media

- **WHEN** a user adds `shots/a.mov` from logical library `Footage` to Canvas
- **THEN** Canvas persists a canonical Media Library locator for `Footage` and `shots/a.mov`
- **AND** the project document contains no local binding or physical target information

#### Scenario: Canvas persists an entry from a linked document

- **WHEN** a Canvas image refers to an entry inside an EPUB or CBZ stored in logical library `Books`
- **THEN** the document-entry locator retains the entry path and uses the Media Library locator as its
  exact container source
- **AND** Host reading authorizes that container through the Project binding before reading the entry

### Requirement: Project binding is target-free disposable local state

Assets SHALL own one strict project-local binding record per logical Media Library below project
`.neko/`. The record MAY identify one already authorized user-global connection but MUST NOT contain a
physical target, credential, mount, runtime URL, or project fact. Missing local binding state SHALL
initialize empty.

#### Scenario: Binding directory is deleted

- **WHEN** valid synchronized Media Library locators exist and `.neko/media-libraries/` is absent
- **THEN** Assets initializes an empty local binding set and derives the libraries as required-unlinked
- **AND** it does not change project references or global connections

#### Scenario: One binding record is invalid

- **WHEN** one local binding is malformed beside a valid binding
- **THEN** Assets preserves and diagnoses only the malformed binding
- **AND** the valid library remains readable

### Requirement: Media resolution has one exact authorized chain

Host media access SHALL resolve an exact Media Library locator through the exact Project-local binding
and exact authorized user-global connection, then enforce relative-path and final-realpath containment.
It MUST NOT try an active Workspace, same-name path, recent target, old project link, cache, alternate
provider, or raw absolute path when any step fails.

#### Scenario: Global connection is unavailable

- **WHEN** the exact project binding exists but its user-global connection target is unavailable
- **THEN** the current media request returns a target-free connection diagnostic
- **AND** no alternate connection or filesystem path is attempted

### Requirement: Required libraries are derived from project references

Assets SHALL derive required logical libraries and referenced descendants from current authoritative
project-document readers. Requirement membership MUST remain a rebuildable projection and MUST NOT be
persisted as a project manifest, binding fact, or target registry.

#### Scenario: Synchronized project opens on a new machine

- **WHEN** project facts reference `Footage/shots/a.mov` and no project-local binding exists
- **THEN** Media Library reports `Footage` as required-unlinked with the exact owner/reference count
- **AND** Project Files, Character, World, Agent, and unrelated media remain available

### Requirement: Rebinding requires an immutable confirmed plan

Binding or rebinding SHALL create an immutable plan against exact Project identity, current reference
fingerprints, current local binding state, exact user-global connection identity, and contained referenced
descendants. Apply MUST require explicit user confirmation and MUST reject cancellation or stale input
without mutation.

#### Scenario: Exact-name global candidate exists after local reset

- **WHEN** a required logical library has one exact-name authorized global candidate containing every
  referenced descendant
- **THEN** the UI may offer that candidate without exposing its target
- **AND** no local binding is written until the user confirms the exact plan

### Requirement: Normal project sync never transfers bindings or external bytes

Product-owned project sync SHALL transfer project facts, project-owned files, and logical Media Library
locators while excluding project `.neko`, user-global connections, external Media Library bytes,
credentials, and physical targets. The resulting project SHALL remain open and report missing local
bindings explicitly.

#### Scenario: Clone project without Media Library state

- **WHEN** a synchronized project is opened without `.neko` and without its external Media Library bytes
- **THEN** project facts and owned files load normally while exact external references report unbound
- **AND** the product does not claim the clone is self-contained

### Requirement: Portable packaging materializes only referenced external media

Portable packaging SHALL create an independent staging copy, exclude all local state, collect only
currently authoritative referenced Media Library bytes into project-owned paths, rewrite only staged
owner documents to workspace-file locators, validate fingerprints and forbidden-value absence, and
publish through one atomic rename. It MUST NOT mutate the source project or external library.

#### Scenario: Portable package succeeds

- **WHEN** every referenced external byte and owner fingerprint remains valid through collection
- **THEN** the published package contains project-owned copies and no Media Library locator or local
  binding is required to open those collected resources
- **AND** unreferenced library bytes are absent

#### Scenario: Referenced byte disappears during collection

- **WHEN** one required external byte becomes missing or changes fingerprint before publish
- **THEN** staging is removed and no final package is published
- **AND** source project facts and external contents remain unchanged

### Requirement: Existing replaced bytes are converted only offline

Existing `neko/assets` project links, linked-media workspace-file locators, and project-local binding data MUST
remain untouched by product startup and ordinary readers. Any conversion MUST be an exact-target,
explicitly confirmed, backed-up, atomic, validated, product-unreachable offline operation.

#### Scenario: Product opens an unconverted linked-media record

- **WHEN** a project document contains the replaced `workspace-file` linked-media shape
- **THEN** the owning document reports the unsupported record and preserves its bytes
- **AND** Content does not route it through the new Media Library handler or an old link fallback

#### Scenario: Offline conversion recognizes an earlier composition without associations

- **WHEN** an exact retired composition contains identity, local targets, and dependencies but predates
  Entity-to-Character association storage
- **THEN** the offline inspector recognizes the bounded shape as having no association facts
- **AND** conversion still requires the exact fingerprint, confirmation, backup, and canonical
  post-validation
