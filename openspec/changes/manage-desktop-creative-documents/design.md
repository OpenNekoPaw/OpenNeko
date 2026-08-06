## Context

Project Resource Browser is an Assets-owned browser-safe projection mounted only in the fixed-right
Desktop Resource Dock. It currently exposes Files, Media, and Materials facets, opens `.nkc` through
a renderer callback, opens `.otio` through a Host interaction, and uses `removeSource` only for
unlinking a Media Library root. It has no project-document create, import, or trash contract and no
item/blank-area context menu.

Desktop opens every project with the protected `neko/boards/workspace.nkc` View. Canvas currently
constructs an empty in-memory document whenever the requested file is missing and writes it only on a
later save; Cut opens only an existing OTIO file even though the Cut domain already supports
`CutDocumentSession.create`. The empty Main surface contains only a diagnostic. Closing a Main View
changes presentation state but does not inspect dirty state or delete bytes.

The implementation crosses Assets UI, Desktop shared/Main/preload/renderer contracts, Workbench
projection, Canvas and Cut owner runtimes, workspace file authorization, project-content reference
inspection, and Electron's recoverable system trash. Renderer/Webview code cannot access Node or
Electron, and project paths must remain portable workspace-relative locators outside Main.

### Five-layer analysis

- **Responsibility:** Assets owns Resource Browser interaction presentation;
  `@neko/content/project-file-io` owns the host-neutral lifecycle transaction and cross-owner
  orchestration; Canvas/Cut own document construction, validation, serialization, dirty state, and
  session disposal; Desktop owns sender/path authorization, native adapters and Workbench projection.
- **Dependencies:** Renderer depends on one package-owned creative-document L0 contract and public UI
  primitives. The project-file-io application service depends on narrow Canvas/Cut owner, workspace,
  reference, publication and trash ports. Desktop supplies their Electron implementations without
  exposing package internals.
- **Interfaces:** one canonical create/import/open/trash-plan/trash-apply command family carries
  explicit Project/Workspace/Window/endpoint identity, portable target locators, request identity, and
  expected revisions/fingerprints.
- **Extension:** document kinds are an exhaustive `.nkc | .otio` union with explicit owner adapters.
  A future kind requires a new owner adapter and an atomic contract/consumer update rather than an extension-string
  fallback. Menus derive from projected capabilities rather than maintaining per-surface rules.
- **Testing:** producer/consumer contract tests, owner codec/session tests, path and reference tests,
  Resource Browser interaction tests, Workbench/session reconciliation tests, and an isolated real
  Electron workflow prove both result and canonical execution path.

## Goals / Non-Goals

**Goals:**

- Provide one canonical Desktop command path for explicit creative-document create, import, open, and
  recoverable trash operations.
- Keep Resource Browser as the primary management UI and make empty Main a discoverable shortcut
  without duplicating lifecycle logic.
- Produce valid NKC/OTIO through owning domain code and publish without overwrite or partial files.
- Provide contextual, keyboard-accessible menus using existing `@neko/ui` primitives.
- Protect workspace ownership, symlink/trust boundaries, dirty sessions, running tasks, project
  references, multi-View identity, and valuable user data.
- Keep unlink, close, trash, generated-output lifecycle, and entity binding lifecycle distinct.

**Non-Goals:**

- Permanent deletion, recursive directory deletion, application-managed trash restore, bulk
  operations, rename, move, duplicate, templates, or autosave policy changes.
- Automatic import/copy of media referenced by an external OTIO, automatic relink, or project bundle
  creation.
- Deleting Media Library target contents through a library root, deleting external linked files, or
  deleting Creative Entity identity when representation bytes are removed.
- Replacing Canvas/Cut codecs, creating a generic document framework, persisting operation plans in
  SQLite, or adding another Workbench/runtime registry.
- Turning `workspace.nkc` deletion into reset. Reset requires a separate destructive workflow.

## Decisions

### 1. Content project-file-io owns one creative-document lifecycle coordinator

Add a host-neutral `CreativeDocumentLifecycleCoordinator` under the public
`@neko/content/project-file-io` application entry, composed from narrow
`CanvasDocumentOwner`, `CutDocumentOwner`, workspace authorization, reference inspection, Shell
projection, publication and `trashItem(absolutePath)` ports. The coordinator is the only
create/import/trash executor. Desktop binds sender/path identity and supplies concrete ports; Assets
and empty Main submit intents and do not serialize files or update Workbench first.

The shared contract uses exhaustive document kinds and routes:

```text
creative-document.create
creative-document.import
creative-document.open
creative-document.trash.plan
creative-document.trash.apply
creative-directory.trash.plan
creative-directory.trash.apply
```

Every request includes a request ID and explicit project/workspace/endpoint identity. Resource Browser
requests additionally carry its owner identity and current projection revision. Main resolves the
sender-owned Window and validates every supplied identity; no active/recent project fallback is
allowed.

**Alternative considered:** put create/delete directly in `ResourceBrowserController`. Rejected
because empty Main also needs the operations and Assets must not own workspace IO, Canvas/Cut codecs,
or Workbench/session lifecycle.

### 2. Owner adapters construct and validate canonical files

Canvas owner exposes explicit `createEmptyDocument(name)` and `validateDocument(bytes)` behavior over
the canonical empty Canvas factory and NKC codec. Cut owner exposes explicit
`createEmptyDocument(name)` and `validateDocument(bytes)` behavior over `createOtioTimeline`,
`CutDocumentSession.create`, and the canonical OTIO codec. The Cut v1 project profile remains `30/1`
and is produced by the Cut owner, not copied into Desktop.

Create resolves a workspace-relative directory from the selected Resource Browser directory or the
owner's declared default directory. Empty Main supplies no path and therefore uses that same
Host-owned default resolver. Canvas defaults under `neko/boards`; Cut consumes its declared
workspace-relative default-project-root provider. Renderer never receives an absolute path.

Names are NFC-normalized, portable, visible, non-reserved filenames. The Host appends the required
extension only when absent, rejects a mismatched extension, and returns a conflict diagnostic if the
target exists. It does not silently overwrite or choose a suffix for an explicitly named project.

The package application service writes owner-produced bytes through an injected same-directory
staging/publication port and publishes exclusively. A publish
failure removes staging and leaves Workbench and the Resource Browser unchanged. Only after
publication succeeds does Main open/focus the exact document and refresh its Resource Browser
projection.

**Alternative considered:** open an untitled in-memory View and save later. Rejected because it
creates a second unsaved-document lifecycle, makes target ownership ambiguous, and repeats the
implicit `workspace.nkc` asymmetry.

### 3. Import copies only a validated project document

Import is initiated through a sender-bound native file picker restricted to the requested document
kind. Desktop authorizes the returned source; the package service requires an external regular
non-symlink file through its injected port, validates bytes through the matching owner,
and copies it through same-directory staging and exclusive publication into an explicit authorized
workspace directory. Existing workspace documents are opened from Resource Browser rather than
re-imported.

The imported NKC/OTIO bytes are not rewritten. Workspace-relative NKC locators or OTIO-relative media
references that are unavailable in the destination remain explicit missing-content diagnostics and
are repaired only through existing owner relink workflows. Import does not infer a source project
root, copy an adjacent media tree, or use the source directory as hidden runtime context.

**Alternative considered:** automatically copy every OTIO media reference and rebase it. Rejected
because that is a bundle/import-project feature with separate conflict, containment, symlink, codec,
and partial-failure semantics.

### 4. Resource Browser projects capabilities and composes two discoverable entry styles

Extend the Resource Browser contract with explicit document/open/trash capabilities and available
container actions. Assets derives toolbar and context-menu items from those capabilities and reuses
`@neko/ui` `ContextMenu`; it does not create a package-local menu primitive.

- Files toolbar/blank area: create Canvas, create Cut, import document, refresh.
- Workspace directory: open, create Canvas, create Cut, import document, reveal, and trash only when
  empty.
- NKC: open, explicit side-open when supported, reveal, and trash.
- OTIO: open in Cut, reveal, and trash. Side-open remains absent until Cut supports that layout.
- Workspace media: preview, add to explicit Canvas/Cut, reveal, and trash only when the source is an
  owned regular workspace file.
- Media Library root: recover, relink, and unlink only. It never receives file-trash capability.
- Materials: owner-projected material actions; removing representation bytes does not delete Entity
  identity.

Toolbar actions remain visible for discoverability. Right-click selects the target before opening,
supports `Shift+F10`/Menu key, uses separators before destructive actions, and displays unavailable
actions only when a diagnostic helps explain the state. Menu composition does not duplicate Host
authorization.

The current top `+` changes from an unconditional Media Library configuration menu to a facet-aware
create/add menu. Media retains link-global-library and add-directory-library; Files receives the
creative-document actions; Materials receives only implemented owner actions.

### 5. Empty Main is a shortcut, not a document owner

Replace the diagnostic-only empty Main body with compact create Canvas, create Cut, and import/open
actions when their domain capabilities are ready. The surface submits the same lifecycle requests
without a target directory, so Main uses the owner default resolver. It neither constructs document
bytes nor mutates Workbench optimistically.

The empty state is shown only when a Main group has no View. `workspace.nkc` remains the default
project Canvas created by the existing project attachment policy; if the user closes all Views, the
empty state becomes available. Ordinary create operations never reuse or overwrite
`neko/boards/workspace.nkc`.

### 6. Trash uses a short-lived two-phase plan

Deletion is presented as “Move to Trash,” never permanent delete. `trash.plan` authorizes and
canonicalizes the target, rejects a symlink or external/library-root target, fingerprints the exact
file, reads all open Views/sessions, obtains owner dirty state and running task state, and performs a
complete registered project-reference inspection.

The plan result contains:

- opaque short-lived `planId`, target locator, kind, and fingerprint;
- open View identities and dirty state;
- running task blockers;
- reference coverage, referencing owner identities, and warnings;
- allowed dirty resolutions (`save-and-trash`, `discard-and-trash`) and typed diagnostics.

Plans live only in the coordinator's bounded in-memory registry and are bound to sender, window,
project, target, renderer session, request and plan identity. `trash.apply` repeats authorization and requires the same
fingerprint, a non-expired plan, explicit dirty resolution, and explicit reference acknowledgement
when references exist. Missing reference coverage, invalid project documents, changed bytes, stale
sessions, or active owner tasks reject apply visibly.

After validation, the coordinator marks the operation as deleting, asks the owner to save or discard
and release all document-scoped preview/media/session resources, calls the injected trash port, then
requests matching View removal and Resource refresh through projection ports.
Workbench mutation is committed only after trash succeeds. If `trashItem` fails while the file
remains, Main remounts/reopens the previous Views from the unchanged file and returns a diagnostic.

References are never cascaded, removed, or rewritten. A successful explicit trash may leave missing
references, which existing owners project as diagnostics. `neko/boards/workspace.nkc` is rejected
before planning.

**Alternative considered:** one-step confirmation followed by `files.delete`. Rejected because
generic delete is permanent, cannot safely reconcile dirty/multi-View state, and cannot detect stale
reference results between confirmation and mutation.

### 7. Empty directory trash is deliberately narrow

The first version allows only visible, workspace-owned, non-symlink directories with zero entries and
no protected-path role. Plan/apply uses the same identity/fingerprint pattern and system trash
adapter. Non-empty directories return a typed diagnostic; there is no recursive flag or descendant
reference inference.

### 8. Existing operations retain distinct contracts

`closeMainView` remains presentation-only. `source.remove` continues to unlink one workspace Media
Library entry and never mutates target bytes. Generated outputs continue using their specialized
reference-checked lifecycle. Entity representation unbinding/deprecation remains independent of
resource bytes. No compatibility alias maps any of these operations to creative-document trash.

The old Canvas `onOpenCanvas` renderer callback and asymmetric Cut open path are replaced inside this
boundary by the canonical creative-document open request. Legacy callbacks/routes are removed or
deleted after all callers switch atomically; new-path tests assert they do not participate.

### 9. Validation proves ownership and the actual execution path

Focused tests cover contract parsing, sender binding, portable names, exclusive publication, staging
cleanup, codec rejection, import reference preservation, path containment, symlink rejection,
protected paths, reference coverage, dirty resolution, task blockers, plan expiry/fingerprint
staleness, trash failure recovery, multi-View reconciliation, and directory emptiness.

Renderer tests cover facet-aware toolbar content, item/blank-area menus, selection-before-menu,
keyboard invocation, destructive separation, and accessibility. Owner tests prove canonical NKC/OTIO
factories and sessions are invoked. Retired open callbacks and direct delete paths are absent.

An isolated synthetic Electron workspace validates:

```text
open project
  -> create NKC from Files directory
  -> create OTIO from empty Main
  -> import valid NKC/OTIO
  -> open from context menu
  -> reject protected/external/referenced-without-acknowledgement trash
  -> resolve dirty state and move a document to system trash
  -> close matching View, refresh Resources, and preserve unrelated Views
```

The test uses a controlled trash adapter/fixture location rather than the developer's real workspace
or valuable system trash contents.

## Risks / Trade-offs

- **[Risk] External OTIO import preserves references that may become missing** → Show the import
  boundary explicitly, preserve structure, surface owner diagnostics, and leave media bundle import
  to a separate change.
- **[Risk] Reference inspection can be incomplete because another project document is invalid** →
  Fail closed before trash and identify the invalid owner instead of assuming zero references.
- **[Risk] Disposing sessions before `trashItem` can temporarily remove an editor if trash fails** →
  Do not commit Workbench removal until success and remount the unchanged file on failure.
- **[Risk] System trash behavior differs across macOS and Windows** → Keep the adapter injected,
  exercise platform packaging/typechecks, and test application orchestration with a controlled fake.
- **[Risk] Context menus hide features from new users** → Retain facet-aware visible toolbar/empty
  state actions; context menus are an efficiency layer, not the only entry.
- **[Risk] Capability growth makes Resource Browser contracts broad** → Project only stable action
  identities and keep filesystem/session implementations in Desktop; do not expose paths or domain
  services to Assets.
- **[Trade-off] No recursive directory deletion or managed restore** → The initial destructive surface
  remains understandable and recoverable at OS level but requires users to manage non-empty folders
  externally.

## Replacement Plan

1. Add owner-neutral lifecycle contract, producer/consumer tests, and Desktop owner ports without
   exposing actions in UI.
2. Implement create/import and owner adapters, then switch Canvas/Cut open atomically to the same command path.
3. Add two-phase trash planning/apply, reference inspection, task/session checks, and Workbench
   reconciliation.
4. Add capability projection, facet-aware toolbar, context menus, keyboard behavior, and empty-Main
   shortcuts using the new path.
5. Remove the old Canvas callback, asymmetric creative-document open routing, and any
   direct delete entry in this boundary.
6. Run focused package tests/build/typecheck and the isolated real Electron scenario before enabling
   destructive actions by default.

Rollback removes the UI capability projection first so no new mutation can be submitted, then removes
the coordinator/bridge. Already created/imported documents remain ordinary valid project files.
Files moved to OS trash are user-recoverable through the operating system; rollback does not promise
application-managed restoration.

## Open Questions

None. Rename/move, recursive directory trash, project bundle import, `workspace.nkc` reset, bulk
operations, and in-app trash restore are intentionally deferred rather than left as implementation
ambiguities.
