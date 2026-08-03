## Context

OpenNeko currently has 32 source packages under a flat `packages/neko-*` layout. The package manifests use two identity schemes: singleton packages use `@neko/*`, while split families use independent scopes such as `@neko-agent/*`, `@neko-assets/*`, and `@neko-cut/*`. All but `@neko/markdown` are marked private, and the repository is prelaunch, so this is the appropriate point to establish one canonical internal namespace before more consumers and active changes accumulate.

The change is naming-only at the responsibility level. Every existing owner, role, public entry, producer/consumer relationship, and runtime boundary remains unchanged. `apps/neko-desktop` remains the only Electron Application package and consumes package public entries; no host-neutral business behavior is retained or added there. There is no user-data, project-format, IPC-payload, provider, credential, or persistence migration.

## Goals / Non-Goals

**Goals:**

- Make every source package identity use the single `@neko/*` npm scope.
- Make physical paths concise and deterministic: singleton owners use `packages/<name>`, and split families use `packages/<family>/<role>`.
- Keep related runtime closures adjacent in the repository tree without introducing aggregate package barrels.
- Migrate every dependency, import, build path, quality ledger, fixture, test, OpenSpec reference, and document atomically.
- Add fail-visible validation that rejects old scopes, redundant `packages/neko-*` paths, undeclared package roots, and path/name mismatches.

**Non-Goals:**

- Moving business responsibilities between packages.
- Splitting or merging runtime dependency closures.
- Changing public subpath exports beyond the package-name prefix.
- Adding compatibility aliases, redirect packages, dual imports, or fallback workspace discovery.
- Archiving or otherwise changing the scope of existing OpenSpec changes.

## Decisions

### 1. Use one npm scope

All internal source packages use `@neko/<name>`. Split families encode both domain and role in the package name, for example `@neko/agent-runtime`, `@neko/assets-domain`, and `@neko/cut-webview`.

This keeps registry ownership in one scope and makes package identity unique without relying on multiple pseudo-organization scopes. Keeping the existing `@neko-<domain>/*` scopes was rejected because npm scopes are publisher namespaces, not architectural grouping primitives. Removing all scope/brand identity was rejected because package imports would lose ownership and collision protection.

### 2. Group only real split families

Families with multiple independently built dependency closures use `packages/<family>/<role>`. Single-package owners remain `packages/<name>`. No family directory owns a `package.json`, and no workspace package is nested inside another workspace package.

Canonical mappings are:

| Physical path                    | Package identity              | Existing owner/role and runtime                                            |
| -------------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| `packages/agent/contracts`       | `@neko/agent-contracts`       | Agent L0 contracts; host-neutral; Main/preload/renderer producer-consumers |
| `packages/agent/runtime`         | `@neko/agent-runtime`         | Agent application/runtime; host-neutral + Node; Desktop Host consumer      |
| `packages/agent/webview`         | `@neko/agent-webview`         | Agent browser UI; renderer consumer                                        |
| `packages/ai/contracts`          | `@neko/ai-contracts`          | Provider/model contracts; host-neutral                                     |
| `packages/ai/sdk`                | `@neko/ai-sdk`                | AI provider adapter; host-neutral + Node                                   |
| `packages/assets/domain`         | `@neko/assets-domain`         | Assets contracts/domain/application; host-neutral                          |
| `packages/assets/node`           | `@neko/assets-node`           | Assets Node adapter                                                        |
| `packages/assets/webview`        | `@neko/assets-webview`        | Assets browser UI                                                          |
| `packages/canvas/domain`         | `@neko/canvas-domain`         | Canvas contracts/domain; host-neutral                                      |
| `packages/canvas/node`           | `@neko/canvas-node`           | Canvas Node adapter                                                        |
| `packages/canvas/webview`        | `@neko/canvas-webview`        | Canvas browser UI                                                          |
| `packages/cut/domain`            | `@neko/cut-domain`            | Cut contracts/domain; host-neutral                                         |
| `packages/cut/node`              | `@neko/cut-node`              | Cut Node/FFmpeg adapter                                                    |
| `packages/cut/webview`           | `@neko/cut-webview`           | Cut browser UI                                                             |
| `packages/entity/domain`         | `@neko/entity-domain`         | Entity contracts/domain; host-neutral                                      |
| `packages/entity/node`           | `@neko/entity-node`           | Entity Node adapter                                                        |
| `packages/preview/domain`        | `@neko/preview-domain`        | Preview contracts/domain; host-neutral                                     |
| `packages/preview/webview`       | `@neko/preview-webview`       | Preview browser UI                                                         |
| `packages/search/domain`         | `@neko/search-domain`         | Search domain; host-neutral                                                |
| `packages/search/local-metadata` | `@neko/search-local-metadata` | Search local-metadata Node adapter                                         |
| `packages/chara`                 | `@neko/chara`                 | Character retained domain/application kernel                               |
| `packages/content`               | `@neko/content`               | Content contracts/domain/Node entries                                      |
| `packages/generation`            | `@neko/generation`            | Generation contracts/domain/application/Node entries                       |
| `packages/host`                  | `@neko/host`                  | Host ports and Node infrastructure                                         |
| `packages/local-metadata`        | `@neko/local-metadata`        | Generic local metadata contracts/infrastructure                            |
| `packages/markdown`              | `@neko/markdown`              | Markdown infrastructure                                                    |
| `packages/media`                 | `@neko/media`                 | Media root contract plus Node/browser subpaths                             |
| `packages/media-local-metadata`  | `@neko/media-local-metadata`  | Retained Media local-metadata Node adapter                                 |
| `packages/quality`               | `@neko/quality`               | Quality domain/testing kernel                                              |
| `packages/shared`                | `@neko/shared`                | Minimal cross-domain infrastructure/contracts                              |
| `packages/skills`                | `@neko/skills`                | Content-only Skill package                                                 |
| `packages/ui`                    | `@neko/ui`                    | Shared browser UI infrastructure                                           |

`media-local-metadata` remains a flat retained-kernel package because nesting it below `packages/media` would put a workspace inside the `@neko/media` package root. It can move into a future real family only if Media is split into independent package roots through a separate design.

### 3. Preserve runtime and public-entry boundaries

Only manifest identity and repository location change. Existing exports such as `@neko/media/node`, package-owned contracts, and explicit Webview entries keep their meaning after substituting the canonical package name. Desktop configuration may reference the new paths for bundling and development reload, but continues to import package public entries rather than `packages/*/src` internals.

No production logic remains in `apps/neko-desktop` as a consequence of this migration. Desktop-owned Electron lifecycle, typed IPC, security policy, native adapters, preload projection, and product shell remain there because they require the Application boundary; host-neutral domain behavior remains in its existing package owner.

### 4. Make package-role metadata the topology source of truth

`quality/package-roles.json` records every package root, canonical identity, family, role, runtime, product status, and architecture state. Workspace discovery, boundary checks, test ownership, and dependency validation consume or cross-check that inventory. Validation fails when:

- a source package uses a scope other than `@neko`;
- a path starts with `packages/neko-`;
- a split-family package name does not equal `@neko/<family>-<role>`;
- a declared package root is missing or an undeclared package manifest is discovered;
- source/configuration retains an old `@neko-<domain>/` import or obsolete physical path.

The root workspace uses both `packages/*` and `packages/*/*`; validation prevents family container directories from being treated as packages.

### 5. Treat the migration as an atomic prelaunch break

All old package names and paths are replaced in one change. No alias package, `paths` compatibility mapping, re-export, or dual dependency is allowed. Existing lockfile workspace snapshots are regenerated from the canonical manifests. Active historical OpenSpec artifacts are updated where their commands or paths constrain current/future implementation; historical motivation is preserved when it describes an intentionally replaced state.

## Risks / Trade-offs

- **Large mechanical diff can hide a missed reference** → Use exact old-to-new mapping, repository-wide old-name/path scans, package-role validation, Knip, dependency-cruiser, build, and tests.
- **Nested family roots can be missed by one-level globs** → Update all workspace, lint, format, coverage, test, and functional discovery globs and add fixture tests for nested packages.
- **Vite/Electron development resolution can regress after moves** → Update canonical realpath and prebundle inputs, then run focused builds and real Electron Cut/Canvas/Preview scenarios.
- **Active OpenSpec changes can retain executable old paths** → Update active artifacts and validate all OpenSpec documents; do not rewrite statements that are purely historical unless they become misleading.
- **`@neko/markdown` may already be externally published** → Verify publication before any external release. This repository migration keeps its identity unchanged; no external consumer migration is implied.

## Migration Plan

1. Establish the complete old-to-new path and package-name map in the OpenSpec and package-role inventory.
2. Move package directories with history-preserving renames; update workspace globs so all canonical roots are discovered.
3. Replace package identities and all consumers, then regenerate the pnpm lockfile without compatibility aliases.
4. Update build/test/quality configuration, fixtures, ledgers, Agent evaluation metadata, OpenSpec artifacts, and documentation.
5. Run fail-visible scans proving old paths/scopes are absent, followed by package-role, dependency, static build, full test, Agent harness, and real Electron validations.
6. Rollback, if needed before merge, is a single Git revert of the atomic migration; no user data rollback is required.

## Open Questions

None. The migration is repository-internal and prelaunch; the canonical namespace and topology are fixed by this design.
