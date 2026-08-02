## Verification

Date: `2026-08-02`

Local host: `darwin-arm64`

## Local Evidence

- Release/platform regression tests passed, including tag-owned release versioning independent of
  the local Desktop manifest, release-secret rejection, mutable Forge trust configuration, explicit
  Developer ID/Team ID/hardened-runtime workflow checks, macOS-only CI reachability, and exact
  artifact closure.
- `pnpm typecheck:desktop` passed with the Forge trust helper declaration included.
- `pnpm make:desktop` produced
  `apps/neko-desktop/out/make/zip/darwin/arm64/OpenNeko-darwin-arm64-0.0.1.zip`.
- Local packaging remained intentionally ad-hoc signed; strict `codesign` verification and ZIP
  integrity validation passed.
- `node scripts/prepare-macos-release-artifacts.mjs --tag v0.0.1` accepted exactly one versioned ZIP
  and generated the matching SHA-256 manifest.
- A focused temporary-workspace test proved local manifest `0.0.1` plus tag `v1.2.3` projects
  `1.2.3` before Forge and resolves only the tag-versioned ZIP.
- Strict OpenSpec validation passed.
- `pnpm ci:local` passed formatting, lint with zero errors, all workspace typechecks/builds, the
  native macOS package, 4,799 workspace tests, and repository quality.
- The tag-version follow-up passed 9 focused release tests, 87 orchestration tests, strict OpenSpec
  validation, `git diff --check`, and a fresh `pnpm ci:local`; the real local manifest remained
  `0.0.1` before and after the gate.

## External Acceptance Pending

The workflow implementation is locally verified, but no production release claim is made. Final
acceptance requires all configured Apple repository secrets and a stable `v<semver>` tag whose
commit is reachable from `origin/main`. The GitHub run must prove Developer ID identity,
notarization, stapling, Gatekeeper acceptance, checksum publication, and GitHub Release creation.

Tag run `v0.1.2` ([Actions run 30753986320](https://github.com/OpenNekoPaw/OpenNeko/actions/runs/30753986320))
failed before this follow-up because the old workflow compared it with local manifest `0.0.1`.
After merging this follow-up, use a new immutable tag to obtain real trust and publication evidence.

Windows and Linux are compatibility-test hosts only and have no package or release artifact.
