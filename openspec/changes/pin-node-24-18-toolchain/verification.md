## Verification Summary

- Risk level: L4 because the change affects CI and Release toolchain selection.
- Verified local default: Node `v24.18.0`, Corepack `0.35.0`, pnpm `10.29.2`, npm `11.16.0`.
- Verified Homebrew state: `node@24 24.18.0` is linked; `node 25.6.1_1` remains installed but unlinked for rollback.
- Verified contract boundary: development, CI, and Release use the exact `24.18.0` pin while Node runtime contracts remain `>=24.0.0` and the TUI target remains `node24`.

## Commands

- `openspec validate pin-node-24-18-toolchain --strict`: passed.
- `pnpm check:local-metadata-runtimes`: passed for 18 targets.
- Node SQLite contract tests: 20 passed.
- Bun SQLite contract tests: 6 passed.
- TUI Node 24 build: passed.
- `pnpm build`: passed.
- `pnpm test`: passed, 25 Turbo tasks successful.
- `pnpm check`: passed with no dependency violations across 1,550 modules and 5,536 dependencies.
- `pnpm check:test-orchestration`: passed, 37 tests and both ownership audits passed.
- `pnpm ci:local`: passed, including formatting, lint, build, full tests, repository quality checks, runtime matrices, test orchestration, and strict validation of all 22 OpenSpec items.
- `git diff --check`: passed.

## Quality Review

- No findings caused by this change.
- The root `.node-version` is the single exact toolchain source consumed by every `actions/setup-node` step.
- Public runtime contracts, VS Code Extension Host behavior, Bun, Rust, Proto, user data, and media behavior are unchanged.
- No Node 25/26 compatibility branch, fallback, second bootstrap path, or package-local version policy was added.

## Remaining Risks

- Future Node 24 security releases require an explicit `.node-version` update and the same validation gates.
- Other local projects that rely on the unversioned Homebrew `node` link now receive Node 24.18.0. Rollback is `brew unlink node@24 && brew link node`.
- Existing lint, React `act(...)`, Browserslist age, and bundle-size warnings remain outside this change; they did not fail `pnpm ci:local`.
