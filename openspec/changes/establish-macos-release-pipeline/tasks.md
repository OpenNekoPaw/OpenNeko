## 1. Release Contracts

- [x] 1.1 Add failing tests for macOS-only native packaging and Windows/Linux test-only CI
      reachability
- [x] 1.2 Add failing tests for exact tag/version authority and explicit ad-hoc preview trust
- [x] 1.3 Add failing tests for the exact versioned distributable and SHA-256 artifact closure
- [x] 1.4 Add regression tests proving a tag selects the release version independently of the local
      Desktop manifest and is projected before Forge
- [x] 1.5 Add regression tests for the canonical DMG, absent Apple-secret dependency, explicit
      unnotarized disclosure, and removal of ZIP publication

## 2. macOS Release Implementation

- [x] 2.1 Restrict Forge, Desktop host/output guards, Sharp, media, and local-metadata release
      matrices to `darwin-arm64`
- [x] 2.2 Keep local and preview packages on one explicit ad-hoc signing mode
- [x] 2.3 Add repository-owned release metadata and artifact assertions with fail-visible diagnostics
- [x] 2.4 Update CI so macOS alone packages while Windows/Linux run deterministic platform tests
- [x] 2.5 Establish source gates, native integrity checks, checksum creation, disclosure, and GitHub
      publication (the tag-triggered GitHub build path was later removed by section 5)
- [x] 2.6 Make the stable semver tag the release-version authority and project it only in the
      ephemeral release checkout
- [x] 2.7 Replace ZIP and paid Apple credential requirements with MakerDMG, explicit ad-hoc
      verification, DMG integrity checks, and exact artifact publication

## 3. Documentation And Consistency

- [x] 3.1 Update current architecture, root/Desktop README, roadmap, and the active platform change
      to describe macOS-only package/release and Windows/Linux test-only status
- [x] 3.2 Prove obsolete Windows/Linux package paths cannot return success and document that no user
      data or runtime business contract changed
- [x] 3.3 Update release documentation and verification evidence to separate local development
      versioning from tag-owned public versioning
- [x] 3.4 Update release documentation and verification evidence for the unnotarized DMG
      installation contract

## 4. Verification

- [x] 4.1 Run focused release/platform/Sharp/media/local-metadata tests and strict OpenSpec validation
- [x] 4.2 Run Desktop typecheck, local macOS package/make plus artifact inspection, repository quality,
      legacy/unused checks, `pnpm ci:local`, and `git diff --check`
- [x] 4.3 Run a stable version tag from `main`; record ad-hoc signature, DMG integrity, checksum,
      disclosure, and GitHub publication evidence (superseded by the local-only publication policy)
- [x] 4.4 Run focused release tests, orchestration quality, strict OpenSpec validation, and diff
      checks for tag-owned release versioning
- [x] 4.5 Run a local DMG make and inspection, focused release tests, `pnpm ci:local`, strict
      OpenSpec validation, legacy/unused checks, and `git diff --check`

## 5. Local-Only Ordinary Release Policy

- [x] 5.1 Add regression tests that reject GitHub native Desktop build/upload, tag-triggered release
      publication, and prerelease metadata
- [x] 5.2 Remove the tag release workflow and the native Desktop package/upload job from GitHub
      Manual/Merge Gate while preserving deterministic source and test validation
- [x] 5.3 Update release, platform, quality-gate, roadmap, and Desktop documentation for local native
      build ownership, ordinary GitHub Releases, and unchanged unnotarized trust disclosure
- [x] 5.4 Normalize existing `v0.1.4` through `v0.1.8` GitHub releases and make `v0.1.8` Latest
- [x] 5.5 Run focused orchestration tests, strict OpenSpec validation, repository quality review, and
      diff checks
