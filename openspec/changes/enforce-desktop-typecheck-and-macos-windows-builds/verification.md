## Verification

Date: `2026-08-02`

Local host: `darwin-arm64`

## Decision

- `darwin-arm64` is the sole Desktop package and release target.
- Windows and Linux remain required CI compatibility-test hosts, but do not run Forge, create a
  package, or upload a product artifact.
- Agent Evaluation is excluded because this change does not alter prompts, Skills, tool routing,
  providers, AgentSession behavior, or Desktop Agent event projection.
- Graphical Electron acceptance is excluded because this change does not alter renderer behavior,
  IPC, CSP, focus, or media interaction. Native packaging and executable closure are verified
  instead.

## Regression Evidence

Before implementation, the focused orchestration suite failed seven assertions because Windows was
still present in the package target, Sharp, CI artifact, and Forge contracts, and the macOS release
modules did not exist. After implementation, the same focused suite passed all 26 tests.

## Local Evidence

- `node --test scripts/test-orchestration/*.test.mjs` passed 86 tests.
- `pnpm --filter @neko/media test -- --run` passed 10 files and 144 tests.
- `pnpm typecheck:desktop` passed.
- Strict validation passed for this change and `establish-macos-release-pipeline`.
- `pnpm ci:local` passed formatting, lint with 206 existing warnings and zero errors, all workspace
  typechecks/builds, the native macOS package, 4,799 workspace tests, and repository quality.
- Repository quality passed unused-code analysis, dependency analysis over 1,352 modules and 4,549
  dependencies, all architecture boundaries, the one-target local-metadata matrix, 86 orchestration
  tests, and strict validation of all 32 active OpenSpec items.
- `pnpm make:desktop` produced the sole versioned ZIP at
  `apps/neko-desktop/out/make/zip/darwin/arm64/OpenNeko-darwin-arm64-0.0.1.zip`.
- The packaged executable is a thin arm64 Mach-O binary. The 350 MiB application bundle passed
  strict deep code-signature verification with the expected local ad-hoc signature.
- ZIP integrity validation passed. The 144 MiB ZIP has SHA-256
  `3b5ea1d2439790bc550ccdd6e8c74d66f1f80940236d50cf67af400b8230ecc4`, matching
  `apps/neko-desktop/out/release/SHASUMS256.txt`.

## Pending Remote Evidence

- Re-run the GitHub Manual Gate after pushing the branch and record the macOS package job plus the
  Windows/Linux test-only matrix result.
- Real Developer ID signing, Apple notarization, stapling, Gatekeeper validation, and GitHub Release
  publication belong to `establish-macos-release-pipeline` and require repository secrets plus a
  stable `v<semver>` tag reachable from `origin/main`; the local manifest version does not gate it.

No Windows or Linux package, installer, startup, signing, or release qualification is claimed.
