## Context

`@neko/platform` is consumed directly by Desktop and internally depends on Agent, AI SDK,
Generation, Host, Media, and Shared packages. Its name describes no bounded context or runtime layer,
so additions can bypass the package-owned contracts that already exist. The target architecture is
Desktop-only: Desktop Main owns concrete OS/configuration/credential adapters, while host-neutral
Agent and Generation behavior belongs to their domain/runtime packages.

## Goals / Non-Goals

**Goals:**

- Produce an export-level inventory with owner, runtime layer, consumers, storage impact, and target
  entry.
- Move each export once to its canonical owner and migrate consumers directly.
- Delete the Platform package and make stale imports fail.
- Preserve project data and explicitly migrate or reject affected local configuration.

**Non-Goals:**

- Renaming unrelated packages.
- Creating a replacement integration/foundation package.
- Redesigning provider behavior or Generation product UX beyond the ownership migration.

## Decisions

### Use an export-level ownership ledger

The implementation starts from package exports and all static/dynamic/resource consumers rather than
directory names. Each row must resolve to Agent, AI SDK, Generation, Desktop Main, another established
owner, or removal. A generic "shared" or "platform" target is invalid.

Alternative: move directories mechanically. Rejected because the current directories already mix
contracts, orchestration, and concrete host effects.

### Select targets by responsibility and runtime

- Agent model/purpose/provider contracts go to Agent-owned L0 entries.
- Provider SDK adaptation stays in `@neko/ai-sdk`.
- Recoverable generation jobs, outputs, commit, and reconciliation go to `@neko/generation`.
- User config files, secrets, OS integration, and concrete filesystem effects stay in Desktop Main.
- Node-only domain adapters use an owning `./node` entry unless an independent dependency/build
  boundary justifies a package.

Desktop adapters depend on narrow package contracts; domain packages never import Desktop.

### Migrate vertical paths and poison the old owner

Each batch moves contract, implementation, producer, consumer, and tests together. During migration,
the removed Platform entry is made unavailable to the migrated path. Completion requires deleting the
manifest, source, workspace references, and lockfile entry; no re-export facade remains.

### Treat local configuration as protected data

Before moving config/storage behavior, the inventory identifies storage locations and schemas.
Supported values receive an explicit Desktop-owned migration; unsupported or malformed state returns
a diagnostic. No step silently resets user settings or credentials.

## Risks / Trade-offs

- [Large consumer migration exposes hidden cycles] -> Migrate owner-sized vertical paths and run
  dependency checks after every batch.
- [Config relocation damages local state] -> Inventory storage first, test migration with isolated
  user-data fixtures, and fail closed on unknown schema.
- [A new broad facade replaces Platform] -> Reject ownerless targets and add forbidden-import/export
  guards.
- [Concurrent feature work changes exports] -> Regenerate the inventory immediately before apply and
  stop on unmapped drift.

## Migration Plan

1. Freeze current exports, consumers, runtime layers, storage, and target owners.
2. Move Agent and AI SDK contracts/adapters with producer/consumer tests.
3. Move Generation lifecycle and Node execution to its owner.
4. Move concrete configuration, credential, filesystem, and OS effects to Desktop Main.
5. Poison old imports, remove `@neko/platform`, regenerate the lockfile, and update docs/guards.
6. Run focused tests, full build/test/check, legacy/unused/dependency gates, Desktop packaging, and
   affected Agent evaluation.

Rollback is commit-based. Storage migrations must be independently reversible or preserve the source
until the target is verified.

## Open Questions

- The apply audit must choose the exact owner for every current export; no unmapped export may enter
  implementation.
- Any proposed new Node package requires evidence that a package subpath cannot enforce the boundary.
