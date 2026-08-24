## Context

The Main tab strip currently renders only `WorkbenchEditorTabs`; the empty Main renders a passive
placeholder. The embedded Resources Files facet already exposes File, Folder, Canvas and Cut
creation and routes all writes through `ResourceBrowserNodeRuntime` to the canonical Content,
Canvas and Cut owners. Cut also owns a separate in-memory draft `+` inside the Cut tab strip.

This change adds a second presentation entry, not a second creation implementation. It must preserve
exact Window/Workspace/renderer identity, target an explicit directory, and avoid sending a split
Workbench result to whichever group happens to be active later.

### Five-layer analysis

- **Responsibility:** Desktop renderer owns Main chrome and the quick-create invocation; Assets owns
  the intent/controller; Content owns entry creation; Canvas/Cut own creative bytes; Host owns group
  identity and limits.
- **Dependency:** Renderer consumes public Assets and Host contracts through preload. It does not
  import Node/Electron or package internals. Main/Node behavior is unchanged.
- **Interface:** Reuse the existing Resources search and execute requests. One renderer-owned
  orchestration function activates the exact group, establishes the unfiltered Files projection,
  submits the root-target intent and refreshes the Shell projection.
- **Extension:** The visible kind union is exhaustive (`file | directory | canvas | cut`). Adding a
  future kind requires an owner-backed Resources route before it can enter the menu.
- **Testing:** Pure orchestration tests prove exact ordering and canonical dispatch; component tests
  prove menu, naming, suffix, cancellation and local failure; Desktop/style tests and an isolated
  Electron scenario cover placement, empty/dense states and the real create/open path.

## Decisions

### 1. Main submits the existing Resources intent

| Responsibility                                | Owner / public path                                            | Producer                       | Consumer                    | Runtime                          | User-data role                  |
| --------------------------------------------- | -------------------------------------------------------------- | ------------------------------ | --------------------------- | -------------------------------- | ------------------------------- |
| Quick-create UI and exact-group preparation   | `apps/neko-desktop` renderer                                   | Main tab / empty-state control | Resources bridge            | Browser + Desktop composition    | Invocation-local name/kind only |
| Creation request validation and routing       | `@neko/assets-domain/resource-browser/contract` and controller | Desktop renderer               | Assets Node runtime         | Typed preload/Main boundary      | No authoritative copy           |
| File/directory and creative-document creation | `@neko/content/project-file-io`                                | Assets Node adapter            | Authorized Workspace writer | Host-neutral service + Node port | Creates exact requested entry   |
| NKC/OTIO bytes                                | Canvas/Cut public project-file owners                          | Content creation coordinator   | Authorized Workspace writer | Host-neutral owner               | Canonical document bytes        |

The canonical public path remains:

```text
Main quick-create intent
  -> exact Main group activation
  -> Resources Files projection
  -> existing workspace-entry.create-* / creative-document.create intent
  -> Content creation coordinator
  -> Canvas/Cut owner bytes when applicable
  -> existing creative-document open/focus
```

No direct writer, hidden Resource Browser component, synthetic document JSON, alternate preload
channel or renderer filesystem path is added. The replaced presentation is the passive Main empty
state and creation discoverability limited to the Resources dock; the Resources entry remains valid.

### 2. Workspace root is an explicit quick-create scope

The popover displays “Workspace root” before submission and omits `resourceId`, which is the existing
canonical Resources representation of that exact root target. It never consumes a hidden selection,
active file, recent directory or process working directory. Users who need a subdirectory continue
through Resources, where the selected directory is visible and authoritative.

### 3. Exact Main group activation precedes creation

The renderer orchestration receives the current Workbench layout and originating `groupId`. It first
validates that the group exists, then awaits the canonical Workbench update when the group is not
active. Only after that update completes does it establish the Files projection and submit creation.
The existing Canvas open path therefore sees the intended active group. Cut creation continues to
open in the independent Cut panel; File/Folder creation updates Resources without inventing a Main
View.

### 4. Empty and populated Main reuse one control

The tab strip always exposes the compact icon trigger. When the group has no View, the placeholder
also renders a labelled primary trigger using the same `WorkspaceQuickCreateControl` component and
callback. The empty-state trigger disappears after a View opens; the tab trigger remains stable.

The popover owns only invocation-local kind, name, pending and diagnostic state. Escape/cancel closes
and resets it. A rejected request keeps the form open with a visible message. If a creative file was
successfully created but its editor could not open, the form closes and Desktop exposes the retained
Resources diagnostic; it must not retry creation and cause a name conflict.

## Risks / Trade-offs

- Two visible triggers appear in an empty group. This is intentional onboarding redundancy; both use
  one implementation, and only the stable tab trigger remains after creation.
- Root-only creation is less flexible than Resources. The target is visibly deterministic and keeps
  the quick flow bounded; subdirectory selection remains one explicit Resources workflow.
- A document may be created while its editor cannot open. Existing owner behavior preserves the file
  and returns a diagnostic; Main must report that outcome rather than delete or recreate it.

## User-data impact

No migration or compatibility path is introduced. Explicit submit may create one new root-level
workspace entry with existing fail-if-exists behavior. Cancellation and validation errors create
nothing. Existing documents, Cut drafts, Views and project facts remain unchanged.
