## Why

OpenNeko promises personal and Workspace Skill creation, but that capability must use the current DSH filesystem format and discovery authority rather than retired Pi contracts.

## What Changes

- Add approval-bound authoring to an explicit personal or Workspace Skill root.
- Validate and commit DSH-native Skill content through Host authorization, then rely on canonical DSH discovery.
- Remove obsolete private authoring contracts and prevent Skill content from granting runtime or Host authority.

## Capabilities

### New Capabilities

- `dsh-native-skill-authoring`

### Modified Capabilities

- `skill-authoring-targets`

## Impact

DSH owns Skill format/discovery, Host owns write authorization, and Agent owns the authoring turn/approval. Existing valid Skills remain preserved.
