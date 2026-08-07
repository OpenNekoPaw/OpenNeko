## Why

The primary sidebar currently mirrors every Project catalog record and Project removal permanently deletes the grouped Workspace conversations. This makes conversation navigation noisy and couples a reversible local catalog operation to destructive durable-history cleanup.

## What Changes

- Make the primary sidebar conversation-first: Projects remain explicit group headers, but Project groups are projected only when they contain conversations.
- **BREAKING** Replace the internal `projects.delete` Desktop contract with one canonical `projects.remove` operation that removes Project registration, Workspace registration, Tabs and Views while preserving conversations and Project files.
- Add an independent Project-scoped conversation cleanup operation that deletes only the exact Workspace-owned conversations belonging to the selected Project while preserving the Project registration and files.
- Keep conversations from removed Projects visible under an unavailable Workspace group so users can reopen the Project or explicitly clean up its conversations.
- Replace Project deletion wording and destructive iconography with Project removal wording; expose Project conversation cleanup as a separate, explicitly confirmed destructive action.
- Remove old coupled Project-and-conversation deletion services, IPC channels, tests and wording without compatibility aliases or fallback behavior.

## Capabilities

### New Capabilities

- `project-conversation-cleanup`: Defines exact Project-scoped Workspace conversation cleanup independently from Project catalog removal.

### Modified Capabilities

- `project-catalog-batch-management`: Project catalog batch removal preserves durable conversations and uses a removal-only contract.
- `desktop-sidebar-project-management`: Sidebar projection becomes conversation-first and exposes separate Project removal and Project conversation cleanup actions.
- `desktop-conversation-context-navigation`: Conversations whose Project registration is removed remain visible under their exact unavailable Workspace owner.

## Impact

- `@neko/host` remains the owner of Project catalog mutation, grouped conversation navigation and Project-scoped cleanup orchestration.
- `@neko/agent-runtime` remains the authoritative conversation lifecycle owner and receives only exact conversation identities selected by the Host service.
- `apps/neko-desktop` changes only its typed Main/preload/renderer wiring, product-shell presentation and Electron integration tests.
- The internal Desktop Shell port and IPC channel change from Project deletion to Project removal; no alias, dual path, data version or migration is introduced.
- Existing local Project files and conversation records are preserved by default. Explicit Project conversation cleanup remains destructive and requires confirmation.
