## Why

The Desktop primary sidebar projects recent Projects and Agent conversations but offers no canonical cleanup operation: closing a Project tab does not forget it, and Home conversations cannot be deleted from the sidebar. Stale Projects and obsolete conversations therefore accumulate and can continue to trigger invalid workspace operations.

## What Changes

- Add an explicit “remove from recent Projects” operation that forgets the selected catalog entry without deleting workspace content.
- Add an explicit “delete conversation” operation that delegates to the owning Desktop Agent workspace authority and removes the resulting Home projection.
- Add icon-only sidebar actions with localized accessible labels and confirmation for destructive conversation deletion.
- Keep tab closing, Project forgetting, and conversation deletion as distinct commands with distinct persistence semantics.
- Reject stale identities and failed ownership checks visibly instead of hiding rows optimistically or falling back to another Project.

## Capabilities

### New Capabilities

- `desktop-sidebar-cleanup`: Defines Project catalog removal and Agent conversation deletion from the Desktop primary sidebar.

### Modified Capabilities

None.

## Impact

- Desktop Shell and Agent Home shared contracts and IPC channels.
- Electron preload bridge and AppHost routing.
- Shell state persistence, open-tab reconciliation, and Desktop Agent workspace ownership.
- Primary sidebar UI, localization, and renderer/main-process regression tests.
