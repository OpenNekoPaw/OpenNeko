## Verification (2026-07-16)

### Passed

- Rust: `cargo fmt --all`, `cargo check --workspace`, `cargo test --workspace --no-fail-fast` (668 tests), and `cargo clippy --workspace --all-targets -- -D warnings`.
- Native hosts: release N-API build, release CLI build, and CLI smoke.
- Closure and contracts: media dependency-closure script, `@neko/neko-client` (90 tests), Engine provider/Agent pruning regressions, file token/Range/seek/stream tests, release-channel checks, and strict OpenSpec validation.
- Host document boundary: `@neko/content` tests, focused Agent/Canvas/Preview consumer tests, extension bundles, frozen pnpm installation, and dependency-cruiser.
- Distribution: `pnpm build` and `pnpm compile:ts-vsix` completed for the retained release set.
- Preview output ownership: the regression test, forced two-package Turbo build, standalone Preview compile, and forced full root build pass without concurrent Vite `dist` cleanup.
- VS Code debug path: build/config regression tests pass; `./build.sh --dev --skip-package` completed 11/11 Turbo tasks; `Debug Dev (All)` opens the explicitly designated `${HOME}/Git/neko-test` workspace, and the controller reports that exact workspace identity.
- Engine Development Host runtime: the Rust N-API Engine initialized Metal on Apple M2 and started its loopback HTTP frame server.
- Agent evaluation harness: `pnpm test:agent:eval` passed 274 tests and the 23-suite/43-case dry-run; focused perception-routing cases validated in dry-run.
- Hygiene: `git diff --check` passed.
- Dashboard/Device pruning: Dashboard package, release/build/debug registrations, functional scenario, and Cut aggregation command are absent; Tools no longer contributes the Device container, view, commands, menus, localization, client paths, or public Device types.
- Entity ownership: `@neko/entity` passed 56 tests; focused Entity/Assets/Tools/shared regressions passed; Assets, Tools, Cut, Canvas, and Agent compiled; extension-pack and release-channel tests passed; `pnpm install --frozen-lockfile`, `pnpm compile:ts-vsix`, and `pnpm package:vscode` passed for the retained set.
- VS Code runtime: a fresh Extension Development Host loaded no Dashboard extension target. Opening Assets Entity Inspector created a `neko.neko-assets` Webview target titled `Entity Inspector`; its DOM rendered `No entity selected.` without the missing-provider message, and no Device view was present. This runtime check exposed and verified the required `type: webview` manifest contract.
- Cut control consolidation: the full Cut Webview suite passed 489 tests, the full shared UI suite passed 178 tests, `@neko/ui` typecheck passed, the Cut Webview and Extension compiled, and `pnpm compile:ts-vsix` rebuilt all retained extensions. In a fresh Cut Webview target, the DOM contained no creative left-rail or Cut toolbar container, exposed package/property controls inside `#cut-main-panel-tools`, and retained the existing timeline export control.
- Cut runtime interaction: clicking the timeline property control created `#cut-property-panel` and changed `aria-expanded`/`aria-pressed` from `false` to `true`; clicking again removed the dock and restored both states to `false`. Visual evidence was captured at `/tmp/cut-simplified-workbench-runtime.png`. The target console contained only existing media lifecycle logs, the known `preset:list` diagnostic, and the VS Code `local-network-access` warning.

### Repository baseline blockers

- `pnpm test` is not green: existing concurrent TUI direct-media/market tests and two Canvas Webview interaction tests fail before Turbo runs the remaining packages. Affected pruning paths have separate passing focused tests.
- `pnpm check:legacy-debt` reports 200 blockers in the existing Agent/TUI/shared debt baseline (191 `migrate-now`, 9 `needs-review`).
- `pnpm check:unused` reports two existing test-only unlisted `@neko/skills` imports, 71 existing unused exports, and one duplicate export. The pruned panoramic CSS residual was removed.
- `pnpm check:test-orchestration` still reports seven stale pruning failures: removed Home/Audio/Auth/Live/Market/Model/Puppet/Sketch/Story ownership entries, removed Story/Home functional scenarios, and a removed Story activation-boundary source path. The new build/debug configuration regressions pass inside that run.
- The focused functional scenario-selection test still encounters the same removed Story/Home scenario baseline; the Dashboard scenario itself was removed and the all-VS-Code expected selection was updated.
- strict Agent extension typecheck remains blocked by pre-existing errors outside the changed pruning paths.

### Native build orchestration follow-up (2026-07-18)

- `node --test scripts/test-orchestration/native-build-orchestration.test.mjs` proves the Turbo Engine build plan contains no duplicate host-cli/host-napi native tasks, the package command owns one CLI-then-N-API sequence, and incomplete native outputs are not cached by Turbo.
- `pnpm --dir packages/neko-engine test:scripts` passes 14 script tests plus the retained Rust media dependency-closure check, including visible Cargo metadata preflight and fail-before-N-API behavior.
- A clean-source release `pnpm --filter @neko-engine/host-napi build:native` completed in 9m46s; the immediate warm-cache repeat completed in 1.86s with Cargo reporting 0.20s.
- `otool -L packages/neko-engine/packages/host-napi/neko-engine.darwin-arm64.node` confirms the resulting host binary links the Homebrew FFmpeg 8 `libav*` and `libsw*` dylibs.
- `pnpm turbo run build --filter=neko-engine --force` passed as one uncached Turbo task and executed host-cli, host-napi, then the TypeScript Extension bundle in order; overlapping top-level builds produced visible Cargo lock waits rather than sibling native task contention.
- `pnpm check:test-orchestration` passed 79 tests plus ownership, coverage, and Webview scenario dry-run audits.
- `openspec validate align-pruned-workspace-build --strict`, focused Prettier checks, and `git diff --check` pass.

### Runtime residual risk

- Preview document migration: a VS Code Debugger Development Host rooted at `${HOME}/Git/neko-test` opened isolated synthetic PDF, EPUB, DOCX, and CBZ files while `neko.neko-engine` was unavailable. The Preview Node service listened on loopback and returned its document-specific CORS/PNA route diagnostic. The declarative DOM/console scenario remains blocked because the parent VS Code renderer was not started with the dedicated CDP endpoint; the generated report classifies this as infrastructure failure before assertions.
- A real TUI evaluation cannot observe the VS Code Engine extension capability catalogue; no mock result is claimed as real Agent behavior acceptance.

## Post-pruning residual cleanup (2026-07-19)

### Passed

- Removed project formats now have one fail-closed policy: `.nka`, `.nks`, `.nkm`, and `.nkp` are rejected before source reads, mutations, output creation, or Engine dispatch. The Rust CLI `.nka` loader is deleted, and Assets rejects native `.nkp` export before opening an output file.
- Cut no longer accepts `scene3d` or `puppet` elements in Proto, generated types, schema, Extension, or Webview paths. The reserved Proto names prevent accidental field reuse without preserving a successful runtime path.
- Active Story/Auth/Market/Sketch/Model/Puppet routes and optional-extension fallbacks are removed. Retained Fountain parsing is host-neutral; Agent plugin availability and transfer contracts expose only retained Canvas/Cut destinations.
- Scene Proto/generated contracts, the no-owner viewport stack, Model project templates, Story provider adapter, Market client/contracts, VoicePack install target, Auth gateway/SSO paths, and unused Preview staging/protocol modules are absent.
- `pnpm check`, `pnpm check:legacy-debt`, `node scripts/check-application-boundaries.mjs --self-test`, the full application-boundary scan, strict OpenSpec validation, and `git diff --check` pass. The unused-code check has no findings, dependency-cruiser reports no violations, and the legacy-debt gate has zero blocking findings.
- `pnpm build` passes all 10 root Turbo build tasks, including the release Rust CLI/N-API build. Retained UI, Assets, Agent, Preview, Canvas, Cut, and Tools package builds also pass independently.
- Focused format, export, plugin-transfer, Storyboard, Preview isolation, stream-descriptor, Search, Entity, Canvas, Cut, Agent provider/profile/runtime, and Rust CLI regressions pass. `pnpm test:agent:eval` passes 39 files/278 tests and the 23-suite/47-case dry-run.
- Proto generation is idempotent after deletion: `pnpm generate:types` discovers only `diff.proto` and `timeline.proto`, and the generated-tree SHA is unchanged by a second generation pass.
- The second-pass audit removed the no-owner recording-promotion command/service/contracts, Live tracking contract, `live` Entity requirement source, and Sketch/Puppet Canvas delegate targets. Shared focused tests pass, and the Assets extension plus `@neko/asset` build successfully.
- The callable Market installation repository, public receipt types, SQLite schema export, and repository tests are removed. A focused preservation test proves an existing `market_installations` table and its bytes survive opening/migrating the retained store while `LocalMetadataRepositories` exposes no Market repository.
- `pnpm build`, `pnpm check`, application-boundary/absence checks, legacy-debt ledger validation, test orchestration, Engine media-closure validation, strict OpenSpec validation, and `git diff --check` pass after the second-pass cleanup.

### Remaining risk and disposition

- Preservation-only Auth/Market config sections remain round-trippable because deleting user settings requires a separate migration. Existing SQLite Market table bytes are not dropped, but the retained runtime no longer exports a schema migration, repository, receipt type, route, client, provider-card layer, or successful asset resolution path.
- `puppet-bone` remains recognized only as a persisted `EntityAssetBindingRole` so existing metadata can be diagnosed safely. It is not an active `RepresentationKind`, is not selected by fallback, and native export rejects it before writing.
- Preview's read-only standard 3D model inspection and Canvas narrative `scene` semantics are retained product capabilities; the absence guard deliberately distinguishes them from removed Model/Scene authoring products.
- Agent Evaluation disposition: prompt/Skill and capability examples changed, so the focused media-production and script-generation cases were validated in dry-run and the full key-free harness passed. No credentialed provider run was performed, so the result is not claimed as real Agent behavior acceptance.
- The second root `pnpm test` run reached unrelated current-work failures: Preview `ModelPreviewSourceSession.ts` violates an existing local-resource-root guard, and Canvas foundational media now renders `object-contain` while its test expects `object-cover`. Cleanup-specific narrative and plugin-transfer failures found during that run were corrected and pass focused reruns.
- The latest root `pnpm test` run stops on an unrelated active Agent Webview configuration expectation (`configured-gateway:auto` versus `deepseek-direct:deepseek-chat`); the full shared run separately reaches 1438/1439 tests with only the concurrently edited Preview resource-root guard failing. Cleanup-specific focused suites pass.
- `pnpm check:quality` progresses through release, brand, debt, content, application, Agent, and Canvas boundaries, then stops on an unrelated obsolete keyboard-reporter import in Agent `AppShell.tsx`. Those active user changes were preserved rather than folded into this cleanup.

### CI UI-test closure (2026-07-19)

- GitHub workflow change detection now emits only TypeScript, Rust, Proto, and OpenSpec outputs; it does not load the deleted `scripts/webview-functional/` harness.
- `check:test-orchestration`, which runs inside the repository quality CI job, contains only static orchestration tests and ownership/coverage audits. UI runtime acceptance remains a local Extension Development Host responsibility.
- `node --test scripts/test-orchestration/ui-functional-workflow.test.mjs`, `pnpm check:test-orchestration`, and both application-boundary self-test/scan paths pass.

### Strict extension type closure (2026-07-19)

- `pnpm check:strict-extensions` now passes after closing 23 retained-contract errors across Pi permissions, ProjectQuality evidence, LLM parameter projection, generated-output adoption, Semantic Document access, workspace identity recovery, and semantic metadata freshness projection.
- Focused deterministic regressions pass: Pi capability bridge (10), ProjectQuality orchestration (5), Platform LLM/generated-output (21), Semantic Document (8), and workspace identity/semantic metadata (14), for 58 tests total. The ProjectQuality failure case proves failed runtime/readiness envelopes may omit `data` while still projecting explicit failed metrics and diagnostics.
- Repository static gates pass: `pnpm check`, `pnpm check:quality`, strict OpenSpec validation, focused Prettier validation, and `git diff --check`. `check:quality` includes the retained boundary, strict-config, strict-extension, local-metadata runtime, test-orchestration, and OpenSpec audits without running UI or provider-backed behavior.
- The fixes preserve public readonly/shared contracts and do not add type assertions, compatibility fallbacks, UI tests, provider credentials, or real API access.
- Agent Evaluation disposition is `excluded`: the Pi permission change removes only the redundant `requiresConfirmation !== true` half of an `auto` branch after the preceding `requiresConfirmation === true` branch has already returned. The user-visible permission behavior, owning Pi capability bridge, and canonical permission path are unchanged; the existing eight-case permission matrix plus strict TypeScript closure deterministically prove `plan` denial, explicit-confirmation precedence, read-only allowance, `auto` allowance, and `ask` confirmation without permitting a fallback path. No suite coverage delta or provider-backed behavior is required.
- Additional standalone Agent and Platform package `tsc` runs remain blocked by pre-existing test-fixture drift outside the changed files, including stale session/MCP/work-item scope fixtures and missing `modelGroups`/provider fields. The canonical CI production graph is covered by the passing `check:strict-extensions`; the unrelated fixture debt was not expanded into this CI fix.
- Task 4.9 remains open for its broader Rust advisory, Cargo Deny, Clippy, coverage, and ACT closure; this sub-step closes only the strict-extension blocker reported by GitHub CI.

### Cross-platform Engine test type closure (2026-07-19)

- Root cause: the Engine Extension tsconfig used `src/**/*Test.*`. TypeScript path matching on case-insensitive macOS also excluded lowercase `.test.ts`, while Linux excluded only names containing uppercase `Test`; CI therefore compiled a larger unit-test graph than local development.
- The tsconfig now excludes only the standalone manual `ExportIntegrationTest.ts` by exact path. `--listFilesOnly` proves `NativeMediaEngine.test.ts` and `ExportService.test.ts` participate in the canonical local graph while the manual integration file remains absent.
- The audio decoder test narrows the `audio` frame discriminant before reading typed samples. The export test fails visibly when the expected mock call or JSON payload is absent. Neither path uses a type assertion or optional fallback to hide an invalid fixture.
- `pnpm check:strict-extensions`, the explicit cold two-file TypeScript check, both focused Engine test files (6 tests), `pnpm check`, `pnpm check:quality`, focused Prettier validation, and `git diff --check` pass. No UI, native runtime, provider, or real API test was required because production Engine behavior is unchanged.
