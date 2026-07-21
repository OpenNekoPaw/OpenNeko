## 1. Gate Contracts And Regressions

- [x] 1.1 Replace tiered gate orchestration expectations with local, remote-reproduction, Manual Gate, and dev-to-main Merge Gate contracts
- [x] 1.2 Add fail-visible promotion-source tests for the only accepted dev-to-main Pull Request path
- [x] 1.3 Add release-source/version validator tests covering main ancestry, stable/prerelease tags, package groups, and mismatches

## 2. CI Canonical Path

- [x] 2.1 Replace branch/main root commands and local-only guard inventories with the canonical `gate:remote` entry
- [x] 2.2 Implement the host-neutral promotion-source validator and connect it to Pull Request validation
- [x] 2.3 Replace push/Branch/Main workflow routing with shared manual/merge jobs and stable `Manual Gate` / `Merge Gate` aggregators
- [x] 2.4 Remove changed-path orchestration that no longer owns a caller after full Manual/Merge validation

## 3. Release Promotion

- [x] 3.1 Implement the tag ancestry and package-group version validator with structured fail-visible diagnostics
- [x] 3.2 Validate the release source before build, isolate contents write permission to the release-environment publication job, and attach `SHA256SUMS`
- [x] 3.3 Keep Release and Merge Engine matrices identical to the canonical supported target set

## 4. Documentation And External Configuration

- [x] 4.1 Update the quality ADR and Chinese/English project entry docs for dev local validation, manual remote CI, dev-to-main Merge Gate, and tag Release
- [x] 4.2 Create dev from the current main head and protect it from force push/deletion while retaining normal development pushes
- [ ] 4.3 After the new check appears on a dev-to-main Pull Request, atomically replace main required `Branch Gate` with GitHub Actions `Merge Gate`
- [x] 4.4 Configure and verify the release environment and protected `v*` tag creation/deletion policy

## 5. Verification

- [x] 5.1 Run focused orchestration and validator tests, strict OpenSpec validation, formatting, and diff hygiene
- [x] 5.2 Run repository quality gates and classify any failures caused by unrelated concurrent worktree changes
- [x] 5.3 Perform Neko L4 quality review and record real remote Manual/Merge/Release evidence or explicit external blockers
