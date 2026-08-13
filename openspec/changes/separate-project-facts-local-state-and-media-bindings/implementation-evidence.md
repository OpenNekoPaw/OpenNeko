# Implementation Evidence

## 2026-08-13 — Project-local Media Library boundary

Implemented the canonical `MediaLibraryContentLocator`, exact Project-local binding repository and
resolver, owner-preserving Resource Browser roots/content, Agent and Text Editor reference paths,
Canvas authorization/copy paths, and portable snapshot collection. The retired `neko/assets`
workspace-link implementation and public Node exports are deleted. Project-local `.neko` remains
disposable: its absence produces an empty binding set and never synthesizes project facts.

Architecture evidence:

- Content references carry only logical library name and descendant path. Markdown uses the portable
  `media-library:<encoded-library>/<encoded-descendant>` representation and resolves it through the
  exact Project binding before Host resource publication.
- Resource Browser library roots do not carry a file locator. Content children carry exact
  `media-library` locators; preload/Renderer recovery plans contain no physical path or global
  connection identity.
- Binding add/relink/remove uses plan-confirm-apply with reference and binding fingerprints. Removal
  deletes only the selected `.neko/media-libraries/<library>.json` record.
- Portable snapshot planning rereads authoritative owner references and current bindings, rejects
  incomplete/missing/nested-link sources, copies only referenced bytes, rewrites only staged owner
  documents, excludes `.neko`, and publishes by atomic rename.
- Project composition is now derived from the synchronized Project identity, exact Chara/World catalogs,
  current document references, and per-record Entity-to-Character association facts. The monolithic
  composition contract/service/repository and Desktop initialization path are deleted.
- Product sync planning reads the exact `neko/project.json` identity, returns target-free relative file
  entries, and excludes project `.neko`, hidden/tool directories, and every symbolic link before
  traversal. Portable planning rereads the fixed Character, World, Canvas, Cut, and Entity owners,
  fingerprints that dependency closure, and fails visibly for missing versions or an unavailable exact
  Asset/package export owner.
- Staged Project JSON facts are checked for machine-local fields and retired local locators before the
  atomic publish. Leakage fixtures preserve source `.neko` bytes while proving that connection IDs,
  credentials, physical-looking targets, unknown files, and links do not enter sync plans or packages.
- The isolated offline converter inspects only an explicitly selected Workspace and user-global Media
  root. It recognizes the retired composition, direct retired links, and Canvas/Cut/Entity linked-media
  locators without writing; rejects unassignable explicit dependency rows and ambiguous connections;
  then requires the inspection fingerprint plus an exact Project confirmation before staging. The
  original directory becomes a retained sibling backup and the fully validated converted tree is
  published by rename. The product reachability audit rejects imports, exports, builds, tests, or CI
  routes back into `tools/offline-repair`.

Focused verification completed:

- Real-project read-only inspection on `2026-08-14` recognized the exact retired Canvas owners in
  `灯神` (11 references), `Blame` (6 references), and `neko-test` (26 references) with `ready: true`
  and no diagnostics. No project bytes were changed.
- `DocumentEntryContentLocator` now keeps either an exact Workspace File or Media Library container
  source. The Node reader authorizes and resolves that source owner before reading the requested entry;
  the offline converter rewrites only the retired nested source and still requires exact confirmation,
  immutable backup, atomic publish, and complete post-validation.
- `pnpm --filter @neko/content exec vitest run src/contracts/__tests__/content-locator.test.ts src/contracts/__tests__/document-reading.test.ts` — 2 files, 14 tests passed.
- `pnpm --filter @neko/content typecheck` and `pnpm --filter @neko/content test` — typecheck passed; 19 files, 122 tests passed.
- `pnpm --filter @neko/assets-node exec vitest run src/project-media-library-content-handler.test.ts src/project-content-reference-readers.test.ts` — 2 files, 9 tests passed.
- `pnpm exec vitest run tools/offline-repair/retired-project-layout.test.ts` — 1 file, 4 tests passed.
- `pnpm --filter @neko/app-desktop exec vitest run src/main/desktop-canvas-material-authoring.test.ts src/main/desktop-canvas-runtime.test.ts` — 2 files, 33 tests passed.
- Content, Assets Node, Entity Domain, Chara, Generation, Agent Runtime, and Desktop TypeScript checks passed.
- The strict standalone offline-tool TypeScript check, `openspec validate separate-project-facts-local-state-and-media-bindings --strict`, `pnpm check:offline-repair-reachability`, and `git diff --check` passed.
- `pnpm check:content-access-boundaries` and `pnpm check:package-boundaries` passed. The current
  `pnpm check:no-internal-versioning` run remains blocked by pre-existing dirty-worktree Chara/Project
  occurrences and stale allowance fingerprints outside this fix; no internal-version field was added
  by the Content/Canvas/offline-conversion changes.

- `pnpm --filter @neko/content test` — 19 files, 122 tests passed.
- `pnpm --filter @neko/markdown test` — 9 files, 76 tests passed.
- `pnpm --filter @neko/assets-domain typecheck` — passed.
- `pnpm --filter @neko/assets-domain test` — 17 files, 128 tests passed after retired suites were removed.
- `pnpm --filter @neko/assets-node typecheck` — passed.
- `pnpm --filter @neko/assets-node test` — 17 files, 82 tests passed after retired suites were removed.
- `pnpm --filter @neko/assets-webview test` — 7 files, 61 tests passed, including package-owned
  Project storage context-menu exclusion.
- `pnpm --filter @neko/host test` — 38 files, 312 tests passed.
- `pnpm --filter @neko/text-editor-domain test` — 5 files, 56 tests passed.
- `pnpm --filter @neko/text-editor-node test` — 2 files, 10 tests passed.
- `pnpm --filter @neko/text-editor-webview test` — 4 files, 47 tests passed.
- `pnpm --filter @neko/agent-webview exec vitest run src/components/ChatView/InputArea/MentionMenu.test.tsx src/components/ChatView/InputArea/InputArea.test.tsx` — 2 files, 74 tests passed.
- `pnpm --filter @neko/canvas-node test` — 4 files, 22 tests passed.
- `pnpm --filter @neko/app-desktop typecheck` — passed.
- `pnpm --filter @neko/app-desktop exec vitest run src/main/desktop-canvas-runtime.test.ts` — 27 tests passed.
- `pnpm --filter @neko/app-desktop exec vitest run src/architecture-boundary.test.ts` — 22 tests passed.
- `pnpm --filter @neko/app-desktop exec vitest run src/main/desktop-resource-browser-source.test.ts src/main/desktop-resource-browser-runtime.test.ts src/preload/resource-browser-recovery-bridge.test.ts src/renderer/DesktopResourceBrowserSurface.test.ts` — 4 files, 27 tests passed.
- `pnpm --filter @neko/project typecheck` — passed.
- `pnpm --filter @neko/project exec vitest run src/project-facts-projection.test.ts src/project-content-host.test.ts src/project-local-authoring-host.test.ts` — 3 files, 13 tests passed.
- `pnpm --filter @neko/project-node typecheck` — passed.
- `pnpm --filter @neko/project-node test` — 3 files, 7 tests passed.
- `pnpm --filter @neko/local-metadata test` — 15 files, 101 tests passed.
- `pnpm --filter @neko/chara test` — 37 files, 199 tests passed.
- `pnpm --filter @neko/chara-node test` — 8 files, 40 tests passed.
- `pnpm --filter @neko/world test` — 8 files, 29 tests passed.
- `pnpm --filter @neko/world-node test` — 4 files, 11 tests passed.
- `pnpm --filter @neko/entity-domain test` — 11 files, 57 tests passed.
- `pnpm --filter @neko/entity-node test` — 8 files, 30 tests passed.
- `pnpm --filter @neko/canvas-domain test` — 35 files, 287 tests passed.
- `pnpm --filter @neko/cut-domain test` — 6 files, 61 tests passed.
- `pnpm --filter @neko/agent-contracts test` — 45 files, 282 tests passed.
- `pnpm --filter @neko/agent-runtime test` — 125 files, 1,180 tests passed.
- `pnpm --filter @neko/agent-webview test` — 102 files, 784 tests passed.
- `pnpm --filter @neko/preview-domain test` — 5 files, 31 tests passed.
- `pnpm --filter @neko/search-domain test` — 18 files, 89 tests passed.
- `pnpm --filter @neko/app-desktop exec vitest run src/architecture-boundary.test.ts src/main/desktop-agent-content-effects.test.ts src/main/desktop-character-creation-source-authority.test.ts src/main/desktop-resource-browser-source.test.ts src/main/desktop-resource-browser-runtime.test.ts src/preload/resource-browser-recovery-bridge.test.ts src/renderer/DesktopResourceBrowserSurface.test.ts src/shared/resource-browser-bridge-contract.test.ts` — 8 files, 62 tests passed.
- `pnpm typecheck` — all 49 participating workspace packages passed.
- `pnpm --filter @neko/assets-node exec vitest run src/portable-media-library-snapshot.test.ts` — 1 file, 14 tests passed.
- `pnpm --filter @neko/cut-domain typecheck` — passed.
- `pnpm --filter @neko/cut-domain exec vitest run src/codec.test.ts` — 1 file, 17 tests passed.
- `pnpm --filter @neko/assets-node exec vitest run src/project-content-reference-readers.test.ts src/portable-media-library-snapshot.test.ts` — 2 files, 18 tests passed.
- `pnpm exec vitest run tools/offline-repair/retired-project-layout.test.ts` — 1 file, 3 tests passed.
- `pnpm exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --noUncheckedIndexedAccess --noImplicitOverride --skipLibCheck --types node tools/offline-repair/retired-project-layout.ts tools/offline-repair/retired-project-layout.test.ts` — passed.
- `pnpm check:offline-repair-reachability` — 3 audit tests passed; repository reachability audit passed.
- `pnpm install --lockfile-only` — completed; one transient registry retry and the pre-existing workspace-cycle warning were reported.
- `git diff --check` — passed.
- `pnpm check:unused` — passed after declaring the new Text Editor Content contract dependency.
- `pnpm check:legacy-debt` — passed with zero blocking production debt classifications.

Full repository verification completed after the Agent Media Library integration:

- `pnpm build` — passed; all Webview builds and the macOS Apple Silicon Electron package completed,
  and the packaged executable was verified.
- `pnpm test` — passed for all participating packages. Desktop completed 104 files / 679 tests; its
  expected error-boundary test diagnostics remained visible on stderr without failing the suite.
- `pnpm check` — passed; Knip reported configuration hints only and the dependency audit found no
  violations across 1,647 modules / 5,608 dependencies in the final worktree.
- `pnpm check:legacy-debt` — passed with zero blocking production classifications.
- `pnpm check:unused` — passed with configuration hints only.
- `pnpm typecheck` — all 49 participating workspace packages passed.
- `pnpm check:openspec` — strict validation passed for all 92 changes/specs.
- `pnpm check:offline-repair-reachability` and `git diff --check` — passed.
- The quality gates after `check:no-internal-versioning` were run independently: package roles and
  boundaries, product reachability/brand, shared exports, Content/Application/Agent/Canvas/Engine/
  Webview boundaries, strict TypeScript/Agent, local metadata runtime, storage authority, and test
  orchestration all passed.

Agent Evaluation disposition and evidence:

- Disposition: `update` the existing owner `agent-runtime.media-library-content`; no second Evaluation
  owner or case-specific executable JavaScript was added.
- The fixture now declares an external global Media Library. The shared isolated Desktop runner copies
  its source outside the Workspace, then uses the visible Asset Center registration control and the
  visible Project recovery confirmation control before the normal Agent workflow starts.
- `linked-media-search-read` now uses the exact portable `media-library` locator through
  `input_ref -> ReadImage -> Project ContentReadService`. The boundary case
  `retired-workspace-prefix-rejected` requires `neko/assets/...` to fail and asserts that ReadImage and
  QueryProjectSearch do not participate as alternate success paths.
- `pnpm test:agent:eval` passed 45 files / 310 tests and strict dry-run validation for 26 suites / 77
  cases. This is key-free authoring/harness evidence only; no explicitly authorized provider/model/cost
  run was performed, so it is not claimed as real Agent behavior acceptance.

UI validation (advisory):

- Scope: global Media Library registration, Project required-unlinked state, exact recovery confirmation,
  recovered content projection, Agent mention selection, and native image submission.
- Authoritative runtime: isolated visible Electron Desktop through the production Renderer/preload/Main
  path on macOS Apple Silicon.
- `pnpm test:local:ui --scenario desktop-agent-linked-media-mention --target development` passed at
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-13T15-23-11.970Z-desktop-agent-linked-media-mention-development/report.json`.
- The scenario begins without project `.neko` binding state, registers a physically separate global
  library, observes `required-unlinked`, confirms the exact recovery candidate, observes `available`,
  selects `workspace/library-image.png`, and proves one exact native provider image. No `.neko`, global
  connection identity, or physical target appeared in the UI or Agent payload.
- The same scenario then writes one malformed `Broken` binding beside the valid `workspace` binding,
  restarts the full application, and proves `Broken: binding-invalid` while `workspace: available`
  remains usable. The restart also loads one malformed Project Entity-to-Character association beside a
  valid World: the association diagnostic remains in the Character group while `Valid World` remains
  `available`. It then deletes the complete Project `.neko`, restarts through the exact Project entry,
  proves both media requirements return to `required-unlinked`, and confirms `workspace` recovery again.
- The final visible check selects the synchronized `neko` Project-fact root and opens its keyboard
  context menu. The only visible action is reveal; generic file/folder/document creation and Trash
  actions are absent, while a Host-side existence check proves the root was preserved. The package
  owner policy continues to reject direct generic mutation attempts in Node tests.
- All nine 1440×960 screenshots were inspected directly. The four-column Workspace layout, warning,
  invalid and available states, expanded file rows, mention token, completed Conversation, post-restart
  isolation, post-deletion recovery, and the reveal-only reserved-root menu were visible without
  clipping, overlap, stale dialogs, or residual processing state.
- Result: `pass` for this inventory. It also covers a fresh Project, absent disposable binding state,
  clone-style relink requirement, explicit confirmed recovery, malformed binding isolation, and full
  Project-local `.neko` deletion/reinitialization plus invalid Project association isolation, but does
  not cover every task 8.4 failure matrix entry.

Quality review and remaining risk:

- Risk classification: L4 because Project authority, media locators, Agent content delivery, sync, and
  portable packaging are core creative/release paths.
- No blocking code finding was established for this change. Canonical owner, path, trust-boundary,
  storage, dependency, and visible Desktop checks passed; the retired successful paths are deleted or
  fail closed.
- `pnpm check:quality` remains blocked at its first `check:no-internal-versioning` step by the current
  large dirty-worktree baseline: stale allowances plus hundreds of new Character/version/revision and
  other occurrences outside this change's review boundary. The remaining quality commands pass when
  run independently. This change's rejection/offline-tool identifiers were renamed from `legacy-*` to
  `retired-*` so they do not add that audit noise.
- Task 8.4 remains open only for atomic portable-package UI evidence. Deleted/reinitialized `.neko`,
  malformed binding isolation, invalid Project association isolation, and generic Project-fact mutation
  exclusion now have visible full-restart evidence. The remaining user path crosses Electron's native
  save-destination dialog, which the current CDP runner does not own; direct IPC execution is not an
  acceptable substitute for this visible acceptance step.
- Task 8.5 remains a release blocker: removable/NAS measurements, Windows local directory/junction/UNC,
  and measured large-package cancellation/cleanup were not available on this macOS host.
- Task 8.6 remains open because it requires all preceding required validation tasks to be complete.
