## ADDED Requirements

### Requirement: Media libraries are direct workspace links
The system SHALL represent each local media library as a Git-ignored direct symlink or platform-equivalent junction at `neko/assets/<libraryName>`. The link filename and OS link target MUST be the only runtime mapping facts.

#### Scenario: Add a media library
- **WHEN** a user selects an accessible local directory and a portable non-conflicting library name
- **THEN** the Host creates `neko/assets/<libraryName>` as a directory link and adds an exact local ignore rule without writing target settings or registry state

#### Scenario: Enumerate media libraries
- **WHEN** the Host or UI lists media libraries
- **THEN** it derives names and availability from `readdir`, `lstat`, and `stat` of direct `neko/assets/` children

### Requirement: Media files use ordinary workspace paths
Every linked media file SHALL use a normalized workspace-relative path such as `neko/assets/Footage/shot/a001.mov`. PathResolver and consumers MUST NOT require a media-library variable, library ID, source kind, or target map.

#### Scenario: Resolve a linked file
- **WHEN** an existing Host content path opens a valid `neko/assets/<libraryName>/<relativePath>` source
- **THEN** ordinary workspace resolution produces the link path and the OS follows the link when opening the file

#### Scenario: Agent refers to linked media
- **WHEN** Agent obtains a media path from workspace tree, Search, or file listing
- **THEN** it uses the exact `neko/assets/...` path without receiving `${VAR}`, library ID, target, or cache path

#### Scenario: Rebuild an incompatible derived search projection
- **WHEN** the local media-library search partition contains a `${VAR}`, absolute, cache, or otherwise non-portable file key
- **THEN** the Host treats the whole derived partition as missing, rebuilds it from current workspace links, and exposes only `neko/assets/...` paths

#### Scenario: Render a linked media file in an Assets tree
- **WHEN** a media-library, managed Asset, or recent Asset TreeItem represents a descendant of `neko/assets/<libraryName>`
- **THEN** it retains its open/preview command URI but does not register that URI for workspace Git decoration

#### Scenario: Mitigate built-in Git decoration failure
- **WHEN** linked libraries exist and VS Code Git decorations remain enabled for the workspace
- **THEN** Assets explains that Git cannot inspect symlink descendants and offers an explicit action to disable Git decorations for that workspace without changing global settings, target paths, or content URIs

#### Scenario: Rebuild search after a link mutation
- **WHEN** a media library link is added, removed, or atomically relinked
- **THEN** the Host rebuilds the whole derived media-library search partition from the current links before serving another search and does not reload the pre-mutation partition

### Requirement: Link management is a bounded filesystem helper
Adding, replacing, and removing a linked library MUST be bounded filesystem operations and MUST NOT introduce a mount lifecycle service, target settings owner, background repair service, or virtual filesystem.

#### Scenario: Relink a broken library
- **WHEN** the user selects a replacement target for an existing library name
- **THEN** the Host explains that the replacement must preserve relative directory structure, validates the target, and atomically replaces only the link without guessing or rewriting project references

#### Scenario: Active document preview source disappears after relink
- **WHEN** an active document preview requests an archive entry after its linked source path becomes unavailable
- **THEN** the preview transport returns a safe source-unavailable response without exposing the target or producing an unclassified 500 for every entry

#### Scenario: Remove a linked library
- **WHEN** the user removes a library link
- **THEN** the Host deletes only the link and never mutates or deletes the target directory

### Requirement: Workspace movement preserves source identity
Moving or renaming the workspace MUST NOT rewrite linked media source paths when absolute-target links remain valid.

#### Scenario: Move the workspace
- **WHEN** the workspace moves while the target remains at the same location
- **THEN** `neko/assets/<libraryName>/...` continues to resolve without settings migration or project rewrite

#### Scenario: Target becomes unavailable
- **WHEN** the target is moved, unmounted, deleted, or denied
- **THEN** reads fail visibly with a safe linked-library-unavailable diagnostic and do not fall back to stored or similarly named paths

### Requirement: Linked access has a minimal Host guard
The workspace file boundary MUST reject absolute/traversal paths and MUST allow physical workspace escape only through a direct `neko/assets/<libraryName>` link whose final requested realpath remains beneath that link target.

#### Scenario: Read a valid linked descendant
- **WHEN** a normalized request crosses a direct library link and final realpath remains beneath its target
- **THEN** the Host authorizes only that file without persisting or projecting the target

#### Scenario: Traverse an unmanaged symlink
- **WHEN** a request crosses another workspace symlink outside the linked-library namespace
- **THEN** the Host rejects it under normal workspace containment

#### Scenario: Nested link escapes the library
- **WHEN** a descendant symlink resolves outside the top-level library target
- **THEN** the Host rejects the request before returning bytes, runtime projection, or physical details

### Requirement: Link targets do not enter source control or packages
Library links and target strings MUST NOT be committed or packaged, while `library.json` and unrelated real project assets retain existing source-control behavior.

#### Scenario: Create a link in Git workspace
- **WHEN** link creation completes
- **THEN** an exact ignore rule prevents the link object and target string from entering the index without broadly ignoring unrelated asset content
