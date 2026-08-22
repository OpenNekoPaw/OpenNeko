## Context

`DesktopProjectCatalogSurface` already renders list mode by default and keeps invalid Workspace rows
visible and removable. Its root currently uses `min-height: 100%` with `overflow: auto`, while the
collection has no flex growth, minimum-size reset, or overflow ownership. A long collection therefore
expands the root instead of scrolling inside the Workbench viewport.

Desktop functional runs already use a shared runner that creates one temporary fixture root and passes
an explicit fixture argument, HOME, Electron `userData`, and Workspace. Desktop Main resolves the HOME
before opening Local Metadata, but `userData` containment is checked only on the Agent automation path,
not as a universal functional-launch prerequisite. The Agent Evaluation runner delegates to the same
shared runner. Historical rows in the user database predate this boundary and remain valuable unknown
user data until the user explicitly removes an exact identity.

The affected roles are:

| Responsibility           | Owner / role                                | Producer                                              | Consumer                          | Canonical path                                                       |
| ------------------------ | ------------------------------------------- | ----------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------- |
| Project catalog layout   | Desktop renderer product Shell presentation | `DesktopProjectCatalogSurface` and Desktop stylesheet | Desktop Workbench                 | `apps/neko-desktop/src/renderer/DesktopProjectManagementSurface.tsx` |
| Test launch isolation    | Desktop functional host orchestration       | `scripts/desktop-functional/runner.mjs`               | UI scenarios and Agent Evaluation | `runAutomatedDesktopFunctional()`                                    |
| Runtime trust validation | Electron application boundary               | `desktop-functional-fixture.ts`                       | Desktop Main startup              | `resolveDesktopRuntimeHome()` before Local Metadata open             |
| Database layout          | `@neko/local-metadata` L1 storage contract  | `resolveGlobalStorageLayout()`                        | Desktop Main repositories         | `${runtimeHome}/.neko/neko.db`                                       |

The renderer code remains in `apps/*` because it composes the product Shell and its Workbench viewport;
it does not decide project identity, persistence, or mutations. Fixture validation remains in Desktop
Main because it depends on Electron process arguments and `app.getPath('userData')`; it is not
host-neutral business behavior.

## Goals / Non-Goals

**Goals:**

- Keep the All Projects header and controls stable while the list/grid collection scrolls through all
  retained records in normal and compact Workbench sizes.
- Make functional fixture HOME and Electron `userData` containment a single pre-storage startup
  invariant for every functional launch, not only Agent automation.
- Prove the shared runner cannot construct a launch whose database, userData, or Workspace escapes the
  fixture root, and prove Agent Evaluation continues to use that runner.
- Keep ordinary product startup bound to the real user HOME and canonical user database.

**Non-Goals:**

- Do not create database versions, schemas, migration registries, compatibility readers, dual storage,
  or a test-record discriminator.
- Do not hide, classify, batch-delete, automatically migrate, or rewrite existing catalog rows based
  on temporary-looking paths.
- Do not change project catalog loading, ordering, invalid-row diagnostics, or removal semantics.
- Do not introduce cloud storage or synchronization.

## Decisions

### 1. The collection is the only vertical scroll owner

The Project catalog root will fill its assigned Workbench viewport with `height: 100%`, reset flex
minimum sizing, and hide outer overflow. The collection will use `flex: 1`, `min-height: 0`, aligned
grid content, and `overflow-y: auto`. Header and toolbar remain non-growing siblings. The empty state
continues to fill the same collection lane.

Scrolling the entire root was rejected because it moves search and sort controls out of view and does
not provide a stable collection viewport. Adding a fixed pixel height was rejected because the same
surface is used in normal and compact Workbench panels.

### 2. Functional storage isolation is validated before SQLite opens

`resolveDesktopRuntimeHome()` remains the unique Main startup selector for user versus fixture HOME.
For a functional launch it will also require Electron `userData` to be a strict descendant of the
resolved fixture HOME. Desktop Main obtains `userData` first, performs this validation, then computes
`resolveGlobalStorageLayout(runtimeHome)` and opens Local Metadata. Ordinary launches continue to use
the system HOME without accepting environment overrides.

The Agent automation helper will consume the already validated startup result rather than own a
second userData containment rule. This removes duplicated responsibility while retaining the existing
fixture Workspace requirement for automation exposure.

Environment-only selection, a fallback to system HOME, and placing a boolean `isTest` inside SQLite
were rejected. They either permit accidental user-database access or mix test classification into
product data.

### 3. The shared runner rejects escaped launch paths at construction

`createAutomatedDesktopLaunch()` will validate that fixture HOME is an absolute safe fixture root and
that Electron `userData` and Workspace are strict descendants before producing a command. The runner
already creates those paths from one temporary root; constructor-level checks prevent future direct
callers or Evaluation wiring changes from producing an unsafe command.

Agent Evaluation remains a direct consumer of `runAutomatedDesktopFunctional()`; no second Evaluation
database or Desktop controller is introduced. Repository orchestration tests will assert this path and
the exact fixture database selected by Main's canonical layout function.

### 4. Historical pollution remains fail-visible and manually removable

Existing user database rows are not modified by this change. The catalog continues to show unavailable
fields and disable open actions while preserving the exact remove action. Path strings such as `tmp`,
`reports`, or `agent-eval` are not authoritative evidence that a row is disposable.

A startup cleanup, migration, legacy reader, automatic repair, or UI filter was rejected because it
could destroy or conceal real user projects and would violate the local invalid-data containment
policy.

## Risks / Trade-offs

- [Historical test rows remain visible after the fix] -> Preserve them for explicit identity-scoped
  removal; this change prevents new contamination but does not guess deletion intent.
- [A future test script launches Electron directly] -> Keep direct launch construction guarded and add
  orchestration checks that Agent Evaluation and UI scenarios use the canonical runner.
- [Nested scrolling feels inconsistent in a very short panel] -> Keep only the collection scrollable,
  preserve fixed controls, and validate a compact real Electron window.
- [Path containment is lexical rather than a general filesystem trust system] -> The runner creates and
  realpaths the fixture root; Desktop validation is a fail-closed second boundary for explicit local
  test launches, not a new arbitrary-path authorization API.

## Migration Plan

No data migration is allowed or required. Deploy the source changes, after which new canonical test
runs write only to temporary fixture storage. Rollback restores source behavior only and does not read,
rewrite, or remove either the user database or discarded fixture directories.

## Open Questions

None. Bulk cleanup of historical rows is a separate user-facing product decision and is not implied by
test storage isolation.
