# media-library-resource-entry Specification

## Purpose
TBD - created by archiving change retain-media-library-and-unified-entity. Update Purpose after archive.
## Requirements
### Requirement: Media Library is the single file-resource entry

The product SHALL expose Media Library as the single user-visible entry for browsing, searching, opening, and diagnosing accessible file resources. It MUST NOT expose a separate Asset Library, Asset Source catalog, or membership workflow.

#### Scenario: Browse a linked media file

- **WHEN** a user browses a valid file below `neko/assets/<libraryName>/`
- **THEN** Media Library returns an entry keyed by the exact workspace-relative locator without requiring an AssetEntity or catalog record

#### Scenario: Open a non-cataloged workspace file

- **WHEN** an authorized workflow selects a supported workspace file that has never been imported
- **THEN** the file can be read, previewed, or referenced directly through the normal content locator path

### Requirement: Linked roots remain filesystem-derived

The Host SHALL derive linked Media Library roots, names, and availability from direct children of `neko/assets/`. The OS link MUST remain the only target mapping fact, and the system MUST NOT persist a link target registry, AssetSource record, variable, or library ID for runtime resolution.

#### Scenario: Enumerate linked roots

- **WHEN** Media Library refreshes its root list
- **THEN** it derives each root from filesystem inspection and exposes only its safe name, workspace path, availability, and projected capabilities

#### Scenario: Linked target is unavailable

- **WHEN** a direct Media Library link is broken or inaccessible
- **THEN** the root is reported unavailable with a safe relink diagnostic and no settings or similarly named path is used as fallback

#### Scenario: Link a library in a non-Git workspace

- **WHEN** Git explicitly reports that the workspace is not part of a repository
- **THEN** add, relink, and remove continue as bounded filesystem operations without creating Git state or weakening path authorization

#### Scenario: Git repository exclude cannot be verified

- **WHEN** the workspace belongs to a Git repository but its exact local link exclude cannot be resolved, written, or verified
- **THEN** add or relink fails visibly before changing the canonical link mapping

#### Scenario: VS Code Git encounters a linked Media Library

- **WHEN** at least one managed Media Library symlink or junction exists and the user accepts the compatibility action
- **THEN** the Host writes `git.enabled = false` only at the owning `WorkspaceFolder` scope and records ownership of that exact write

#### Scenario: Workspace has no linked Media Library

- **WHEN** no managed Media Library symlink or junction exists and the Host has no owned Git compatibility write
- **THEN** the Host does not prompt and does not modify any Git configuration

#### Scenario: Remove the final linked Media Library

- **WHEN** the last managed link is removed and the current folder-level `git.enabled` value is still the plugin-owned `false`
- **THEN** the Host restores the recorded prior folder value or removes its setting to restore inheritance

#### Scenario: User changes Git after compatibility handling

- **WHEN** the current folder-level `git.enabled` value no longer equals the plugin-owned `false`
- **THEN** cleanup preserves the user's value and relinquishes plugin ownership without writing Git configuration

### Requirement: Media entries are rebuildable projections

Media Library tree, search, recent-use, technical metadata, and availability entries SHALL be rebuildable projections keyed by canonical locator and fingerprint. Discovery MUST NOT create Creative Entities, representation bindings, Asset IDs, or project membership facts.

#### Scenario: Discover a new file

- **WHEN** a filesystem event or bounded reconciliation discovers a supported file
- **THEN** Media Library refreshes the file projection without writing `library.json`, creating an entity, or creating a binding

#### Scenario: Rebuild stale projections

- **WHEN** a projection contains a legacy Asset ID, variable path, absolute target, cache path, or stale fingerprint
- **THEN** the affected projection is discarded and rebuilt from current canonical locators rather than repaired through legacy data

### Requirement: Resource origins do not create alternate path resolvers

Workspace, linked, cloud-synchronized local directories, generated outputs, documents, and external packages MUST retain their existing access and ownership contracts. Media Library MAY project their resources in one surface, but MUST NOT route reads through a closed AssetSource-kind registry.

#### Scenario: Read a cloud-synchronized linked file

- **WHEN** a provider has synchronized content to a local directory linked below `neko/assets/`
- **THEN** the file is read through its ordinary workspace locator while provider credentials and sync lifecycle remain outside Media Library path resolution

#### Scenario: Display a generated output

- **WHEN** a durable generated result is included in Media Library search or recent views
- **THEN** the view retains the generated-output owner's identity and does not register an AssetEntity or copy it into a media catalog

### Requirement: File mutations express explicit user intent

Adding, relinking, removing, copying into, or deleting from Media Library SHALL use distinct operations with explicit ownership and authorization. Removing a library MUST delete only the link; copying or deleting through a linked directory MUST be treated as mutation of the external target.

#### Scenario: Remove a Media Library

- **WHEN** the user confirms removal of a linked library
- **THEN** the Host removes only the workspace link and never deletes or modifies target contents

#### Scenario: Copy a generated result into a library

- **WHEN** the user explicitly selects a writable Media Library destination and conflict policy
- **THEN** the owning file operation copies bytes to that destination without creating Asset catalog membership or changing the generated source identity

#### Scenario: Reject implicit target mutation

- **WHEN** a workflow lacks an explicit writable target or delete intent
- **THEN** Media Library rejects the mutation with a visible diagnostic and does not infer permission from a link or previous catalog membership

### Requirement: Cache and physical paths remain internal

Media Library contracts MUST NOT expose ResourceCache providers, cache roots, materialization status, physical link targets, absolute source paths, Webview URLs, or Engine tokens as persistent identity.

#### Scenario: Request a thumbnail

- **WHEN** Media Library requests a thumbnail for an entry
- **THEN** it uses the semantic representation port and persists only the source locator, never the cache location or runtime projection
