## Verification

Date: `2026-08-02`

Local host: `darwin-arm64`

## Decision

- `darwin-arm64` is the sole Desktop package and release target.
- Windows and Linux remain required CI compatibility-test hosts, but do not run Forge, create a
  package, or upload a product artifact.
- GitHub Actions no longer builds or uploads the macOS package; native evidence is explicitly local.
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

## Current Publication Boundary

- GitHub Manual/Merge Gate proves only deterministic source and Windows/Linux test evidence; it does
  not build or upload a native Desktop artifact.
- Real Developer ID signing, Apple notarization, stapling, and Gatekeeper validation remain future
  work. Ordinary GitHub Release publication uses locally built and verified bytes under
  `establish-macos-release-pipeline`; a stable `v<semver>` tag reachable from `origin/main` remains
  authoritative and the local manifest version does not gate it.

No Windows or Linux package, installer, startup, signing, or release qualification is claimed.
