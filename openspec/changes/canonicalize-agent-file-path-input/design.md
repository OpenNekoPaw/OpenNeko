## Context

OpenNeko core file Tools currently validate model arguments as Workspace-relative-only, then resolve them to Host absolute paths. Pi and DSH expose one string path parameter and let the filesystem boundary distinguish relative from absolute syntax. The useful property is the single parameter and single resolver, not unrestricted filesystem access or persistence of absolute paths.

The current relative-only implementation also conflates three concerns: model input ergonomics, Host authorization and durable file identity. This change separates them while preserving the exact Workspace authority, protected project-document routing and fail-local diagnostics.

## Goals / Non-Goals

**Goals:**

- Let Read, Write, Grep and ListDirectory accept one normalized relative-or-absolute string parameter.
- Resolve both forms exactly once against the same Workspace authority and containment rules.
- Return and persist only the canonical Workspace-relative path.
- Keep malformed, outside-root and protected-domain failures visible and local.
- Keep Pi, future DSH and other Agent runtimes on the same OpenNeko-owned Tool contract.

**Non-Goals:**

- Granting the Agent arbitrary filesystem access.
- Persisting absolute paths or adding a second file identity.
- Allowing generic file Tools to read or mutate `.nkc`/`.otio` structured project bytes.
- Changing Bash/Developer Mode, attached-content opaque refs or UI behavior.
- Adding compatibility readers, fallback roots or runtime-specific path contracts.

## Decisions

### 1. One input parameter and one resolution result

Each core file Tool keeps its existing `path` or `file_path` string field. The canonical resolver accepts either normalized relative syntax or an absolute path and returns both:

- `hostPath`: transient absolute path for the authorized Host IO call;
- `workspacePath`: normalized POSIX Workspace-relative path for Tool results, `ContentLocator`, diagnostics and durable facts.

Both values are produced by one resolution operation. Callers cannot choose a relative resolver, absolute resolver, alternate root or fallback strategy.

Alternative rejected: separate `absolute_path` and `relative_path` fields. That makes the model choose an implementation detail, admits contradictory inputs and creates two identities for one file.

### 2. Absolute syntax does not enlarge authority

Relative input resolves from the exact Workspace root. Absolute input is normalized directly, then must pass the same lexical containment, realpath/symlink authorization, ignore rules and protected-document policy. An absolute path outside the exact authorized root fails the current Tool call even if it exists.

Additional selected documents and non-Workspace resources continue through owning capability-issued opaque refs. Core file Tools do not infer an active Workspace, recent root, home directory or attachment path.

Alternative rejected: accepting every absolute path available to the Desktop process. Electron Main process access is not user/Agent authorization.

### 3. Canonical output is always Workspace-relative

Successful Tool data, Grep matches, directory entries, generated `WorkspaceFileContentLocator` values, transcript facts and authoring results use `workspacePath`. Errors use the submitted relative spelling when safe or a redacted generic target for absolute/outside-root input; raw Host exceptions and roots are not projected.

This is canonicalization, not dual-read or migration: relative and absolute inputs converge before IO and have identical success semantics.

### 4. Runtime adapters do not own path semantics

`@neko/agent-runtime` owns the model schema, resolver port and result projection. `@neko/content` owns bounded authorized Workspace IO using the resolved canonical file identity. Desktop Main supplies the exact Workspace authority and concrete filesystem adapter because it owns Electron trust and OS access; it does not contain relative/absolute policy branches. Pi and DSH adapters register the same OpenNeko Tool projection rather than their upstream native file-tool schemas.

### 5. Contract violations fail locally

Empty/NUL inputs, malformed Windows/POSIX syntax, traversal, outside-root targets, unauthorized symlink targets, ignored files and protected project documents return typed diagnostics for the current call. The resolver does not try another interpretation after failure, and sibling files/Tools/Workspaces remain usable.

| Owner / role | Canonical public path | Producer | Consumer | Runtime boundary | Replaced path | User-data impact |
| --- | --- | --- | --- | --- | --- | --- |
| `@neko/agent-runtime` model Tool contract | core Tool definitions + one Workspace path resolver port | model `path`/`file_path` | Read/Write/Grep/ListDirectory execution | host-neutral Agent runtime | relative-only validator and runtime-specific upstream schemas | none |
| `@neko/content` authorized file IO | Workspace reader/writer ports | canonical `workspacePath` plus IO constraints | bounded read/write handlers | Node/Host capability | callers passing independently resolved paths | none |
| Desktop Main concrete adapter | exact Workspace root and filesystem implementation | current Workspace authority | Agent runtime resolver/Content IO | Electron Main trust boundary | policy decisions or alternate-root probing in composition root | none |

## Risks / Trade-offs

- [Absolute paths are longer and easier for a model to mistype] → Prompts and Tool results continue to prefer canonical relative paths; acceptance is ergonomic tolerance, not preferred generation.
- [An absolute input may expose host structure in a failed call] → Results and diagnostics emit only canonical relative paths or a redacted target.
- [Symlink containment differs from lexical containment] → Keep the existing exact managed-link/realpath authorization in the owning Host boundary and test both existing and missing targets.
- [Upstream Pi/DSH schemas drift] → OpenNeko registers its own canonical Tool schema; upstream schemas are not a fallback.

## Migration Plan

1. Replace the relative-only validator with the single canonical resolver and update all four core Tools atomically.
2. Update results, diagnostics and tests to assert canonical Workspace-relative output for both input forms.
3. Remove `absolute-path-not-allowed` as a valid in-root outcome; retain typed outside-authority/malformed diagnostics.
4. Poison runtime-specific or dual-field path registration in contract tests.

No persisted user-data migration is required because absolute paths remain non-durable. Rollback is a code rollback before release, not a compatibility branch.

## Open Questions

None.
