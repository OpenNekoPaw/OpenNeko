## Why

Ordinary Agent `Read` and `ListDirectory` currently reject paths that cross a symbolic link, which prevents users from inspecting readable workspace content such as linked Media Library directories. The restriction is broader than the required trust boundary: reading may follow the operating system's readable target, while writing must remain protected from symlink-based authority bypasses.

## What Changes

- Allow `Read` to resolve and read a readable file reached through a symbolic link, including a target outside the submitted Workspace path.
- Allow `ListDirectory` to enumerate a readable directory reached through a symbolic link while returning only canonical submitted Workspace-relative paths and bounded directory entries.
- Keep `Write` and directory creation on the strict managed-path authorization path; symbolic links must not grant write authority.
- Keep broken links, permission failures, invalid paths, and unreadable targets fail-visible and local to the affected Tool call.
- Remove the ordinary-listing contract that rejects every symlink traversal and supersede its conflicting scenario in the active Agent launch/domain-binding change.

## Capabilities

### New Capabilities

- `agent-file-read-write-authorization`: Defines the distinct read/list and write authorization semantics for Workspace-relative paths and symbolic links.

### Modified Capabilities

- `agent-launch-domain-binding`: Updates the Workspace `ListDirectory` requirement so ordinary readable symlink targets can be enumerated without weakening write authorization.

## Impact

- `packages/content` owns Node workspace content path authorization and must separate read authorization from writer and directory-creator authorization.
- `packages/agent/runtime` owns the Agent `Read`, `ListDirectory`, and read-only `Grep` Tool behavior, result projection, and diagnostics.
- Existing writer and directory-creator contracts and tests must continue to reject symlink-based writes.
- Agent Evaluation and visible Desktop workspace conversation coverage must be updated to prove the positive read/list path, write denial, no physical-target leakage, and sibling isolation.
