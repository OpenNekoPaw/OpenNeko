## Why

Workspace Resources already owns the canonical file, directory, Canvas and Cut creation workflow,
but creators must keep the Resources dock visible and move away from the Main tab strip to start a
new document. The Main empty state is presentation-only and therefore gives a new Workspace no
direct next action.

## What Changes

- Add a compact `+` immediately after the current Main tab list. It opens one localized quick-create
  popover for File, Folder, Canvas and Cut creation at the visibly declared Workspace root.
- Add a labelled “Create content” action to the empty Main state. It invokes the same component and
  command path as the tab-strip `+`; it is not a second creator implementation.
- Activate the exact Main group that originated the request before executing creation, so a new
  Canvas opens in that group even when the Workbench is split.
- Reuse the existing Resources intent, `@neko/content/project-file-io` creation services and
  Canvas/Cut owner bytes. Main does not access paths, write files, synthesize NKC/OTIO, or infer a
  recent directory.
- Keep subdirectory creation in Resources. Main quick creation always displays and targets the
  Workspace root.

## Capabilities

### New Capabilities

- `workspace-main-quick-creation`: Main tab and empty-state entry, exact-group activation, root-target
  naming interaction, canonical Resources/Content dispatch and visible diagnostics.

### Modified Capabilities

None.

## Impact

- `apps/neko-desktop` owns the Window/Workbench presentation composition, localized quick-create
  popover, exact Main-group activation and wiring to the sender-bound Resources bridge. This logic
  remains in the application composition boundary because it depends on the current Window,
  Workbench group, renderer session and visible Main chrome.
- `@neko/assets-domain` remains the owner of the existing Resources intent contract and controller;
  no alternate creation route or contract shape is added.
- `@neko/content/project-file-io` remains the only ordinary workspace-entry and creative-document
  creation coordinator. Canvas and Cut remain the only producers of valid `.nkc` and `.otio` bytes.
- `@neko/host` remains the owner of Main group identity and capacity. No new persisted state or View
  kind is introduced.
- User data is created only after explicit submit, with fail-if-exists semantics. Existing files,
  Views and presentation snapshots are not migrated or rewritten.
