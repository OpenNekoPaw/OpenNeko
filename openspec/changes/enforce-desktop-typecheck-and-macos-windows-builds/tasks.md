## 1. Build Gate Contracts

- [x] 1.1 Add orchestration coverage for the root Desktop typecheck predecessor and host-neutral
      build path
- [x] 1.2 Update the supported Desktop host contract to accept only `darwin-arm64` and reject
      Windows, Linux, Intel macOS, and unknown targets
- [x] 1.3 Update CI graph coverage for one native macOS package job plus required Windows/Linux
      test-only jobs and aggregate-gate dependencies
- [x] 1.4 Cover required unit/headless-functional CI evidence and local-only Agent
      Evaluation/graphical UI reachability

## 2. Build And CI Implementation

- [x] 2.1 Make the root typecheck command and local/remote build gates execute Desktop typecheck
      before packaging
- [x] 2.2 Keep the Ubuntu static build command free of Electron Forge packaging
- [x] 2.3 Restrict Desktop build/package/make and pinned Electron archives/makers to
      `darwin-arm64`
- [x] 2.4 Run Desktop package only on the Apple Silicon macOS runner and keep Windows/Linux on
      deterministic tests without artifact upload
- [x] 2.5 Keep credential-free headless Desktop functional CI and the isolated local graphical UI
      launcher as separate evidence classes
- [x] 2.6 Keep native packaging bounded by the 4 GiB CI heap, matching-host Sharp execution, and a
      fail-visible post-Forge executable assertion

## 3. Platform Closure

- [x] 3.1 Restrict the local-metadata release matrix and validator to `darwin-arm64` while executing
      compatibility tests on Windows/Linux
- [x] 3.2 Restrict Sharp staging to macOS and prove Windows/Linux native targets are rejected
- [x] 3.3 Restrict media runtime descriptors, bundle preparation, package-owned contracts, and tests
      to macOS
- [x] 3.4 Remove obsolete Windows/Linux product-only branches while retaining diagnostic platform
      vocabulary where required

## 4. Documentation

- [x] 4.1 Update current architecture platform/media documents and indexes to name only macOS Apple
      Silicon as the product package/release target
- [x] 4.2 Update root/Desktop README and roadmap to identify Windows/Linux as test-only
- [x] 4.3 Rebase active OpenSpec platform facts and record implementation evidence without rewriting
      archived historical evidence
- [x] 4.4 Keep CI unit/headless-functional ownership, real-API Evaluation, and local graphical UI
      acceptance commands explicit

## 5. Verification

- [x] 5.1 Validate both affected OpenSpec changes strictly and run focused orchestration, Desktop,
      Sharp, media, and local-metadata tests
- [x] 5.2 Run Desktop typecheck, root build/check gates, legacy/unused checks, and `git diff --check`
- [x] 5.3 Produce and inspect the sole `darwin-arm64` package locally
- [ ] 5.4 Re-run the GitHub Manual Gate and record macOS package plus Windows/Linux test-only results
