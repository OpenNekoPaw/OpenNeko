## Why

Desktop Project Resource Browser can discover and open existing `.nkc` and `.otio` documents, but it
cannot create, import, or safely remove them. The empty Main surface is also diagnostic-only, while
the existing implicit `workspace.nkc` creation behavior and Cut's existing-file-only open path leave
Canvas and Cut with inconsistent document lifecycles.

## What Changes

- Add one Desktop-owned creative-document lifecycle command path for explicit `.nkc` and `.otio`
  create, external-file import, open/focus, and move-to-system-trash operations.
- Make the Project Resource Browser the primary management surface with facet-aware toolbar actions,
  item and blank-area context menus, keyboard access, and capability-projected commands.
- Make the empty Main surface a discoverable shortcut for create, import, and open operations without
  giving it file ownership or a second implementation.
- Keep Canvas and Cut as the canonical document producers: Canvas creates valid empty NKC data and
  Cut creates valid OTIO through their owning codecs/session factories.
- Resolve target directories from an explicit Resource Browser directory context or the domain
  default root, validate portable names and workspace containment, reject conflicts, and publish
  files without overwrite or partial results.
- Import external `.nkc` and `.otio` regular files by validating their owning codec and copying them
  into an explicit authorized workspace directory before opening them.
- Move only authorized workspace-owned regular files to the operating-system trash after checking
  open sessions, dirty state, running owner tasks, and project references; never cascade-delete or
  rewrite references.
- Keep Media Library unlink, external target mutation, generated-output deletion, Main View close,
  and creative-document trash as distinct operations with distinct diagnostics and confirmation.
- Protect `neko/boards/workspace.nkc` from ordinary deletion; a future reset workflow remains a
  separate destructive operation.
- Limit initial directory removal to empty workspace-owned directories and exclude recursive
  deletion, permanent deletion, rename, move, and restore-from-trash.

## Capabilities

### New Capabilities

- `desktop-creative-document-management`: Defines Desktop `.nkc`/`.otio` creation, import, Resource
  Browser and empty-Main entry points, context-menu capability projection, safe trash lifecycle,
  reference diagnostics, and canonical owner/session routing.

### Modified Capabilities

None.

## Impact

- `packages/neko-assets`: Resource Browser contracts, labels, capability projection, toolbar/context
  menu composition, selection, keyboard behavior, and focused UI tests.
- `packages/neko-ui`: reuse of existing context-menu primitives; no package-local design system or
  duplicate menu primitive.
- `packages/neko-canvas-domain` / `packages/neko-types`: public empty-NKC creation and canonical codec
  entry points consumed through a narrow Desktop owner port.
- `packages/neko-cut-domain`: existing OTIO factory/session create and serialization paths consumed
  through a narrow Desktop owner port.
- `apps/neko-desktop` shared/Main/preload/renderer: sender-bound lifecycle contract, workspace path
  authorization, import/trash orchestration, open-session and task checks, Workbench reconciliation,
  Resource Browser refresh, empty-Main shortcuts, diagnostics, and real Electron acceptance.
- Project files and user data: no schema migration or SQLite record is introduced; the workspace
  filesystem remains authoritative, and destructive operations use the recoverable system trash.
