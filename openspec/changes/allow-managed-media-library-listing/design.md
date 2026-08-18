## Context

The Agent file tools currently have two separate checks that together reject readable symbolic links: the Node content reader reuses the strict workspace path guard, and `ListDirectory` rejects any path that crosses a symlink inside its authorized roots. The strict guard is also the authority used by `NodeAuthorizedWorkspaceWriter` and `NodeAuthorizedWorkspaceDirectoryCreator`, so changing it in place would silently grant write access through a link.

The canonical ownership remains package-local: `packages/content` owns Node workspace content authorization and byte reads/writes; `packages/agent/runtime` owns the Agent Core Tool contracts, traversal bounds, diagnostics, and path projection. `apps/neko-desktop` is not changed because it is only the composition root and does not own this policy.

## Goals / Non-Goals

**Goals:**

- Let `Read`, `ListDirectory`, and read-only `Grep` follow a symbolic link submitted through a lexically authorized Workspace-relative path when the operating system permits the requested read.
- Preserve the submitted canonical Workspace path in locators, directory entries, and search results; never expose a physical target path.
- Keep bounded listing/search behavior, hidden-path filtering, ignore rules, protected project-document rules, and fail-visible diagnostics.
- Keep writer and directory-creator authorization strict so a symbolic link cannot redirect a write or directory creation outside the Workspace authority.

**Non-Goals:**

- Granting arbitrary absolute paths that are not reached through an authorized Workspace path.
- Changing project facts, asset ownership, persistent locators, or the Desktop IPC surface.
- Adding a fallback reader, a second content authority, automatic link repair, or a symlink migration format.

## Decisions

1. **Add a read-only path authorization function instead of weakening the existing guard.**
   `authorizeWorkspaceReadablePath` will retain lexical Workspace containment, `.neko` exclusion, and path normalization, resolve the requested path for existence/permission diagnostics, and deliberately omit the final-realpath-inside-workspace check. The existing `authorizeWorkspaceContainedPath` remains the sole default for writers and directory creators. This keeps one canonical read path and one canonical write path without a shared security policy that is too broad.

2. **Make the canonical Node workspace reader use the read authorization function.**
   After authorization, the reader opens the submitted path so the OS follows the link and the handle observes the target file. It continues returning the submitted locator and existing content diagnostics. The physical realpath is never returned.

3. **Remove the pre-enumeration symlink rejection from `ListDirectory`.**
   `readdir` on the authorized submitted path is the canonical enumeration operation and naturally follows a directory link. The tool continues to enumerate one level, cap entries, filter hidden names, apply the existing lexical access policy to child paths, and project only Workspace-relative names. Broken links, loops, permission errors, and non-directories remain errors for the exact listing.

4. **Include symlink traversal in read-only `Grep` with cycle protection.**
   Recursive search will inspect symlink targets using `stat`, recurse into linked directories, and maintain a per-request set of canonical directory realpaths. A repeated realpath is skipped with no success-path fallback, preventing cycles while preserving sibling searches and submitted display paths.

5. **Update the conflicting launch/domain-binding requirement as a superseding delta.**
   The old scenario that rejected all symlink traversal is replaced by a requirement that distinguishes read/list success from write denial. No legacy handler or feature flag remains.

## Risks / Trade-offs

- **[Risk]** A readable symlink can expose content outside the Workspace root. → **Mitigation:** only a lexically authorized Workspace path can be submitted; the OS still enforces the current user's read permission; physical paths are never projected; writes remain strict.
- **[Risk]** Linked directory graphs can contain cycles or large external trees. → **Mitigation:** preserve single-level `ListDirectory`, bound `Grep` results and file size, and skip repeated canonical directory realpaths per request.
- **[Risk]** Existing tests or documentation may assert the old rejection behavior. → **Mitigation:** replace those assertions with positive read/list cases and explicit write-denial coverage, and update tool presentation text.

## Migration Plan

Update the content reader, Core Tools, focused tests, evaluation case, and the superseding OpenSpec delta atomically. No persisted data migration is required. If validation exposes a defect, revert only the new read/list implementation and its tests; the strict writer guard remains unchanged throughout.

## Open Questions

None for the requested boundary. The implementation treats read-only `Grep` as part of “任意读取” so the read semantics do not diverge across Core Tools.
