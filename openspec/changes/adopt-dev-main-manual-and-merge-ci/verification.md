# Verification: adopt-dev-main-manual-and-merge-ci

## Scope And Risk

- Risk: L4 release/install/packaging orchestration.
- Runtime product code and user data: unchanged.
- Canonical paths: local `gate:local`, explicit `gate:remote`, GitHub `Manual Gate`, development-branch-to-main `Merge Gate`, and main-history `v*` Release.
- Removed paths: automatic push-main CI, `Branch Gate`, `Main Gate`, changed-path skipping, and root branch/main gate aliases.

## Automated Evidence

| Command                                                                                                        | Result                                                 | Coverage                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `pnpm check:test-orchestration`                                                                                | Passed: 78 tests, ownership and coverage audits passed | CI events, aggregate results, promotion source, local-only boundaries, platform matrix, Release validator |
| `pnpm check:openspec`                                                                                          | Passed: 34 items, 0 failed                             | Strict proposal/spec/design/task validation across active changes                                         |
| `PR_HEAD_REF=fix-ci-dependencies PR_BASE_REF=main node scripts/test-orchestration/assert-promotion-source.mjs` | Passed                                                 | Real topic-branch-to-main promotion path that the fixed-name contract previously rejected                 |
| `pnpm check:release-channels`                                                                                  | Passed                                                 | Canonical release package groups and stable channel alignment                                             |
| `pnpm check:unused`                                                                                            | Passed with one existing configuration hint            | Removed changed-path scripts have no retained caller                                                      |
| focused Prettier check                                                                                         | Passed                                                 | All files owned by this change                                                                            |
| `bash -n scripts/act-ci.sh`                                                                                    | Passed                                                 | Updated manual-event local workflow smoke entry                                                           |
| `git diff --check`                                                                                             | Passed                                                 | Diff hygiene                                                                                              |
| `pnpm check:quality`                                                                                           | Blocked outside this change                            | Concurrent workspace-linked-media migration has 16 unresolved legacy/fallback debt findings               |

Release validator unit evidence covers stable and prerelease tags, invalid SemVer numeric prerelease identifiers, tag-ref-to-commit resolution, main ancestry, canonical package group projection, version mismatch diagnostics, workflow permission isolation, environment ownership, and checksum attachment.

## External Configuration Evidence

- Remote `dev` development branch created from main SHA `53fe14ef7ae45bca06640233e0a70eaf486ce576`.
- The `dev` branch protection allows normal push; administrators are enforced; force push and deletion are disabled; no required PR or status check is configured.
- Local checkout switched from main to tracking branch dev without changing or discarding concurrent worktree edits; `dev` is one development branch, not the only accepted source branch.
- `release` environment created with a custom deployment policy accepting only `v*` tags.
- Active tag ruleset `Protect release tags` targets `refs/tags/v*`, restricts creation to the configured repository-role bypass, and blocks deletion and non-fast-forward updates.
- main protection intentionally still requires GitHub Actions `Branch Gate` until the new workflow produces a successful `Merge Gate` on a development-branch-to-main Pull Request.

## Blocked Remote Evidence

- The current remote `Merge Gate` rejected `fix-ci-dependencies -> main` under the obsolete fixed-name assertion; the corrected validator must be committed and pushed before GitHub can rerun the real topic-branch path.
- main required-check migration remains blocked on a successful remote `Merge Gate`; local orchestration evidence cannot replace the GitHub branch-protection signal.
- No release tag was created, so no GitHub Release or real VSIX installation/runtime smoke was performed in this change.

## Quality Review

No actionable finding remains in the files owned by this change. Manual and Merge events share one job graph; publication permission is isolated to the release-environment job; tag and promotion contract violations fail visibly; platform matrices remain identical; Agent Evaluation, GUI, local VS Code configuration, provider credentials, and user fixtures remain unreachable from remote generic gates.

Residual risk is limited to the explicitly blocked remote run/protection migration and existing concurrent workspace-linked-media debt outside this change.
