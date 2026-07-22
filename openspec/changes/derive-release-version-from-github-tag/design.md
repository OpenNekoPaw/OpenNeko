## Context

The protected GitHub version tag currently triggers Release, but source validation assumes a
different owner: every publishable manifest must already contain the tag version. A GitHub-created
`v0.0.2` tag therefore failed against otherwise valid `0.0.1` source manifests before tests or
packaging. Release jobs use isolated checkouts, and the unified assembler first builds internal
feature VSIX payloads before composing the final application VSIX.

## Goals / Non-Goals

**Goals:**

- Treat the validated GitHub tag as the only input for the published version.
- Preserve main ancestry, SemVer, package-group, manifest-shape, native-closure, and exact-artifact
  gates.
- Ensure every test and packaging process sees one consistent numeric manifest version.
- Keep the tag checkout and repository history immutable.

**Non-Goals:**

- Moving, deleting, or recreating protected tags.
- Committing generated version bumps or opening release-version Pull Requests.
- Changing normal CI/local package versions or the supported platform matrix.
- Encoding prerelease suffixes in VS Code manifest versions.

## Decisions

### A repository script projects the tag version into canonical publishable manifests

A host-neutral script parses `GITHUB_REF_NAME`, resolves publishable package paths from
`scripts/package-groups.json`, validates each manifest, and writes only its `version` field to the
tag's numeric base version. It preserves every other manifest field and fails visibly for malformed
tags, missing/invalid manifests, or invalid package-group entries.

The canonical package group remains the single membership source. Hard-coded workflow paths or a
second version allowlist would drift as embedded features change.

Alternative considered: override only the final composed manifest. Rejected because internal
feature VSIX files are built first and manifest composition rejects unequal feature versions.

### Every isolated Release consumer performs the projection

`release-tests` projects before dependency installation/tests, and each `release-openneko` matrix
job projects before native and VSIX packaging. The publication job continues to derive the expected
two artifact names directly from the tag and does not need modified source manifests.

Alternative considered: project once in `validate-release` and pass the checkout onward. Rejected
because GitHub Actions jobs do not share working directories; transporting a mutated source tree as
an artifact adds avoidable state and provenance complexity.

### Source validation no longer compares checked-in versions with the tag

The source gate continues to validate tag syntax, dereferenced commit identity, main ancestry,
canonical package-group membership, and manifest shape. A checked-in version that differs from the
tag is expected input and cannot block Release. The projector and final artifact allowlist prove the
effective version path.

Alternative considered: silently ignore all manifest validation. Rejected because missing or
malformed package manifests are development defects and must remain fail-visible.

### Tag projection is ephemeral and deterministic

The workflow never commits, pushes, moves a tag, or writes outside its checkout. Stable and
prerelease tags with the same numeric base produce the same VSIX manifest version; the prerelease
suffix affects only GitHub Release classification.

## Risks / Trade-offs

- **[The tagged commit does not contain the published version literal]** -> The immutable tag plus
  repository-owned projection script fully defines the artifact; tests assert the exact path and
  final filenames.
- **[A downstream job forgets projection]** -> Workflow orchestration tests require the projection
  step before tests and packaging in every owning job.
- **[A failed existing tag cannot pick up the new workflow]** -> Protected tags remain immutable;
  the first release using this contract must use a new tag created from main after this change.
- **[Prerelease suffix is lost from VSIX metadata]** -> This is intentional because VS Code
  manifests use the numeric base while GitHub marks the release as prerelease from the full tag.

## Migration Plan

1. Add the projector and regression tests.
2. Relax only the source/tag equality check while retaining all other source validation.
3. Wire projection into Release tests and platform packaging before consumers run.
4. Merge through the normal dev-to-main gate.
5. Create a new GitHub Release tag from the updated main commit; do not move the failed protected
   `v0.0.2` tag.

Rollback restores source-manifest equality validation and removes projection steps. Published tags
and artifacts are never rewritten.

## Open Questions

None.
