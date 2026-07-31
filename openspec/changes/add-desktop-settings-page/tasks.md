## 1. Settings contract and persistence

- [x] 1.1 Define the versioned Desktop application settings contract, defaults, request/response/event parsers, optimistic revision errors, and authority-isolation tests.
- [x] 1.2 Implement the atomic Desktop settings repository and service with serialized updates, subscriptions, invalid-file diagnostics, and persistence tests.

## 2. Host composition and runtime projection

- [x] 2.1 Add sender-bound AppHost and IPC/preload settings routes, event sequencing, lifecycle disposal, and producer/consumer contract tests.
- [x] 2.2 Apply theme and startup preferences in Electron Main, expose the Agent-owned advanced config action without writing Desktop settings, and test both ownership paths.

## 3. Desktop settings experience

- [x] 3.1 Add a standalone responsive Settings surface with back navigation, category navigation, search, General, Appearance, Creative, and Agent sections using shared UI/theme primitives.
- [x] 3.2 Replace the old settings-button-to-Agent-config path, apply theme and locale updates live, and preserve the prior Home section or project surface when returning.
- [x] 3.3 Pass the resource browser display default through its public Root contract without overriding existing per-project display state.
- [x] 3.4 Add and update English and Chinese translations plus focused accessibility and interaction tests.
- [x] 3.5 Align Settings with the canonical Home/project Desktop Shell by sharing the application sidebar frame and brand header, reusing navigation/main-surface styles, and removing the parallel Settings page visual system.
- [x] 3.6 Reuse the complete application sidebar contract for Settings: shared navigation buttons, live resize handle and persisted workbench width, plus Home heading typography without Settings-only font rules.
- [x] 3.7 Keep Settings navigation controls consistently sized and horizontally centered in a widened application sidebar while preserving left-aligned icons and text.
- [x] 3.8 Replace the fixed Settings control-column width with a continuous sidebar-relative width and responsive safe gutters.

## 4. Validation and delivery

- [x] 4.1 Run focused Desktop and Assets tests, Desktop/Assets typecheck, boundary checks, strict OpenSpec validation, production Electron packaging, and `git diff --check`.
- [x] 4.2 Verify Home and `/Users/feng/Git/neko-test` Settings flows in real Electron for light/dark, locale, persistence, return navigation, startup target, resource default, and Agent advanced config ownership; record remaining risk.
- [x] 4.3 Run focused Settings/Desktop tests, Desktop typecheck, strict OpenSpec validation, `git diff --check`, and a real Electron visual comparison of Home, project workspace, and Settings.
- [x] 4.4 Add red-capable regressions for Settings typography and resize, then verify the shared resize path and font hierarchy in real Electron across Home, project workspace, and Settings.
- [x] 4.5 Add a red-capable wide-sidebar layout regression and verify control sizing, centering, and text alignment in real Electron.
- [x] 4.6 Add a red-capable regression for dynamic control width and verify multiple sidebar widths in real Electron.
