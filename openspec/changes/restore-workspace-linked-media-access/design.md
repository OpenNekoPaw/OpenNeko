## Context

The accepted Media Library design separated four concerns:

1. portable project content identity (`MediaLibraryContentLocator`);
2. target-free project-local authorization (`.neko/media-libraries` binding);
3. reusable user-global directory registration (`~/.neko/media-libraries` connection);
4. physical contained file access (the Assets/Content Host boundary).

The current worktree replaced that chain with `workspace-file:neko/assets/...` plus a symlink as the only
fact. This deleted binding, recovery and content-handler services and forced Canvas, Cut, Entity, Search,
Text Editor, packaging and Agent onto a Workspace-path interpretation. The observed hierarchy and Agent
failures are symptoms of the broken ownership chain, not isolated UI defects.

The product requirement that Agent only sees Workspace files remains valid. It is implemented by adding a
managed Workspace projection at the Agent boundary, not by changing every domain's durable identity.

## Goals / Non-Goals

**Goals:**

- Preserve the original global catalog, project binding, media identity, availability, recovery and
  portability design.
- Make every authorized project Media Library available through a managed link/junction below
  `neko/assets/<libraryName>` for Workspace-restricted consumers.
- Simplify user decisions while retaining explicit internal ownership and validation.
- Make missing `.neko` state reinitializable and keep invalid records/link conflicts fail-local.
- Keep one successful physical read chain and reject direct target, active Workspace and name-based
  fallbacks.

**Non-Goals:**

- Treating a symlink as a global registration, project fact or Media Library identity.
- Letting a project directly authorize an unregistered directory.
- Exposing global connection IDs, `.neko`, physical targets or native handles to Renderer or Agent.
- Copying whole libraries during association or normal synchronization.
- Merging ordinary Media Library files with versioned Asset packages or Project Entity facts.

## Decisions

### 1. Restore the layered owner chain

The canonical model is:

```text
Project fact
  MediaLibraryContentLocator(libraryName, relativePath)
        |
        v
Project-local authorization
  .neko/media-libraries/<libraryName>.json
  { projectId, libraryName, connectionId, bindingFingerprint }
        |
        v
User-global registration
  ~/.neko/media-libraries/<connection>
  { logical identity -> authorized physical directory }
        |
        v
Workspace access projection
  neko/assets/<libraryName> -> exact registered target
        |
        v
Contained physical descendant
```

No layer substitutes for another. Project facts are synchronized and portable. Bindings and links are
machine-local and reconstructible. The global connection owns the physical target authorization. The link
is a Host-created access projection used by Workspace-restricted consumers.

### 2. Simplify user intent, not implementation ownership

Media Library is an optional high-value capability, not a prerequisite for ordinary authoring. Project
files remain the default for documents and imported files. External media is used only when the user
explicitly keeps a large or reusable directory outside the project; semantic cross-project reuse such as
Character, World and Entity belongs to Assets/domain owners rather than this file catalog.

The project Resource Browser exposes two actions:

- **Associate global Media Library**: choose one already registered global directory, create the exact
  project binding, then materialize and validate its managed Workspace link.
- **Add directory to Media Library**: choose a native directory, register it in the user-global catalog,
  create the project binding, then materialize the same link.

The second operation is atomic across newly created global registration and project association: on
failure, it removes only the newly created global record and leaves existing records, links and bytes
unchanged. Project remove deletes the project binding and managed link only; global removal is a separate
global-management operation.

Users never choose between copy, binding, locator or symlink strategies. Those are fixed product rules.
Creating or opening a project never requires a Media Library, and discovering an ordinary directory does
not register or promote it automatically.

### 3. `.neko` is disposable local authorization with deterministic initialization

The binding record remains target-free and package-owned. A missing `.neko/media-libraries` directory
initializes as empty without affecting project open, facts or unrelated capabilities. One invalid record is
preserved and diagnosed without clearing valid siblings.

Initialization may recover a missing binding from an existing managed link only when all of the following
are true:

1. the link is a direct child of `neko/assets` with a safe name;
2. its resolved target exactly matches one available registered global connection;
3. current project facts require that logical library name; and
4. no existing binding or conflicting path exists.

This is a bounded reconstruction of non-authoritative local state, not a normal read fallback. Zero or
multiple matches require explicit user association. A binding/link mismatch is an `entry-conflict`; the
system does not select either side or overwrite a regular directory.

### 4. Media identity remains canonical; managed links provide Agent projection

Canvas, Cut, Entity representation, Search, Resource Browser, document-entry and portable snapshot keep
`MediaLibraryContentLocator`. The locator contains only logical library name, portable relative path and an
optional fingerprint.

Project-to-Agent attachment and mention producers map an already authorized media locator to:

```ts
{ kind: 'workspace-file', path: 'neko/assets/<libraryName>/<relativePath>' }
```

Agent receives only this Workspace locator and its exact sender-bound Workspace grant. It never receives a
Media Library locator, binding, global identity or target. This projection is not persisted back into
Canvas, Cut, Entity or package facts.

### 5. One physical read path uses the managed link

The Media Library content handler does not read the global target directly. It:

1. validates the logical locator;
2. resolves the exact project binding;
3. resolves the exact registered global connection;
4. verifies the direct managed Workspace link exists and points to that target;
5. authorizes the requested final path against the link target; and
6. delegates bytes/stat/range reads to the shared Content service through that resolved path.

Agent begins at step 4 with a sender-bound Workspace locator and uses the same managed-link guard. Normal
Workspace files remain inside the Workspace realpath. Unmanaged links, broken links, regular-directory
conflicts, mismatched global targets and nested escapes reject only the current resource.

There is no direct-target fallback, similarly named connection lookup, active/recent Workspace fallback,
raw path bypass or try-next reader.

### 6. Resource Browser is an owner-preserving projection

Resources remains `Project files | External media | Assets`:

- Project files: ordinary Workspace-owned files.
- External media: project-authorized global Media Libraries and their ordinary files.
- Assets: explicitly imported/installed versioned Asset packages.

These filters do not merge their authorities. Media roots use stable library identity; direct children
reference the included root, deeper children reference included directories, and query results are flat.
Projection decoding validates unique IDs, parent closure and cycles before Renderer tree rendering. An
invalid record or library contributes a local diagnostic while valid siblings and the surrounding Desktop
panel remain usable.

### 7. Sync and portability preserve the original semantics

Normal project sync includes authoritative project documents containing logical Media Library locators.
It excludes root `.neko`, managed link entries and external target bytes. Git ignore/exclude is advisory;
product traversal rules are authoritative.

On another machine, missing local authorization yields `required-unlinked` while the project remains open.
Users may choose a global library or register a directory. Explicit portable snapshot remains separate: it
collects only referenced bytes through the canonical content handler, validates fingerprints, rewrites only
staged project facts to project-owned Workspace files and publishes atomically.

## Ownership map

| Responsibility                  | Owner                                             | Persistent authority                          | Rebuildable projection             |
| ------------------------------- | ------------------------------------------------- | --------------------------------------------- | ---------------------------------- |
| Media file identity             | Project document owner + `@neko/content` contract | `MediaLibraryContentLocator` in project facts | Resource/Search rows               |
| Project authorization           | `@neko/assets-domain` / `@neko/assets-node`       | target-free `.neko` binding                   | availability/recovery projection   |
| Physical directory registration | user-global Assets runtime                        | global Media Library connection               | global catalog UI                  |
| Workspace access                | Assets Node + Content Host guard                  | none                                          | `neko/assets/<name>` link/junction |
| Agent handoff                   | Agent/Assets application boundary                 | conversation attachment locator only          | sender-bound Workspace locator     |
| Native picker and sender trust  | Desktop Main                                      | none                                          | one request-scoped selection       |

## Risks / Trade-offs

- Raw filesystem tools can expose a symlink target. Product sync/package never serializes links, targets or
  `.neko`; external tools remain outside product control.
- Binding and link can diverge after manual filesystem edits. The exact pair is checked on every dependent
  operation; mismatch is fail-local and requires repair.
- Windows junction/UNC semantics need platform-specific integration evidence.
- Restoring the old modules requires an atomic producer/consumer switch; partial restoration would create
  dual successful paths and is prohibited.

## Migration / Recovery Plan

1. Restore the deleted contracts and services from the accepted baseline.
2. Add link materialization/validation to binding lifecycle without changing durable media locators.
3. Atomically restore all domain producers/consumers and remove symlink-only Workspace-path facts.
4. Reconcile current local state: preserve records and files, adopt only exact registered links, diagnose
   ambiguous/conflicting state, and never rewrite project facts silently.
5. Restore Resource Browser operations and hierarchy contract.
6. Run path-level, package, Desktop UI and Agent evaluation gates before treating prior evidence as valid.

## Open Questions

None for ownership. Product terminology may call the user-global directory catalog “全局媒体库” or “全局素材
目录”, but it must remain distinct from versioned installed Asset packages in contracts and persistence.
