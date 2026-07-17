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

### Runtime residual risk

- Preview document migration: a VS Code Debugger Development Host rooted at `${HOME}/Git/neko-test` opened isolated synthetic PDF, EPUB, DOCX, and CBZ files while `neko.neko-engine` was unavailable. The Preview Node service listened on loopback and returned its document-specific CORS/PNA route diagnostic. The declarative DOM/console scenario remains blocked because the parent VS Code renderer was not started with the dedicated CDP endpoint; the generated report classifies this as infrastructure failure before assertions.
- A real TUI evaluation cannot observe the VS Code Engine extension capability catalogue; no mock result is claimed as real Agent behavior acceptance.
