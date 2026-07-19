## 1. Close the pruned workspace

- [x] 1.1 Remove `@neko/workbench-core`, stale feature adapter exports, and quality ownership after proving there is no production import, dependency, or TypeScript alias.
- [x] 1.2 Inventory `@neko/market-core` consumers, remove marketplace-only Agent/TUI commands and storage, and move only retained portable Skill responsibilities to the PI Agent change.
- [x] 1.3 Replace stale named workspace globs and verify every retained `workspace:*` dependency resolves exactly once.

## 2. Restore the pruned Rust Media Engine

- [x] 2.1 Remove the superseded TypeScript FFmpeg process/server implementation and restore the Rust workspace, N-API/CLI hosts, native scripts, and TypeScript N-API extension wrapper.
- [x] 2.2 Reduce Cargo workspace members and dependencies to engine-types, codec, audio processing, GPU, runtime-media, media Kernel, Host API/HTTP, CLI, and N-API; add a dependency-closure assertion for removed crates.
- [x] 2.3 Remove Scene/Puppet/Model/ML/Device/Live/panoramic modules, services, facade fields, DTO exports, and removed-only dependencies from engine-types and engine-kernel.
- [x] 2.4 Reduce Host API controllers/router and Host HTTP routes to retained media, file, timeline, stream, task/health, effects, and preview capabilities with explicit unknown-action tests.
- [x] 2.5 Reduce CLI and N-API public methods to the same retained media contract while preserving one process-wide Engine API, frame-server lifecycle, cancellation, and disposal semantics.
- [x] 2.6 Preserve and test authorized file tokens, bounded HTTP Range streaming, FFmpeg seek, decoder reuse, audio/video streams, proxy, and export paths used by retained callers.
- [x] 2.7 Remove microphone/device-only audio capture and its dependencies unless retained media caller evidence requires it.

## 3. Align TypeScript consumers and distribution

- [x] 3.1 Shrink `@neko/neko-client` and retained consumers to the supported media Engine surface; remove Scene/Puppet/Model/ML/Device client methods and tests rather than leaving successful fallbacks.
- [x] 3.2 Make root build/release/quality/smoke scripts and `scripts/package-groups.json` include the retained Rust Engine and only retained products.
- [x] 3.3 Align release channels, VS Code extension pack, native asset packaging, and manifest tests to Engine, Tools, Preview, Assets, Agent, Cut, and Canvas; remove Dashboard from every distribution surface.
- [x] 3.4 Refresh Cargo and pnpm lockfiles and verify clean frozen dependency installation.
- [x] 3.5 Move the canonical Entity VS Code runtime, metadata binding, facade commands, source projection, and Inspector from Dashboard into Assets; add path-level consumer tests before deleting Dashboard.
- [x] 3.6 Remove Dashboard Webview/Extension/package code, Dashboard-only Cut task aggregation, and obsolete shared/quality metadata without a compatibility extension or fallback command.
- [x] 3.7 Remove the Tools Device Activity Bar/view/commands/menus/localization and all remaining Device client/type/quality surfaces; assert the retained manifest cannot advertise a providerless Device view.
- [x] 3.8 Remove Cut's left rail and self-hiding timeline-control state; move package and property-panel controls into the continuously visible timeline header while retaining its canonical export action.
- [x] 3.9 Make `neko-engine#build` the single sequential native owner, remove duplicate Turbo native dependencies, and order host-cli before host-napi to avoid Cargo lock contention.

## 4. Resolve and validate

- [x] 4.1 Run Cargo format, clippy, retained workspace tests, Cargo metadata/dependency-closure checks, N-API build/tests, and CLI smoke tests.
- [x] 4.2 Run Engine file-access/Range, probe/capture, seek/stream, proxy/export, and retained EngineClient contract tests with synthetic media fixtures.
- [x] 4.3 Build all retained Webviews and compile/package all retained release extensions through canonical root scripts.
- [x] 4.4 Run retained consumer path tests, VS Code manifest/release/quality/dependency/legacy/unused checks, strict OpenSpec validation, and `git diff --check`; record blocked platform runtime verification and residual risks.
  - Focused pruning paths pass; repository-wide test, legacy-debt, unused, and strict Agent gates remain red for the baseline items recorded in `verification.md`.
  - VS Code build/debug configuration regressions, the exact `build:dev` pre-launch command, Development Host launch, controller workspace identity, and native Engine startup pass.
- [x] 4.5 Rebuild and test Assets, Canvas, Agent, Cut, Tools, the VS Code extension pack, and retained release metadata after Dashboard/Device removal; verify Entity commands resolve from Assets and removed manifests/commands are absent.
- [x] 4.6 Run Cut/UI focused tests, retained builds, and Extension Development Host verification proving the left rail is absent and the timeline property control drives the right dock.
- [x] 4.7 Remove stale test, quality-script, and Webview functional scenario references to pruned packages; keep guardrails scoped to retained canonical paths and verify focused tests and change detection.
- [x] 4.8 Synchronize stable `docs/` architecture facts and navigation with the retained TUI/VS Code product roots, retained package set, and pruned Rust Media Engine; mark superseded Home, Workbench Core, and Market material as historical.
- [ ] 4.9 Restore CI closure by enforcing one-shot Vitest coverage invocation, formatting retained TypeScript sources, updating the retained Rust dependency graph past active advisories and unmaintained text dependencies, and passing Clippy, Cargo Deny, and ACT gates.
- [x] 4.10 Add a native build orchestration regression test and make N-API Cargo metadata/index progress visible before compilation.

## 5. Close post-pruning residual surfaces

- [x] 5.1 Record the residual contract audit and separate retained Preview/model and Canvas/scene semantics from removed Model/Puppet/Scene/Dashboard product ownership.
- [x] 5.2 Remove unconsumed no-owner extension IDs, client re-exports, file-icon contributions, Dashboard coverage ownership, removed-package quality entries, and stale dependency/documentation metadata without touching user project files.
- [x] 5.3 Add a retained-product absence guard covering public exports, extension discovery, manifests, quality ownership, and stable architecture documentation.
- [x] 5.4 Define and implement the user-data strategy for `.nka`/`.nks`/`.nkm`/`.nkp`, Canvas project previews, Assets native character export, and Cut `scene3d`/`puppet` timeline contracts; prove removed Engine/product paths cannot return success.
- [x] 5.5 Replace active Story/Auth/Market/Sketch/Model/Puppet inter-extension routes with retained package-owned services or remove the owning UI/action; do not preserve optional-extension fallbacks.
- [x] 5.6 Run focused shared/client/Agent/Tools tests, retained builds, dependency and unused checks, strict OpenSpec validation, and record Agent Evaluation disposition plus remaining data/runtime risk.
- [x] 5.7 Remove the retired Webview functional harness from CI change detection and root CI quality composition; add a regression proving UI runtime tests cannot re-enter GitHub workflows while retaining static removed-product metadata guards.
- [x] 5.8 Remove the no-owner recording-promotion, tracking, Live Entity-source, and removed Canvas delegate-target contracts with their registrations and tests.
- [x] 5.9 Remove the callable Market installation repository without dropping user database bytes, keep Auth/Market settings explicitly preservation-only, and update Assets legacy Market dependency rejection tests.
- [x] 5.10 Synchronize stable architecture, package README, comments, and fixtures so removed product names are not presented as current owners while retained media/model/scene/OAuth semantics remain explicit.
- [x] 5.11 Extend the retained-product absence guard and run focused shared/Assets/Canvas tests, affected builds, debt/unused/orchestration/media-closure gates, strict OpenSpec validation, and `git diff --check`.
