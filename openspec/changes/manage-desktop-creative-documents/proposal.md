## Why

The Desktop Project Resource Browser directly represents the selected Workspace directory, but its
current interaction model does not match that authority. It offers an application-managed import
operation, cannot create ordinary files or directories, has no explicit Canvas/Cut creation entry,
and does not reliably reconcile files added through Finder, Explorer, a terminal, or another tool.
Users therefore cannot treat Resources as a predictable local filesystem browser.

## What Changes

- Keep the Workspace filesystem as the only authoritative source for the Files facet. Remove the
  existing import-files action and do not add a replacement import workflow.
- Add package-owned live directory observation. Filesystem notifications invalidate the affected
  projection and trigger a bounded authoritative rescan; they never become a second file catalog.
- Add one canonical workspace-entry creation path for an empty ordinary file and an empty directory,
  plus owner-backed creation paths for valid Canvas `.nkc` and Cut `.otio` documents.
- Reserve `.nkc` and `.otio` for their owning domains. Generic New File rejects those extensions
  instead of creating zero-byte substitutes.
- Make the Files-facet `+` menu the discoverable creation entry and add equivalent contextual actions
  to directory and blank-area menus. Creation uses inline naming with Enter to commit and Escape to
  cancel; it does not open a native file picker.
- Resolve every creation target from explicit presentation context: a selected directory targets
  itself, a selected file targets its parent for the toolbar action, a directory context menu targets
  that directory, and blank-area/no-selection context targets the Workspace root. The request carries
  the resolved workspace-relative directory and Main re-authorizes it without any active/recent path
  fallback.
- Remove the normal Refresh command. Successful in-app mutations invalidate the projection
  immediately, external mutations arrive through observation, and a one-shot Rescan recovery action
  appears only when observation reports a visible failure.
- Keep the Project Resource Browser as the only creation surface in this change. Empty Main remains
  presentation-only and does not acquire directory-selection or filesystem state.
- Leave the existing move-to-system-trash behavior unchanged. A stronger two-phase trash lifecycle
  requires a separate change because it introduces dirty-session, running-task, reference, and
  rollback policy unrelated to creation.
- Defer rename to a separate change. Rename must coordinate path-based document identity, dirty
  sessions, running tasks, references, case-only changes, and rollback rather than exposing raw
  `rename(2)` through this creation change.

## Capabilities

### New Capabilities

- `desktop-creative-document-management`: Defines live Workspace directory projection, ordinary
  file/directory creation, owner-backed `.nkc`/`.otio` creation, Files-facet interaction, canonical
  target-directory resolution, safe trash lifecycle, and exact owner/session routing.

### Modified Capabilities

None.

## Impact

- `packages/assets/domain` and `packages/assets/webview`: Resource Browser contracts, capability
  projection, Files toolbar/context menus, inline naming, selection, recovery diagnostics, and UI
  tests. These packages do not acquire filesystem authority.
- `packages/assets/node`: package-owned Workspace directory observation and authoritative Resource
  Browser projection invalidation/reconciliation.
- `packages/content/project-file-io`: host-neutral workspace-entry and creative-document creation
  services, portable name/path policy, exclusive publication, and owner ports.
- `packages/canvas/domain`: canonical empty NKC production and validation exposed through a narrow
  document-owner port.
- `packages/cut/domain`: canonical OTIO production and validation exposed through a narrow
  document-owner port.
- `apps/neko-desktop` shared/Main/preload/renderer: sender-bound decoding, Workspace authorization,
  concrete native filesystem adapters, package-service wiring, Workbench projection, and real
  Electron acceptance. Desktop remains a thin Application boundary and does not own creation rules.
- User data: existing Workspace files remain authoritative and unchanged. Creation never overwrites an
  existing path; observation never writes, imports, repairs, or removes files.
