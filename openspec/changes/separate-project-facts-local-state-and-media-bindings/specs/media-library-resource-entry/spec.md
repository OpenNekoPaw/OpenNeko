## MODIFIED Requirements

### Requirement: Media Library is the single file-resource entry

The product SHALL expose Media Library as the direct user-visible entry for browsing, searching,
opening, and diagnosing ordinary linked file resources. Files, Media, and the distinct manifest-backed
Asset Library MAY appear as owner-preserving Resource Browser sources, but Media access MUST NOT require
Asset membership, create an Asset/Entity/Character/World identity, or use Asset Library as a fallback
resolver.

#### Scenario: Browse a linked media file

- **WHEN** a user browses a valid descendant from a bound logical Media Library
- **THEN** Media Library returns an entry keyed by the exact Media Library locator without requiring an
  Asset or catalog membership record

#### Scenario: Open a non-cataloged workspace file

- **WHEN** an authorized workflow selects a supported project file that has never been imported
- **THEN** the file can be read, previewed, or referenced directly through the workspace-file locator
- **AND** it is not converted into a Media Library or Asset identity

### Requirement: Resource origins do not create alternate path resolvers

All resource origins MUST retain their owner-qualified access contracts, including Workspace files,
Media Library locators, provider-synchronized local directories, generated outputs, documents, and
installed packages. Resource Browser
MAY project them in one surface, but MUST NOT route reads through a closed AssetSource-kind registry,
generic path resolver, active Workspace, or try-next chain.

#### Scenario: Read a cloud-synchronized linked file

- **WHEN** a provider has synchronized content into an authorized user-global Media Library connection
- **THEN** the file is read through its Media Library locator and exact project-local binding
- **AND** provider credentials and sync lifecycle remain outside Content and project facts

#### Scenario: Display a generated output

- **WHEN** a durable generated result is included in Resource search or recent views
- **THEN** the view retains the generated-output owner's identity
- **AND** it is not registered as an Asset or converted to a Media Library locator

### Requirement: File mutations express explicit user intent

Adding, binding, rebinding, removing a project binding, copying into, or deleting from Media Library MUST
use distinct operations with explicit ownership and authorization. Removing a project binding MUST
delete only its disposable local record; copying or deleting through a resolved library MUST be treated
as mutation of the external target with an exact destination and precondition.

#### Scenario: Remove a project Media Library binding

- **WHEN** the user confirms removal of one project-local binding
- **THEN** Assets removes only that local binding record
- **AND** it never changes the user-global connection, target contents, or project references

#### Scenario: Copy a generated result into a library

- **WHEN** the user explicitly selects a writable bound Media Library destination and conflict policy
- **THEN** the owning file operation copies bytes to the exact contained destination
- **AND** it does not create Asset membership or change the generated source identity

#### Scenario: Reject implicit target mutation

- **WHEN** a workflow lacks an exact writable binding, destination, delete intent, or fingerprint
  precondition
- **THEN** Media Library rejects the mutation with a visible target-free diagnostic
- **AND** it does not infer permission from previous binding, name, cache, or Asset membership

## REMOVED Requirements

### Requirement: Linked roots remain filesystem-derived

**Reason**: Project Media Library resolution moves from machine-local symlinks inside synchronized
`neko/assets/` to one target-free project-local binding owner below disposable `.neko/`, and linked media
receives an owner-qualified locator rather than a workspace-file path.

**Migration**: Preserve old links and document bytes. Switch all production producers and consumers
atomically to the new binding/locator path; convert explicitly selected existing projects only through a
backed-up product-unreachable offline tool.
