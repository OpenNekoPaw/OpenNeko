# Verification: adopt-dev-main-manual-and-merge-ci

## Scope And Risk

- Risk: L4 release/install/packaging orchestration.
- Runtime product code and user data: unchanged.
- Canonical paths: local `gate:local`, explicit `gate:remote`, GitHub `Manual Gate`, `dev -> main` `Merge Gate`, and main-history `v*` Release.
- Removed paths: automatic push-main CI, `Branch Gate`, `Main Gate`, changed-path skipping, and root branch/main gate aliases.

## Automated Evidence

| Command                         | Result                                                 | Coverage                                                                                                  |
| ------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `pnpm check:test-orchestration` | Passed: 53 tests, ownership and coverage audits passed | CI events, aggregate results, promotion source, local-only boundaries, platform matrix, Release validator |
| `pnpm check:openspec`           | Passed: 33 items, 0 failed                             | Strict proposal/spec/design/task validation across active changes                                         |
| `pnpm check:release-channels`   | Passed                                                 | Canonical release package groups and stable channel alignment                                             |
| `pnpm check:unused`             | Passed with one existing configuration hint            | Removed changed-path scripts have no retained caller                                                      |
| focused Prettier check          | Passed                                                 | All files owned by this change                                                                            |
| `bash -n scripts/act-ci.sh`     | Passed                                                 | Updated manual-event local workflow smoke entry                                                           |
| `git diff --check`              | Passed                                                 | Diff hygiene                                                                                              |
| `pnpm check:quality`            | Blocked outside this change                            | Concurrent workspace-linked-media migration has 16 unresolved legacy/fallback debt findings               |

Release validator unit evidence covers stable and prerelease tags, invalid SemVer numeric prerelease identifiers, tag-ref-to-commit resolution, main ancestry, canonical package group projection, version mismatch diagnostics, workflow permission isolation, environment ownership, and checksum attachment.

## External Configuration Evidence

- Remote `dev` created from main SHA `53fe14ef7ae45bca06640233e0a70eaf486ce576`.
- dev protection: normal push allowed; administrators are enforced; force push and deletion disabled; no required PR or status check.
- Local checkout switched from main to tracking branch dev without changing or discarding concurrent worktree edits.
- `release` environment created with a custom deployment policy accepting only `v*` tags.
- Active tag ruleset `Protect release tags` targets `refs/tags/v*`, restricts creation to the configured repository-role bypass, and blocks deletion and non-fast-forward updates.
- main protection intentionally still requires GitHub Actions `Branch Gate` until the new workflow is committed to dev and produces a successful `Merge Gate` on a dev-to-main Pull Request.

## Blocked Remote Evidence

- `Manual Gate`, `Merge Gate`, and the strengthened Release workflow cannot run remotely before the repository changes are committed and pushed to dev.
- main required-check migration is blocked on the first successful remote `Merge Gate`; switching earlier would leave main with a required check that no remote workflow can yet publish.
- No release tag was created, so no GitHub Release or real VSIX installation/runtime smoke was performed in this change.

## Quality Review

No actionable finding remains in the files owned by this change. Manual and Merge events share one job graph; publication permission is isolated to the release-environment job; tag and promotion contract violations fail visibly; platform matrices remain identical; Agent Evaluation, GUI, local VS Code configuration, provider credentials, and user fixtures remain unreachable from remote generic gates.

Residual risk is limited to the explicitly blocked remote run/protection migration and existing concurrent workspace-linked-media debt outside this change.
