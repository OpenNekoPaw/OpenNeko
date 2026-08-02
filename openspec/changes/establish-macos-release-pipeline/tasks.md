## 1. Release Contracts

- [x] 1.1 Add failing tests for macOS-only native packaging and Windows/Linux test-only CI
      reachability
- [x] 1.2 Add failing tests for exact tag/version authority, required release credentials, and
      development/release signing isolation
- [x] 1.3 Add failing tests for the exact versioned ZIP and SHA-256 artifact closure

## 2. macOS Release Implementation

- [x] 2.1 Restrict Forge, Desktop host/output guards, Sharp, media, and local-metadata release
      matrices to `darwin-arm64`
- [x] 2.2 Add release-mode Developer ID, hardened-runtime, notarization, and ephemeral-keychain
      configuration without weakening local ad-hoc packages
- [x] 2.3 Add repository-owned release metadata and artifact assertions with fail-visible diagnostics
- [x] 2.4 Update CI so macOS alone packages while Windows/Linux run deterministic platform tests
- [x] 2.5 Add the tag-triggered macOS release workflow with source gates, native trust checks,
      checksum creation, and final GitHub Release publication

## 3. Documentation And Consistency

- [x] 3.1 Update current architecture, root/Desktop README, roadmap, and the active platform change
      to describe macOS-only package/release and Windows/Linux test-only status
- [x] 3.2 Prove obsolete Windows/Linux package paths cannot return success and document that no user
      data or runtime business contract changed

## 4. Verification

- [x] 4.1 Run focused release/platform/Sharp/media/local-metadata tests and strict OpenSpec validation
- [x] 4.2 Run Desktop typecheck, local macOS package/make plus artifact inspection, repository quality,
      legacy/unused checks, `pnpm ci:local`, and `git diff --check`
- [ ] 4.3 Configure GitHub Apple secrets and run an exact version tag from `main`; record real
      Developer ID, notarization, stapling, Gatekeeper, checksum, and GitHub Release evidence
