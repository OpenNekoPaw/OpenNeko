## Context

Flattening preserved npm identities to minimize behavior change, leaving mixed scopes and directory
identity mismatches. Ownership must stabilize before the rename. The authoritative mapping lives in
the Proposed package-granularity ADR and is copied/validated as implementation input; apply-time
inventory must account for packages removed or merged by predecessor changes.

## Goals / Non-Goals

**Goals:**

- Establish one complete current-to-final mapping for the app and every retained package.
- Use one `@neko/*` naming convention and responsibility-aligned directories.
- Perform atomic consumer migrations without aliases or restored aggregate owners.
- Add topology and stale-name guards.

**Non-Goals:**

- Changing package responsibilities during rename.
- Preserving unpublished old npm names.
- Renaming before Platform, Shared, Host, and zero-consumer decisions stabilize.

## Decisions

### Freeze the mapping as a precondition

Each row includes current/final directory and identity, owner, actual consumers, and disposition.
Removed/merged packages remain as explicit rows so the tool cannot accidentally recreate them.
Inventory drift blocks implementation.

### Define the Agent runtime collision explicitly

`packages/neko-agent-runtime` / `@neko/agent` becomes `packages/neko-agent` / `@neko/agent`.
The target path is the runtime owner only. The historical aggregate root had no retained package
identity and MUST NOT return as a parent, facade, alias, or second implementation.

### Rename in one coordinated repository transition

Filesystem moves, manifests, imports, package exports, TypeScript references, scripts, Turbo tasks,
lockfile, fixtures, quality guards, and active docs move together. Intermediate commits may be used
for review, but the final branch has no successful old identity.

Alternative: publish aliases temporarily. Rejected because all packages are prelaunch internal
workspaces and aliases would preserve two facts and obscure missing consumers.

### Enforce canonical scope and responsibility names

Retained packages use `@neko/<responsibility>`; directory names use `neko-<responsibility>`.
Application identity `@neko/app-desktop` remains in `apps/neko-desktop`. Names containing only
`webview`, `types`, or legacy nested scopes are rejected when owner context is absent.

## Risks / Trade-offs

- [Large mechanical diff hides missed references] -> Generate before/after inventories and run
  forbidden-name scans plus package resolution tests.
- [Ignored build directories collide with target paths] -> Validate explicit target directories and
  remove only proven rebuildable artifacts.
- [Concurrent changes use old imports] -> Rebase/freeze immediately before the transition and make
  stale names fail.
- [Historical docs are rewritten incorrectly] -> Update active facts; retain clearly marked
  historical evidence where required.

## Migration Plan

1. Require predecessor changes to complete and regenerate the app/package mapping.
2. Validate target paths are absent or contain only recoverable ignored artifacts.
3. Move directories and update package manifests/public exports.
4. Update all consumers, scripts, configs, lockfile, tests, quality guards, and active docs.
5. Add stale-scope/name and aggregate-root poison checks.
6. Run package resolution, build/test/check, dependency/unused/legacy gates, CI-equivalent checks,
   Desktop packaging, and a focused real Electron scenario.

Rollback is a commit revert; no project or user-data format changes are part of this transition.

## Open Questions

- Final retained rows are recalculated after predecessor changes; a removed package is not renamed.
- `@neko/shared` directory rename is allowed only after the Shared decomposition acceptance passes.
