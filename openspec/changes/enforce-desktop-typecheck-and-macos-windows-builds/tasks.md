## 1. Build Gate Contracts

- [x] 1.1 Add failing orchestration coverage for the root Desktop typecheck predecessor and
      host-neutral build path
- [x] 1.2 Add a supported Desktop host contract with tests for the two accepted and all rejected
      platform/architecture combinations
- [x] 1.3 Add failing CI graph coverage for native macOS/Windows package runners, artifacts, and
      aggregate-gate dependencies
- [x] 1.4 Add failing orchestration coverage for required unit/headless-functional CI evidence and
      local-only Agent Evaluation/graphical UI reachability

## 2. Build And CI Implementation

- [x] 2.1 Add the Turbo/root typecheck command and make local/remote build gates execute it before
      packaging
- [x] 2.2 Add the host-neutral static build command and move the Ubuntu build job to that command
- [x] 2.3 Guard Desktop build/package/make before Forge and configure pinned macOS arm64 plus
      Windows x64 Electron archives
- [x] 2.4 Add real-host `darwin-arm64` and `win32-x64` Desktop package jobs and require them from
      manual/merge gates
- [x] 2.5 Add a required credential-free headless Desktop functional job and an isolated local
      graphical UI fixture launcher that remains unreachable from CI

## 3. Platform Closure

- [x] 3.1 Replace Linux with Windows in the local metadata release matrix and validation
- [x] 3.2 Replace Linux with Windows in Sharp staging and prove the Linux target is rejected
- [x] 3.3 Replace Linux with the Windows software baseline in media runtime descriptors, build
      preparation, package-owned contracts, and focused tests
- [x] 3.4 Remove Linux product-only branches that no longer protect a supported runtime while
      retaining host diagnostic vocabulary where required

## 4. Documentation

- [x] 4.1 Update current architecture platform/media documents and indexes to name only macOS
      Apple Silicon and Windows x64 product targets
- [x] 4.2 Update Desktop README and roadmap to separate package construction from complete Windows
      qualification and identify Linux as host-neutral CI only
- [x] 4.3 Record implementation verification and unresolved real-Windows runtime evidence
- [x] 4.4 Document CI unit/headless-functional ownership, real-API Evaluation, and local graphical
      UI acceptance commands

## 5. Verification

- [x] 5.1 Validate the OpenSpec change strictly and run focused orchestration, Desktop, Sharp, media,
      and local metadata tests
- [ ] 5.2 Run Desktop typecheck, root build/check gates, legacy/unused checks, and `git diff --check`
- [ ] 5.3 Produce and inspect the `darwin-arm64` package locally
- [ ] 5.4 Obtain `win32-x64` package and startup evidence from the real Windows CI runner before
      declaring complete platform qualification
- [x] 5.5 Run the CI/Evaluation/UI reachability guards and verify the local UI launcher contract
