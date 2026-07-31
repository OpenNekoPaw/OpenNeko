## Current Apply Inventory

Date: 2026-08-01

This inventory records apply-time evidence for the completed removal batches. It does not replace the
required full root/subpath/symbol ledger in task 1.1.

## Retired Zero-Consumer Batch

The following modules had zero production imports after separating application/package source from
tests, fixtures, barrels, documentation, and evaluation infrastructure. TypeScript AST inspection
covered named imports, direct `@neko/shared/types/*` imports, relative imports, re-exports, and
dynamic imports under `apps/`, `packages/`, and `scripts/`.

| Semantic owner                                         | Removed modules                                                                                                               | Production consumers | Data disposition                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------: | -------------------------------------------------------------------------------------- |
| Retired Pi/Agent state owned by `@neko/agent/types`    | `agent-feedback`, `context-persistence`, `conversation-compressor`, `memory`, `skill-conflict`, `skill-lifecycle`, `subagent` |                    0 | No persisted codec or migration reader; remove API and package-local tests             |
| Retired Engine/audio model owned by `@neko/media`      | `audioAutomation`, `audioEffectParams`, `audioMix`, `audioTempo`, `media-stream`                                              |                    0 | No current project codec or runtime reader; remove API and package-local tests         |
| Orphan Canvas contracts owned by `@neko/canvas/domain` | `artifact-projection`, `canvas-timeline-sync`, `storyboard-readiness`                                                         |                    0 | Not NKC/Storyboard codecs; remove API and package-local tests                          |
| Retired Agent action contract                          | `aiAction`                                                                                                                    |                    0 | No persisted codec; remove API and package-local test                                  |
| Retired Entity facade contract                         | `creative-entity-facade`                                                                                                      |                    0 | No current Entity fact codec; remove API and package-local test                        |
| Retired Assets import contract                         | `media-import`                                                                                                                |                    0 | Not the Asset manifest or import persistence format; remove API and package-local test |

This batch removes 3,916 production lines and 920 test lines. The machine-readable disposition is
owned by `quality/ledgers/neko-shared-retired-module-ledger.json`. The
`check-neko-shared-exports.mjs` guard requires every listed source and direct public entry to remain
absent. It also freezes the 290 symbols removed from the root barrel and rejects relative imports,
re-exports, dynamic imports, direct package imports, root re-export, and root named-import
reintroduction.

## Second Zero-Consumer Batch

The same current-tree TypeScript AST audit confirmed that the following modules had no production
consumer beyond the root barrel. `reference-resolution` had one internal type-only dependency:
`AgentArtifactFacetsContribution.referenceContributors`. Repository-wide inspection found no
production assignment or read of that optional field, so the field and import were removed before
retiring the resolver framework.

| Semantic owner                           | Removed modules                                                                     | Production consumers | Data disposition                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | -------------------: | --------------------------------------------------------------------------- |
| Retired Agent state                      | `context-manager`, `subagent-reviewer`                                              |                    0 | No persisted codec or runtime owner; remove API and package-local test      |
| Retired Generation/Quality adapter       | `creative-media-capability-registry`, `generated-asset-quality-adapter`             |                    0 | No registered adapter/caller or persisted result/evidence codec             |
| Retired Canvas planning contract         | `storyboard-planner`                                                                |                    0 | No storyboard project codec or production consumer                          |
| Retired cross-domain reference framework | `reference-resolution` plus `AgentArtifactFacetsContribution.referenceContributors` |                    0 | No resolver registration, producer, durable codec, or data migration impact |

This batch removes 3,236 production lines, three package-local test files, and the adapter-only cases
from `generated-asset-lifecycle.test.ts` while retaining its lifecycle identity and legacy-field
rejection coverage. The retired export ledger now freezes another 125 root symbols and all six direct
source entries. The change does not remove `creative-ai-invocation`, `asset/manifest`,
`canvas-cut-draft`, NKC, local metadata, project I/O, or any current ContentLocator contract.

## Explicitly Deferred

- `creative-ai-invocation` remains until its Accepted ADR is superseded or narrowed.
- `canvas-cut-draft` remains until the old draft is migrated or rejected with a typed diagnostic.
- `asset/manifest` remains until installed manifest data has an explicit migration/rejection path.
- Domain-owned Canvas, Agent, Preview, Generation, Entity, and Content contracts remain until their
  owning L0 public entries and all producers/consumers are migrated atomically.
- React/icons and local-metadata/SQLite remain for their dedicated L2 and L1 ownership batches.

## Validation Evidence

- `pnpm check:shared-exports`: failed before deletion with every retained source, barrel re-export,
  package-local orphan test, and internal orphan dependency; passes after deletion.
- `node --test scripts/test-orchestration/neko-shared-export-boundary.test.mjs`: passes all three
  poison cases and proves source, direct public import, and root-symbol reintroduction fail.
- `pnpm --dir packages/neko-types test -- --run`: the isolated staged snapshot passes 122 files
  and 927 tests; the current integrated worktree passes 124 files and 946 tests.
- `pnpm check:legacy-debt:ledger`, `pnpm check:legacy-debt`, `pnpm check:deps`,
  `pnpm check:unused`, and `pnpm check`: pass.
- `pnpm check:quality`: the isolated staged snapshot passes all boundary gates, 62 orchestration
  tests, and strict validation of its 100 OpenSpec changes/specs. The current integrated worktree
  also passes its expanded 67-test/104-OpenSpec baseline.
- `pnpm build`: the current integrated worktree passes all package/application builds and completes
  macOS arm64 Electron packaging. The isolated staged snapshot reaches an unchanged clean-HEAD
  failure in `local-metadata/contracts.ts` because `Error.cause` is absent from that baseline's
  library declaration; the concurrent local-metadata/toolchain work resolves it outside this batch.
- `git diff --check`: passes for the affected Shared, quality-ledger, guard, and OpenSpec paths.
- Root `pnpm typecheck` remains blocked outside this batch by `neko-platform` tests that still import
  the concurrently retired `ResourceCacheManifest`/`ResourceCacheManifestStore` contracts and two
  resulting implicit-`any` errors.
- Root `pnpm test` remains blocked outside this batch by a Desktop architecture assertion for the
  removed `resolveAgentWorkspace` path and a `DesktopShell.lifecycle.test.tsx` fixture that has not
  added the new `projectPortability` bridge.
