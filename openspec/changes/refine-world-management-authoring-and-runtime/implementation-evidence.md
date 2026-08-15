## Foundation path inventory

> Historical evidence only. `simplify-project-authoring-and-installed-libraries` deleted the
> standalone World library authority and `${NEKO_HOME}/libraries/worlds` production path. Current
> World management and runtime consume the World-owned global catalog and exact domain versions.

Recorded on 2026-08-14 before production cutover. This inventory identifies paths only; it does not read or log World payloads.

| Current symbol/path             | Current producer                                              | Current consumer                                                                     | Required replacement                                                                                                       |
| ------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `WorldFoundationSnapshot`       | `WorldFoundationService` over `createWorldDurableCatalogPort` | preload bridge, World management Webview and Desktop management composition          | World-owned management catalog/detail projection; exact runtime projection remains separate                                |
| `WorldFoundationCommand`        | `world-foundation-host` codec                                 | `WorldFoundationCommandService`, authoring command filter and mixed Webview controls | narrow authoring commands, dedicated management handoffs, authoring preview contract and exact runtime intents             |
| `WorldFoundationCommandService` | Desktop composition root                                      | AppHost Foundation IPC                                                               | canonical World authoring/runtime services called through separate public ports; delete catch-all service after cutover    |
| `OpenNekoDesktopWorldBridge`    | preload `worldFoundation` bridge                              | Desktop renderer and `@neko/world-webview` management runtime                        | separate management, authoring, portable and runtime typed bridges                                                         |
| `WorldFoundationRoot`           | `@neko/world-webview`                                         | isolated tests only; production uses split catalog/detail functions                  | delete after catalog/detail replacement and test cutover                                                                   |
| `WorldDetailSurface`            | `@neko/world-webview`                                         | Desktop Secondary Main                                                               | new continuous World management detail Root with no Studio/Runtime mutations                                               |
| `createWorldDurableCatalogPort` | Desktop composition                                           | `WorldFoundationService`                                                             | World management projection joins narrow authoring/runtime summaries; delete broad port if no non-product consumer remains |
| `world-preview-run-create`      | mixed Foundation command codec and Webview                    | `WorldRuntimeService.createRun`                                                      | World-owned non-persistent deterministic authoring preview; formal createRun becomes runtime-only                          |

`packages/project/src/contracts/project-local-authoring-host.ts` currently reuses the Foundation create codec for project-local World creation. It must move to a narrow World authoring/create contract rather than retain the catch-all Foundation decoder.

## Production cutover result

The mixed `WorldFoundationSnapshot` / `WorldFoundationCommand` contract, catch-all command service,
Desktop IPC/preload bridge and `WorldFoundationRoot` were deleted in the production cutover. Project-local
creation now validates the narrow `WorldAuthoringCommand` directly. The unused transformation candidate,
planning and state-commit public entries were also removed rather than retained as test-only product APIs.

The only remaining Foundation-named TypeScript primitives are
`createWorldFoundationActionHandlers`, `WORLD_FOUNDATION_FACT_SET_ACTION` and
`WORLD_FOUNDATION_FACT_DELETE_ACTION`. Their exact production consumer is the deterministic
`WorldRuntimeService` composition; they implement its two registered typed fact actions and are not a
management, authoring, preview, Agent or compatibility path. No Foundation symbol is retained solely for a
non-product consumer.

`pnpm check:unused` was run after the cutover and reported no World-owned unused dependency,
export or file. The repository-wide command still exits non-zero for pre-existing/unrelated Canvas exports and
dependency declarations plus the concurrent `DesktopWorkspaceProjectBrowser.test.tsx` dependency declaration;
those findings are outside this World change and were not hidden or changed here. Obsolete mixed Foundation CSS
and the retired Desktop transformation functional scenario were removed.

## Canonical identity and availability decision

- The only basic production chain is `WorldProject -> WorldVersion -> WorldRun -> WorldSave/branch`.
- `WorldExperienceVersion` is not a compatibility alias, union member, latest-version resolver or Foundation launch input.
- Basic Management, directory Authoring and deterministic Runtime may become available only through this change's exact producers and consumers.
- World Story, Gameplay, complete WorldExperience, Agent Play and realtime presentation remain independently gated and do not disable or reroute the basic chain.

## Existing durable data inventory

Read-only count queries were run against `${HOME}/.neko/neko.db`; no payload column was selected.
The now-retired standalone World directory was inspected by file name/count only before the
successor cutover; current production code does not read or migrate it.

| Authority                                  | Record kind                         | Count |
| ------------------------------------------ | ----------------------------------- | ----: |
| SQLite preserved legacy/runtime store      | `world_projects`                    |     0 |
| SQLite preserved publication/runtime store | `world_versions`                    |     0 |
| SQLite runtime store                       | `world_runtime_aggregates`          |     0 |
| Standalone World file repository           | `neko/worlds/*/project.json`        |     0 |
| Standalone World file repository           | `neko/worlds/*/publications/*.json` |     0 |

No offline data rewrite or automatic migration is required for this machine. Existing tables and any future preserved bytes remain untouched. Normal authoring continues through the file repository; runtime continues through the runtime-specific repository. Invalid records remain visible at their owning scope with exact diagnostics and never trigger an alternate reader, deletion, default reconstruction or Desktop startup failure.

## Verification summary

Focused package verification passed after the production cutover:

- `pnpm --filter @neko/world test` — 15 files, 55 tests.
- `pnpm --filter @neko/world typecheck` — passed.
- `pnpm --filter @neko/world-node test` — 6 files, 20 tests.
- `pnpm --filter @neko/world-node typecheck` — passed.
- `pnpm --filter @neko/world-webview test` — 2 files, 10 tests.
- `pnpm --filter @neko/world-webview typecheck` — passed.
- `pnpm --filter @neko/host test` — 38 files, 321 tests.
- `pnpm --filter @neko/app-desktop test` — 108 files, 704 tests.
- `pnpm --filter @neko/app-desktop typecheck` — passed.

The focused package total is 1,110 passing tests. The final authoring JSON/review decoder cleanup was
rechecked with the World and World Webview suites (65 tests) and both typechecks. `git diff --check` passed.
`pnpm package:desktop` also produced and verified the current macOS arm64 package.

Post-implementation review found that the Project Content `onOpenWorld` consumer still targeted the Primary
Main group even though the Host authoring transition already used Secondary Main. It was corrected to
`DESKTOP_SECONDARY_MAIN_GROUP_ID` without changing Character or Board ownership. The focused Desktop Shell
suite now passes 45 tests and Desktop typecheck passes; the regression test asserts that the project-local World
callback cannot target Primary Main.

A subsequent visible Desktop regression exposed a missing renderer composition branch for standalone World
authoring: the validated Scene correctly carried Workspace scope and a standalone `world-authoring` Secondary
Main, but the Agent Surface projection only recognized the equivalent standalone Character Scene before
requiring a Content Project. The renderer now recognizes both exact standalone authoring authorities through
one closed Character/World resolver. It preserves the Workspace-bound draft and does not fabricate a Content
Project, while mismatched authority/library/workspace identities still reach the existing fail-visible error.
The regression test constructs the exact standalone World Scene with an empty Content Project catalog and
asserts the canonical launch-bound Agent presentation, exact Workspace grant and `Worlds` workspace label.

After that correction, `pnpm --filter @neko/app-desktop test -- DesktopShell.test.tsx` passed all 108 Desktop
test files and 708 tests, `pnpm --filter @neko/app-desktop typecheck` passed, both touched files passed Prettier
and `git diff --check`, and `pnpm check:application-boundaries` plus `pnpm check:agent-boundaries` passed. The
already-running development Electron renderer no longer displayed the desktop-level error after hot update;
the Agent Entry was readable and unclipped. That observation does not replace an isolated replay of the exact
standalone World authoring state, so the broader graphical result remains blocked rather than passed.

Architecture and specification gates passed individually:

- `pnpm check:application-boundaries`
- `pnpm check:agent-boundaries`
- `pnpm check:webview-boundaries`
- `pnpm check:storage-authorities`
- `pnpm check:package-boundaries`
- `pnpm check:openspec` — 95 items passed.
- `pnpm check:legacy-debt` — passed with zero blocking production debt matches.

`pnpm check:no-internal-versioning` remains blocked by the dirty repository's existing stale allowances and
unrelated Character/Project occurrences; it also currently classifies legitimate World user-domain versions
and runtime CAS revisions as internal generation markers. `pnpm check:unused` has no World finding but remains
non-zero for unrelated Canvas declarations/exports and the concurrent
`DesktopWorkspaceProjectBrowser.test.tsx` dependency declaration. These failures were not hidden or repaired
through compatibility code.

`pnpm gate:local` reached `format:check` and initially exposed 19 World/Host files, which were formatted. The
repeat check now reports only the pre-existing, out-of-scope
`scripts/desktop-functional/desktop-workbench-scenes.mjs`; the user-owned file was preserved, so the aggregate
gate remains non-zero before lint/typecheck/build execution.

## Agent Evaluation evidence

`pnpm test:agent:eval` passed 45 files and 310 tests. Its indexed dry-run discovered 27 suites and 80 cases,
including the three `skill.world-creator` cases. This is key-free harness/readiness evidence only. The
real-provider command `pnpm test:local:api -- --mode focused --suite skill.world-creator` was not run because no
explicit provider/model/cost authorization was provided; no Agent behavior acceptance is inferred.

## UI validation evidence

The UI workflow is applicable because this change replaces World management presentation, adds authoring and
runtime surfaces, changes Workspace slot composition and adds portable preview interactions. The required
authoritative boundary is an isolated visible Electron Desktop runtime because the path crosses native grants,
typed IPC, persisted scene identity, window resizing and application restart.

The `domain-management-workbench` scenario was updated to exercise the current canonical path through normal
UI input: empty card catalog; manual creation; Primary Main empty preservation with Secondary Main authoring;
draft save/review/publication; continuous detail; export-scope preview; narrow scrolling; Runtime Workbench;
application restart; and exit/unmount. `pnpm test:local:ui:contract` passed all six repository UI workflow tests,
and the scenario source passes Node syntax and Prettier checks.

The authoritative graphical run is blocked before renderer startup. Development launch reported that an
existing Desktop process owns this checkout's Vite bundle. The current code was then packaged successfully and
the same visible scenario was retried with `--target packaged`, but the existing OpenNeko single-instance owner
also prevented a CDP target from appearing. Neither run reached a checkpoint or produced a screenshot, so no
pixel state was available for visual judgment and the UI result is **blocked**, not passed. The reports are:

- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-14T04-09-25.964Z-domain-management-workbench-development/report.json`
- `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-14T04-11-36.989Z-domain-management-workbench-packaged/report.json`

Import preview remains an additional unexecuted visual state because the current local UI fixture has no
isolated World package picker selection. Unit/contract tests cover the native chooser delegation and strict
preview/commit semantics, but they do not replace Electron visual evidence.

## Completion disposition

Implementation tasks 1–9 and focused verification task 10.1 are complete. Tasks 10.2–10.5 remain open where
their required aggregate, real-provider or visible Electron evidence is blocked or unauthorized. Advanced
World Story, Gameplay, complete Experience, Agent Play, realtime generation and external engine behavior remain
explicitly unavailable; deterministic Foundation runtime does not imply those capabilities.
