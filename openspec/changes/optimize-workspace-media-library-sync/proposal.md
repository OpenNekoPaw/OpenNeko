## Why

Workspace Media Library links keep large shared media out of each project, but the machine-local
symlink and its target do not travel with Git or ordinary project synchronization. A synchronized or
cloned project therefore retains portable `neko/assets/<libraryName>/...` references while losing the
information needed to explain, validate, and efficiently restore the required libraries.

## What Changes

- Derive a project-scoped Media Library requirement projection from authoritative persisted
  `ContentLocator` references owned by Canvas, Cut, Entity representations, and other registered
  project-document owners.
- Diagnose required, linked, unavailable, partially matching, and unreferenced library states without
  introducing `library.json`, a target registry, absolute paths, or a second runtime resolver.
- Add an explicit recovery flow that matches an exact library name against the machine-local global
  Media Library registry, validates referenced descendants, and creates or replaces the workspace
  symlink only after user confirmation.
- Preserve the current two-level link topology so one global relink can repair every project that
  points at the global connection, while exposing which layer is missing without leaking targets.
- Add a portability readiness check and an explicit collect operation that copies only referenced
  linked media into project-owned storage, verifies fingerprints, and atomically rewrites owning
  documents when a self-contained project is required.
- Store only rebuildable requirement freshness/diagnostics, referenced-media probe cache, and
  resumable snapshot task/checkpoints in the existing user-level `~/.neko/neko.db`; recompute
  current link availability from OS inspection and do not create a symlink JSON manifest, workspace
  database, target-mapping row, or JSON fallback.
- Keep normal project synchronization lightweight: links and target bytes remain machine-local, while
  package/export continues to dereference explicitly referenced bytes.
- Reject implicit whole-library copying, basename guesses, similarly named fallback directories,
  silent automatic authorization, and partial collect success.

## Capabilities

### New Capabilities

- `workspace-media-library-sync-recovery`: Project requirement derivation, safe missing-link
  diagnostics, exact-name recovery planning, confirmed relink, portability readiness, and
  reference-scoped project collection.

### Modified Capabilities

- `media-library-resource-entry`: Extend the filesystem-derived Media Library surface with derived
  required-but-unlinked states and explicit recovery/collect actions while preserving the OS link as
  the only runtime target mapping.

## Impact

- Shared contracts and host-neutral aggregation in `packages/shared`.
- Assets Resource Browser projections and interactions in `packages/assets/domain`.
- Desktop Main project-document composition, global Media Library matching, link mutation, content
  access, copy staging, and typed IPC in `apps/neko-desktop`.
- Canvas, Cut, Entity representation, and future project-document owners that expose portable content
  references through a minimal read/rewrite contract.
- Project sync, package/export, path authorization, Git-local link exclusion, diagnostics, and
  isolated Electron Desktop acceptance coverage.
- Existing local-metadata projection versions, referenced-media metadata, tasks, and task checkpoints
  in the user-level SQLite store; broader Desktop shell-state and application-settings JSON
  migration is intentionally deferred to a separate persistence change.
