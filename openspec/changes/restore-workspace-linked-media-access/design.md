## Context

The accepted Media Library design separated four concerns:

1. durable project content identity;
2. target-free project-local authorization (`.neko/media-libraries` binding);
3. reusable user-global directory registration (`~/.neko/media-libraries` connection);
4. physical contained file access (the Assets/Content Host boundary).

The first pass replaced content identity and authorization with `workspace-file:neko/assets/...` plus a
symlink as the only fact. The second pass overcorrected by restoring a second `MediaLibraryContentLocator`
content identity while keeping the Workspace path for Agent. That split one logical fact into two durable
identities and required producers to translate between them.

The resolution keeps the layered mount-management chain but collapses content identity to one path. The
mount-management layer (global connection, project binding, managed link) stays distinct because it owns
authorization and symlink escape protection; content consumers no longer branch on Media Library
ownership because a mounted file is an ordinary Workspace file.

## Goals / Non-Goals

**Goals:**

- Preserve the global catalog, project binding, availability, recovery and portability mount-management
  semantics.
- Make every authorized project Media Library available through a managed link/junction below
  `neko/assets/<libraryName>`.
- Use one durable workspace-relative `workspace-file` path for mounted files across every consumer.
- Simplify user decisions while retaining explicit internal ownership and validation.
- Make missing `.neko` state reinitializable and keep invalid records/link conflicts fail-local.
- Keep one successful physical read chain and reject direct target, active Workspace and name-based
  fallbacks.

**Non-Goals:**

- Treating a symlink as a global registration, project fact or content identity.
- Letting a project directly authorize an unregistered directory.
- Exposing global connection IDs, `.neko`, physical targets or native handles to Renderer or Agent.
- Copying whole libraries during association or normal synchronization.
- Merging ordinary Media Library files with versioned Asset packages or Project Entity facts.

## Decisions

### 1. Keep the layered mount-management chain, collapse content identity

The canonical model is:

```text
Durable project fact (one content identity)
  WorkspaceFileContentLocator(path: 'neko/assets/<libraryName>/<relativePath>')
        |
        v
Project-local authorization (mount management)
  .neko/media-libraries/<libraryName>.json
  { projectId, libraryName, connectionId, bindingFingerprint }
        |
        v
User-global registration (mount management)
  ~/.neko/media-libraries/<connection>
  { logical identity -> authorized physical directory }
        |
        v
Workspace access projection (mount management)
  neko/assets/<libraryName> -> exact registered target
        |
        v
Contained physical descendant
```

The mount-management layer owns authorization and escape protection; the content layer owns one portable
identity. No mount layer substitutes for another, and no layer manufactures a second content identity.

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

### 4. One content identity; mount management stays a distinct authority

Canvas, Cut, Entity representation, Search, Resource Browser, document-entry, portable snapshot and Agent
all persist the same `workspace-file` path `neko/assets/<libraryName>/<relativePath>`. There is no
`MediaLibraryContentLocator` and no media-library branch in `ContentLocator`; `DocumentEntryContentLocator.source`
is a `WorkspaceFileContentLocator`.

The binding-backed workspace path authorizer is the only mount-aware boundary. When a `workspace-file` path
falls under `neko/assets/<libraryName>`, it validates the exact binding → global connection → managed link
before authorizing the descendant. Ordinary workspace files stay on the ordinary contained-path guard.

### 5. One physical read path uses the managed link

The shared content path does not read the global target directly. For a `neko/assets/<libraryName>` path it:

1. validates the normalized workspace path;
2. resolves the exact project binding;
3. resolves the exact registered global connection;
4. verifies the direct managed Workspace link exists and points to that target;
5. authorizes the requested final descendant against the link target; and
6. delegates bytes/stat/range reads to the shared Content service through that resolved path.

Normal Workspace files remain inside the Workspace realpath. Unmanaged links, broken links,
regular-directory conflicts, mismatched global targets and nested escapes reject only the current resource.

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
panel remain usable. Media rows surface as workspace-relative `neko/assets/<libraryName>/<relativePath>`
locators, not as a separate Media Library identity.

### 7. Sync and portability preserve the original semantics

Normal project sync includes authoritative project documents containing workspace-relative locators. It
excludes root `.neko`, managed link entries and external target bytes. Git ignore/exclude is advisory;
product traversal rules are authoritative.

On another machine, missing local authorization yields `required-unlinked` while the project remains open.
Users may choose a global library or register a directory. Explicit portable snapshot remains separate: it
collects only referenced bytes through the canonical content handler, validates fingerprints, rewrites only
staged project facts to project-owned Workspace files and publishes atomically.

## Ownership map

| Responsibility                  | Owner                                             | Persistent authority                        | Rebuildable projection             |
| ------------------------------- | ------------------------------------------------- | ------------------------------------------- | ---------------------------------- |
| Media file identity             | Project document owner + `@neko/content` contract | `workspace-file` `neko/assets/...` in facts | Resource/Search rows               |
| Project authorization           | `@neko/assets-domain` / `@neko/assets-node`       | target-free `.neko` binding                 | availability/recovery projection   |
| Physical directory registration | user-global Assets runtime                        | global Media Library connection             | global catalog UI                  |
| Workspace access                | Assets Node + Content Host guard                  | none                                        | `neko/assets/<name>` link/junction |
| Agent handoff                   | Agent/Assets application boundary                 | conversation attachment locator only        | sender-bound Workspace locator     |
| Native picker and sender trust  | Desktop Main                                      | none                                        | one request-scoped selection       |

## Risks / Trade-offs

- Raw filesystem tools can expose a symlink target. Product sync/package never serializes links, targets or
  `.neko`; external tools remain outside product control.
- Binding and link can diverge after manual filesystem edits. The exact pair is checked on every dependent
  operation; mismatch is fail-local and requires repair.
- Windows junction/UNC semantics need platform-specific integration evidence.
- A single content identity means mounted files and ordinary files share one path shape; the mount-aware
  authorizer must remain the only place that interprets the `neko/assets/<libraryName>` prefix.

## Migration / Recovery Plan

1. Remove the `MediaLibraryContentLocator` contract, dispatch, handlers, serializers and path normalizers.
2. Convert resource/search/portable/reference producers to emit normalized `neko/assets/<libraryName>/<relativePath>`.
3. Keep the mount-management lifecycle (binding, global connection, managed link) and route mounted-file
   authorization through the binding-backed workspace path authorizer.
4. Atomically update all consumers (Canvas, Cut, Entity, Search, Text Editor, packaging, Agent) to the
   single workspace-file path and delete the media-library branches.
5. Reconcile current local state: preserve records and files, adopt only exact registered links, diagnose
   ambiguous/conflicting state, and never rewrite project facts silently.
6. Run path-level, package, Desktop UI and Agent evaluation gates before treating prior evidence as valid.

## Open Questions

None for ownership. Product terminology may call the user-global directory catalog “全局媒体库” or “全局素材
目录”, but it must remain distinct from versioned installed Asset packages in contracts and persistence.
