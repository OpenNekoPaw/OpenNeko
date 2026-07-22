# Verification: derive-release-version-from-github-tag

## Scope And Risk

- Risk: L4 release/install/packaging orchestration.
- Runtime product code, project formats, user data, Extension/Webview contracts, and Engine protocols:
  unchanged.
- Canonical version owner: the validated GitHub `v*` tag.
- Canonical projection path: `release-version-contract.mjs` parses the tag and resolves the
  publishable manifests; `project-release-version.mjs` changes only their `version` fields inside
  each ephemeral Release checkout before dependency installation, tests, or packaging.
- Removed blocker: checked-in publishable manifest versions no longer need to equal a newly created
  tag. Invalid tags, manifests, package groups, main ancestry, native closures, or final artifacts
  still fail visibly.

## Automated Evidence

| Command                             | Result                     | Coverage                                                                                                          |
| ----------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| focused release and assembler tests | Passed: 19 tests           | Tag parsing/projection, source validation, workflow ordering, artifact naming, platform assembly                  |
| `pnpm check:test-orchestration`     | Passed: 65 tests           | Release consumers project before tests/packaging; publication permission remains isolated                         |
| `pnpm check:repository-quality`     | Passed                     | Knip, dependency direction, release channels, architecture boundaries, strict TypeScript, orchestration, OpenSpec |
| `CI=1 pnpm test`                    | Passed: Turbo 25/25 tasks  | Repository tests against manifests projected from `0.0.1` to `9.8.7`                                              |
| `pnpm check:release-channels`       | Passed                     | Canonical publishable package membership and channel consistency                                                  |
| `pnpm check:openspec`               | Passed: 32 items, 0 failed | Strict active-change validation                                                                                   |
| `pnpm check:unused`                 | Passed                     | No unused release projector or shared contract exports                                                            |
| focused Prettier check              | Passed                     | All files owned by this change                                                                                    |
| `git diff --check`                  | Passed                     | Diff hygiene                                                                                                      |
| `pnpm test:local:vscode`            | Completed with 3 skips     | Clean validation checkout intentionally has no local `.vscode` configuration                                      |

Real CLI projection with `GITHUB_REF_NAME=v9.8.7` changed exactly the eight canonical publishable
manifests from `0.0.1` to `9.8.7` and preserved every other field. A subsequent
`pnpm install --frozen-lockfile` passed, proving that the ephemeral version projection does not
require a lockfile rewrite.

The projected checkout completed the full build: Turbo 10/10 tasks, the Rust CLI release build in
8m09s, and the Rust N-API release build in 4m04s. Downstream packaging consumers observed version
`9.8.7`.

## L4 Quality Review

No actionable finding remains in the files owned by this change.

Responsibility stays at existing boundaries: GitHub owns the external release tag, one shared
host-neutral module owns tag and manifest rules, ephemeral Release jobs own projection, and the
existing platform assembler and publication job own artifact validation. Package membership is
read from the canonical package groups rather than duplicated in workflow YAML. The implementation
adds no runtime abstraction, compatibility path, fallback success, package dependency, or user-data
mutation.

Path-level tests prove both Release consumer jobs invoke the projector before their first consumer,
source validation no longer performs version equality, malformed inputs still fail before any
write, and the final artifact contract still derives exact filenames from the tag.

## Environment Note

`pnpm ci:local` was first run from a clean worktree under `/tmp`. Its build completed, but ten Agent
file-policy tests correctly rejected the system-temp workspace path. Re-running the applicable
test and quality stages from a clean ordinary directory passed; this is an environment-policy
effect rather than a release regression.

## Migration And Residual Risk

- The protected existing `v0.0.2` tag points to a commit containing the old workflow. Re-running
  that tag cannot load this change, and the tag must not be moved, deleted, or overwritten.
- After this change passes the normal `dev -> main` Merge Gate, the first release using the new
  contract must be a new GitHub Release tag, for example `v0.0.3`, created from updated main.
- Linux artifact construction and the final GitHub Release upload remain runner-owned external
  evidence; local macOS validation cannot replace the first new-tag Release run.
