## Why

OpenNeko currently mixes synchronized project facts, machine-local Media Library links, rebuildable
composition projections, and presentation state under paths and JSON roots that can block an entire
Workspace when one local record is absent or invalid. The storage boundary must make project `.neko/`
explicitly disposable while ensuring synchronized projects never depend on it or leak its machine-local
paths, identities, permissions, or connection state.

## What Changes

- **BREAKING**: Establish three canonical storage scopes: synchronized project facts and owned bytes,
  disposable project-local `.neko/` state, and user-global `~/.neko/` state. Project `.neko/` is created
  on demand, excluded from sync/package, and safe to delete and initialize from canonical defaults.
- **BREAKING**: Replace Media Library references encoded as `workspace-file` paths below
  `neko/assets/<libraryName>/` with one owner-qualified Media Library content locator containing only a
  portable logical library name, relative descendant, and optional content fingerprint.
- Replace the project OS link with one strict package-owned binding record below
  `<workspace>/.neko/media-libraries/`; it may identify an already authorized user-global connection
  but may not contain its physical target. Keep the physical connection under `~/.neko/media-libraries/`;
  neither target, global connection identity, authorization, nor `.neko` path may enter project facts,
  Renderer state, diagnostics, sync, or package output.
- Derive required libraries from synchronized owner references. Missing or corrupt project-local
  bindings reinitialize as `required-unlinked`; the Workspace remains open and only exact dependent
  media operations are unavailable until the user confirms a binding.
- Keep ordinary project sync lightweight and target-free. Make portable project packaging collect only
  authoritative referenced external media into project-owned paths, rewrite only the staged copy, and
  publish atomically after full validation.
- **BREAKING**: Retire `neko/project-composition.json` as a monolithic authority. Keep project identity,
  Entity-to-Character associations, and any other irreducible user decisions as independently owned
  synchronized facts; derive local Character/World membership, dependency summaries, navigation trees,
  Resource usage, and Project Content as fail-local projections.
- Keep Asset Library as one user-global manifest-backed package owner. Projects synchronize only exact
  Asset revision pins; no workspace Asset Library or filesystem discovery authority is introduced.
- Protect `neko/` and other package-owned project facts from generic Resource Browser trash/rename
  operations, and add path-level tests preventing `.neko` or resolved target information from being
  serialized into project data.
- Preserve unsupported existing bytes. Provide no product runtime dual reader, fallback resolver, or
  automatic migration; any necessary conversion is an explicit, exact-target, backed-up,
  product-unreachable offline operation.

## Capabilities

### New Capabilities

- `project-storage-partition`: Defines synchronized project facts, disposable project-local `.neko/`
  state, user-global state, initialization, exclusion, data-protection, and leakage boundaries.
- `project-composition-facts`: Replaces the monolithic composition file with independently owned project
  facts and rebuildable, entry-isolated membership/dependency/content projections.
- `project-media-library-binding`: Defines owner-qualified Media Library locators, project-local
  binding, global connection resolution, recovery, synchronization, and atomic portable packaging.

### Modified Capabilities

- `local-storage-authority-policy`: Recognizes bounded project `.neko/` state as a canonical disposable
  local authority instead of treating every workspace `.neko/` path as retired product data.
- `media-library-resource-entry`: Reads linked media through the Media Library locator and local binding
  owner instead of treating `neko/assets/<libraryName>/` as an ordinary workspace-file path.

## Impact

- `@neko/project` owns the new project fact contracts and projections; `@neko/project-node` owns
  authorized atomic repositories for irreducible synchronized Project facts and deletes the
  `project-composition.json` success path.
- `@neko/content` owns the single canonical Media Library locator and dispatch contract;
  `@neko/assets-domain` owns binding/recovery/portability policy; `@neko/assets-node` owns bounded Node
  link inspection, content access, staging, and filesystem mutation.
- `@neko/local-metadata` owns the storage classification/layout contract and user-global SQLite
  projections. Package owners retain their narrow project-local presentation/config/cache codecs;
  neither Local Metadata nor Desktop becomes a generic `.neko` settings authority.
- Chara, World, Entity, Canvas, Cut, Search, Project Content, Resource Browser, Agent content references,
  package/export, sync, and fixtures change atomically to the canonical fact and locator shapes.
- `apps/neko-desktop` remains the Electron trust and composition boundary: it authorizes the exact
  Workspace/sender, wires package ports, resolves native paths inside Main, and projects target-free
  diagnostics. It does not own media binding policy, composition facts, or recovery decisions.
- Existing `neko/assets` links, `workspace-file` linked-media locators, and
  `neko/project-composition.json` bytes remain untouched until explicitly converted offline; there is no
  compatibility alias, dual read/write, automatic relink, or active/current Workspace fallback.
