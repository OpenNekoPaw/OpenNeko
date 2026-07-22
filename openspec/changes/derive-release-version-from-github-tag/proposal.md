## Why

OpenNeko releases are initiated by creating a GitHub Release version tag, but the current workflow
requires every source manifest to have been manually changed to that version first. This duplicates
version ownership and blocks an otherwise valid release after the protected tag already exists.

## What Changes

- Make the GitHub Release tag the single source of truth for the published OpenNeko version.
- Keep SemVer syntax and main-history ancestry as fail-visible release-source gates.
- Project the tag's numeric base version into every publishable manifest inside each ephemeral
  Release job before tests, packaging, and final artifact validation.
- Keep source manifests internally consistent, but stop requiring their checked-in version to equal
  a newly created tag.
- Preserve prerelease behavior: `vX.Y.Z-<suffix>` produces numeric VSIX version `X.Y.Z` and a
  prerelease GitHub Release.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tag-release-promotion`: Replace source-manifest pre-bump ownership with deterministic,
  tag-derived manifest projection in ephemeral Release workspaces.

## Impact

- Release contract and workflow: `.github/workflows/release.yml`.
- Release source/version scripts and orchestration tests under `scripts/`.
- Existing `tag-release-promotion` requirements and release documentation/evidence.
- No runtime, project-data, Extension/Webview, Engine protocol, or published tag mutation behavior.
