## Verification

Date: `2026-08-02`

Local host: `darwin-arm64`

## Local Evidence

- Release/platform regression tests passed, including exact tag/version authority, release-secret
  rejection, mutable Forge trust configuration, explicit Developer ID/Team ID/hardened-runtime
  workflow checks, macOS-only CI reachability, and exact artifact closure.
- `pnpm typecheck:desktop` passed with the Forge trust helper declaration included.
- `pnpm make:desktop` produced
  `apps/neko-desktop/out/make/zip/darwin/arm64/OpenNeko-darwin-arm64-0.0.1.zip`.
- Local packaging remained intentionally ad-hoc signed; strict `codesign` verification and ZIP
  integrity validation passed.
- `node scripts/prepare-macos-release-artifacts.mjs` accepted exactly one versioned ZIP and generated
  the matching SHA-256 manifest.
- Strict OpenSpec validation passed.
- `pnpm ci:local` passed formatting, lint with zero errors, all workspace typechecks/builds, the
  native macOS package, 4,799 workspace tests, and repository quality.

## External Acceptance Pending

The workflow implementation is locally verified, but no production release claim is made. Final
acceptance requires all configured Apple repository secrets and an exact `v<desktop-version>` tag
whose commit is reachable from `origin/main`. The GitHub run must prove Developer ID identity,
notarization, stapling, Gatekeeper acceptance, checksum publication, and GitHub Release creation.

Windows and Linux are compatibility-test hosts only and have no package or release artifact.
