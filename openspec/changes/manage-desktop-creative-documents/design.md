## Context

The Assets-owned Resource Browser is a browser-safe Files/Media/Materials projection mounted in the
Desktop Resource Dock. The Files facet reads the Workspace directory, but the projection is cached
and no package-owned watcher currently reconciles external filesystem mutations. The current
`content.import-files` action opens an Electron picker and copies external files into the Workspace,
which conflicts with the product decision that the Files facet directly represents a system folder:
placing a file in that folder is already sufficient.

The Files facet cannot create an ordinary file, directory, Canvas, or Cut. Canvas can construct an
empty in-memory document for a missing default `workspace.nkc`, while Cut already has a canonical
OTIO creation path, but neither behavior is exposed as a coherent Resource Browser operation.
Renderer/Webview code cannot access Node or Electron, and all filesystem mutations require
sender-bound Workspace authorization in Main.

### Five-layer analysis

- **Responsibility:** Assets owns Resource Browser presentation and projection; Content owns
  host-neutral workspace-entry creation and cross-owner document lifecycle; Canvas/Cut own their
  document bytes and session rules; Desktop owns sender/path authorization and concrete native ports.
- **Dependencies:** Assets Webview depends only on browser-safe contracts. Assets Node observes and
  projects filesystem state. Content application services depend on narrow publication, directory,
  Canvas, Cut, Workbench, reference, and trash ports. Desktop supplies Electron-specific adapters.
- **Interfaces:** one canonical command family carries explicit project/workspace/endpoint identity,
  a workspace-relative target directory, a portable name, and request identity. Observation emits
  invalidation/reconciliation signals, not file facts.
- **Extension:** ordinary file/directory creation is exhaustive and `.nkc | .otio` creation is routed
  through explicit owners. A future authored format requires an atomic owner/contract update rather
  than an extension hook, wildcard registry, or first-compatible fallback.
- **Testing:** contract, path-policy, publication, watcher, owner, UI, Desktop delegation, and real
  Electron tests prove both the visible result and the one canonical execution path.

## Goals / Non-Goals

**Goals:**

- Make the Files facet behave as a live projection of the Workspace system directory.
- Provide discoverable New File, New Folder, New Canvas, and New Cut actions.
- Resolve root-versus-directory creation targets deterministically and visibly.
- Create ordinary files/directories without overwrite and create valid NKC/OTIO through their owners.
- Use inline naming and contextual actions modeled on the useful parts of VS Code Explorer.

**Non-Goals:**

- Importing/copying existing files into the Workspace through the application. Users manage existing
  files through Finder, Explorer, terminal, or other filesystem tools.
- A normal always-visible Refresh action. Rescan is an error-recovery action only.
- Rename, move, trash lifecycle changes, duplicate, recursive directory deletion, permanent deletion,
  templates, untitled documents, bulk operations, or autosave policy changes.
- A generic document framework, extension registry, compatibility route, second filesystem catalog,
  or Renderer filesystem access.

## Decisions

### 1. Content owns one canonical creation command family

Expose host-neutral workspace-entry and creative-document application services through the public
`@neko/content/project-file-io` entry. Desktop binds sender identity, authorizes the exact Workspace
and target directory, supplies concrete ports, invokes the service, and projects the result. Assets
and empty Main submit intents only.

The canonical command family is:

```text
workspace-entry.create-file
workspace-entry.create-directory
creative-document.create
creative-document.open
```

There is no import command, picker bridge, alias, or fallback. Each request includes explicit
Project, Workspace, Window/endpoint, request, target-directory, and Resource Browser owner/projection
identity where applicable. Main rejects stale or mismatched identities locally.

### 2. UI context resolves one explicit target directory

All creation commands require a workspace-relative target directory. The Renderer derives it from
the visible Resource Browser state and Main re-authorizes the exact directory:

| Invocation                          | Target directory           |
| ----------------------------------- | -------------------------- |
| Files `+` with a selected directory | The selected directory     |
| Files `+` with a selected file      | The selected file's parent |
| Files `+` with no selection         | Workspace root             |
| Directory context menu              | The invoked directory      |
| Blank-area context menu             | Workspace root             |

A file context menu does not contain creation commands; it remains scoped to the selected file.
When a collapsed directory is the target, the tree expands it and places the inline name editor at
the future row. The UI may show the target directory in the menu, and the inline editor itself is the
authoritative visible confirmation.

No layer falls back to a recent directory, active View, active Workspace, process working directory,
or domain default after an explicit Resource Browser target fails. A missing, stale, external,
symlinked, hidden-internal, or unauthorized target fails visibly at the smallest owning boundary.

### 3. Generic entries and domain documents have different producers

Generic New File creates one zero-byte regular file. New Folder creates one empty directory. Names
are NFC-normalized, non-empty, visible, single path segments that satisfy the existing portable path
policy: no separators, absolute paths, `.`/`..`, Windows reserved names, trailing dot/space, control
characters, or Workspace escape. Publication uses fail-if-exists semantics and never overwrites,
chooses an implicit suffix, or leaves a partial successful projection.

`.nkc` and `.otio` are reserved domain extensions. Generic New File rejects them with a diagnostic
that identifies New Canvas or New Cut as the required command. New Canvas obtains canonical bytes
from the Canvas owner; New Cut obtains canonical bytes from the Cut owner. The Host appends the
required extension only when absent and rejects a mismatched extension. Owner-produced bytes publish
exclusively before the exact Workbench document opens/focuses.

This preserves one successful producer per intent:

```text
ordinary file -> Content empty-file operation
directory     -> Content directory operation
.nkc          -> Canvas owner
.otio         -> Cut owner
```

Unknown ordinary extensions are valid filesystem entries. After creation the Resource Browser
selects them; it opens them only when an explicit editor owner exists. Creation does not invent a
generic editor, parse the file, or treat an unknown extension as a creative document.

### 4. Filesystem observation invalidates the authoritative projection

`packages/assets/node` owns a Workspace-scoped directory observation service aligned with the
Resource Browser projection lifecycle. The Desktop composition root supplies any OS-specific watch
adapter required by the package and binds it to the exact Project/Workspace authority.

Watcher notifications are hints only:

```text
filesystem notification
  -> coalesce affected Workspace paths
  -> invalidate the corresponding Resource Browser projection
  -> read the authoritative directory state
  -> publish a new immutable snapshot
```

Events are coalesced and may cause a subtree or bounded full-Workspace reconciliation; no event is
applied as an authoritative create/delete/rename fact. Scene mount performs an initial read.
Window/application focus restoration and watcher restart perform a bounded reconciliation to cover
coalesced or missed OS notifications. Switching away unmounts the visible Root and releases its
subscription without changing Workspace files.

Successful in-app create/trash operations invalidate the affected projection immediately instead of
waiting for the watcher to echo the mutation. Duplicate watcher notifications remain semantically
transparent. Watcher failure keeps the last valid sibling entries visible, projects a local
diagnostic, and exposes a one-shot Rescan recovery action. It does not return an empty successful
catalog, silently poll forever, or display a normal Refresh control.

### 5. The `+` menu is primary; context menus are contextual accelerators

The Files toolbar places one icon-only `+` button next to the existing view controls with a localized
tooltip and accessible name. Its menu contains New File, New Folder, New Canvas, and New Cut. Four
separate toolbar icons would be noisy at the Resource Dock's width; a single menu keeps the commands
discoverable without crowding the search row.

Directory and blank-area context menus expose the same applicable creation actions. Directory menus
target the invoked directory; blank-area menus target Workspace root. File item menus expose open,
rename only when a future rename capability exists, reveal, and trash actions, but do not contain New
commands. Right-click selects the target before opening, and `Shift+F10`/Menu key invokes the same
capability-derived menu with focus restoration.

Selecting a creation command creates an inline naming row. Enter submits, Escape cancels, and a
conflict/validation failure keeps the editor active with an adjacent diagnostic. No command opens a
native save/open dialog. Media and Materials keep their own facet-specific add actions; the Files
menu never shows Media Library configuration.

Canvas and Cut naming edit only the document stem. The inline field renders the owning extension as
a fixed, non-editable suffix (`.nkc` or `.otio`) and includes that suffix in the submitted canonical
entry name. Directory tree rows keep single-click selection, while a single click on the disclosure
triangle alone expands or collapses that directory; double-click and Arrow Left/Right remain
equivalent tree navigation paths.

### 6. Empty Main and trash remain outside this creation change

The Project Resource Browser is the only creation surface in this change. Empty Main remains a
presentation-only state and does not acquire directory-selection, naming, or filesystem authority.
Existing trash behavior is not replaced or expanded here. A future trash change must define its own
dirty-session, task, reference, authorization, system-trash, rollback, and directory policies before
changing the reachable operation.

### 7. Rename is a separate lifecycle, not a generic filesystem escape hatch

The target experience should eventually expose F2 and a Rename item, but this change does not add a
rename command. Workbench document identity is path-based, Canvas/Cut sessions may be dirty, tasks
may hold the old path, and project documents may reference the target. A later OpenSpec must define
same-directory scope, extension policy, open-session coordination, reference policy, case-only rename,
atomicity, rollback, and tests before a Host rename port becomes reachable.

### 8. Validation proves ownership and actual paths

Tests must prove strict command parsing, sender binding, target-resolution mapping, portable names,
reserved-extension rejection, fail-if-exists publication, directory atomicity, owner-produced
NKC/OTIO bytes, projection invalidation, external filesystem reconciliation, watcher failure
recovery, context-menu focus, inline naming, and exact Workbench reconciliation.

Path-level tests assert that `content.import-files`, its Electron picker/copy handler, normal Refresh,
Renderer filesystem access, generic `.nkc/.otio` creation, active/recent-directory fallback, direct
permanent delete, and an exposed rename command cannot report success.

## Risks / Trade-offs

- **OS watcher behavior differs and notifications may be lost.** Treat notifications only as
  invalidations and reconcile on mount/focus/restart; keep a fail-visible one-shot Rescan recovery.
- **A single `+` menu adds one click.** It avoids four cramped icons and remains more discoverable than
  context-menu-only creation; keyboard/context accelerators retain efficiency.
- **Selected-file parent targeting may surprise users.** Show the target directory in the menu and
  insert the inline editor at the exact parent before commit.
- **Rejecting `.nkc/.otio` from New File is stricter than a generic file manager.** It prevents invalid
  domain files and preserves a single producer; the diagnostic routes users to the correct action.
- **Rename is deferred.** This avoids corrupting path identity or references; the UI must not advertise
  it until the dedicated lifecycle exists.

## Migration Plan

1. Freeze the revised contracts and delete import/normal-refresh requirements from all artifacts.
2. Add ordinary file/directory creation and Canvas/Cut owner adapters with strict path tests.
3. Add authoritative directory observation and projection invalidation/reconciliation.
4. Add Files `+`, contextual menus, inline naming, and diagnostics.
5. Switch NKC/OTIO open to the canonical lifecycle and remove replaced callbacks.
6. Run package, Desktop, architecture, headless functional, visible Electron UI, and packaging gates.

No project-data migration is required. Existing files remain ordinary Workspace files. Removing the
import UI/IPC does not remove or rewrite files previously copied into the Workspace.

## Open Questions

None. Rename/move and recursive directory management require separate OpenSpec changes.
