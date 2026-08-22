## Verification

Date: `2026-08-11`

Local host: `darwin-arm64`

## Local Evidence

- A forced frozen-lockfile install built the MakerDMG native closure after `fs-xattr` and
  `macos-alias` were explicitly approved in `pnpm-workspace.yaml`.
- `pnpm typecheck:desktop` passed with the ad-hoc-only Forge trust helper declaration.
- `pnpm make:desktop` produced the canonical 130 MiB preview image at
  `apps/neko-desktop/out/make/OpenNeko-0.0.1-arm64.dmg`.
- `codesign --verify --deep --strict --verbose=4` passed for the packaged application; signature
  inspection reported `Signature=adhoc` and `TeamIdentifier=not set`.
- `hdiutil verify` accepted the DMG, and
  `node scripts/prepare-macos-release-artifacts.mjs --tag v0.0.1` accepted exactly that versioned
  DMG and generated `SHASUMS256.txt` with SHA-256
  `dea6f2804b8dc33fbc62f014d28fa06deeff85f99f22ef72257191319e3f0550`.
- `shasum -a 256 -c ../release/SHASUMS256.txt` passed from the DMG output directory.
- Focused release tests cover tag-owned versioning, canonical DMG naming,
  missing/stale/ambiguous output, ad-hoc-only Forge trust, required native dependency builds,
  absent Apple credential/notarization branches, local-only native build ownership, ordinary GitHub
  Release metadata, and ZIP publication removal.
- The focused Desktop architecture boundary passed 17 tests with MakerDMG as the sole configured
  maker, and the complete orchestration gate passed 86 tests.
- `pnpm exec openspec validate establish-macos-release-pipeline --strict`,
  `pnpm check:legacy-debt`, `pnpm check:unused`, and `git diff --check` passed.
- A fresh `pnpm ci:local` passed formatting, lint with zero errors, all workspace typechecks,
  builds and tests, Desktop packaging, dependency analysis, repository architecture/quality gates,
  and strict validation of all 32 OpenSpec items.

## Local-Only Publication Policy

- `.github/workflows/release.yml` was removed; a pushed tag no longer triggers a GitHub build or
  publication side effect.
- The GitHub Manual/Merge Gate no longer contains `desktop-package`, Forge, or native Desktop
  artifact upload. Native package, Sharp, signature, DMG, and checksum evidence is explicitly local
  to an Apple Silicon host.
- Repository tests reject any GitHub workflow that restores `package:desktop`, `make:desktop`,
  Electron Forge, Desktop output upload, `gh release create`, or a prerelease flag.
- Sixteen focused release/build/gate tests and the complete 121-test orchestration suite passed.
- Strict validation passed for both affected OpenSpec changes. The complete repository quality gate
  passed dependency, package/application/Webview/Agent/content/storage boundaries, legacy-debt,
  unused-code, strict TypeScript, orchestration, and all 83 OpenSpec items.

## GitHub Release Metadata Evidence

On `2026-08-11`, repository-owner commands normalized `v0.1.4` through `v0.1.8` without replacing or
deleting their DMG/checksum assets. `gh release list` reported every version as
`isPrerelease=false`; titles are the exact version tags, and `v0.1.8` is `isLatest=true`.

The current release path intentionally does not use Apple repository secrets, Developer ID,
notarization, stapling, or normal Gatekeeper assessment. Users may need macOS System Settings →
Privacy & Security → Open Anyway. A normally trusted stable channel requires a separate future
Developer ID/notarization change.

Windows and Linux are compatibility-test hosts only and have no package or release artifact.
