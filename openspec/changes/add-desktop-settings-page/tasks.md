## 1. Settings contract and persistence

- [ ] 1.1 Define the versioned Desktop application settings contract, defaults, request/response/event parsers, optimistic revision errors, and authority-isolation tests.
- [ ] 1.2 Implement the atomic Desktop settings repository and service with serialized updates, subscriptions, invalid-file diagnostics, and persistence tests.

## 2. Host composition and runtime projection

- [ ] 2.1 Add sender-bound AppHost and IPC/preload settings routes, event sequencing, lifecycle disposal, and producer/consumer contract tests.
- [ ] 2.2 Apply theme and startup preferences in Electron Main, expose the Agent-owned advanced config action without writing Desktop settings, and test both ownership paths.

## 3. Desktop settings experience

- [ ] 3.1 Add a standalone responsive Settings surface with back navigation, category navigation, search, General, Appearance, Creative, and Agent sections using shared UI/theme primitives.
- [ ] 3.2 Replace the old settings-button-to-Agent-config path, apply theme and locale updates live, and preserve the prior Home section or project surface when returning.
- [ ] 3.3 Pass the resource browser display default through its public Root contract without overriding existing per-project display state.
- [ ] 3.4 Add and update English and Chinese translations plus focused accessibility and interaction tests.

## 4. Validation and delivery

- [ ] 4.1 Run focused Desktop and Assets tests, Desktop/Assets typecheck, boundary checks, strict OpenSpec validation, production Electron packaging, and `git diff --check`.
- [ ] 4.2 Verify Home and `/Users/feng/Git/neko-test` Settings flows in real Electron for light/dark, locale, persistence, return navigation, startup target, resource default, and Agent advanced config ownership; record remaining risk.
