## Why

OpenNeko currently treats absolute and relative file paths as different model contracts and rejects absolute inputs even when they name the same authorized Workspace file. Pi and DSH instead use one string path contract and let the filesystem boundary resolve the input, which is simpler for the Agent and avoids duplicating file identity.

## What Changes

- **BREAKING** Replace relative-only core file-tool validation with one canonical `path`/`file_path` input that accepts normalized relative or absolute syntax.
- Resolve both forms through the same exact Workspace authority and containment policy; an absolute path never grants broader access.
- Canonicalize every successful result, locator, match and durable reference to one Workspace-relative path.
- Keep Host absolute paths transient and redact them from persisted facts and model-visible diagnostics.
- Reject traversal, malformed paths, unauthorized roots and protected project documents fail-locally without trying a second reader, root or fallback path.

## Capabilities

### New Capabilities

- `agent-file-path-input`: Single model-facing file path syntax, exact authority resolution, canonical output and fail-local diagnostics.

### Modified Capabilities

<!-- None. -->

## Impact

- `@neko/agent-runtime` owns the model-facing Read/Write/Grep/ListDirectory schema, canonical path resolver contract and safe Tool result projection.
- `@neko/content` continues to own authorized Workspace read/write ports and canonical Workspace-relative file identity; it does not gain Agent policy.
- Desktop Main remains a thin adapter that supplies the exact Workspace root/authority and performs Host IO; it does not choose relative-versus-absolute business semantics.
- No UI entry, appearance or interaction changes; no persisted absolute paths, migration path, dual-read or fallback is introduced.
