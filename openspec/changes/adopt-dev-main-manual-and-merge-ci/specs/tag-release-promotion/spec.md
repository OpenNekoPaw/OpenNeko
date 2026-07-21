## ADDED Requirements

### Requirement: Release tags originate from main history

The Release workflow SHALL accept only version tags whose commit is reachable from the current main branch.

#### Scenario: Tag points to a main commit

- **WHEN** a `v*` tag points to a commit reachable from `origin/main`
- **THEN** release source validation SHALL succeed

#### Scenario: Tag points outside main

- **WHEN** a `v*` tag points to a commit not reachable from `origin/main`
- **THEN** the Release workflow SHALL fail before building or publishing artifacts

### Requirement: Release tag and VSIX versions agree

The Release workflow SHALL validate that the version tag is valid SemVer and that its numeric base version equals every publishable extension and extension-pack manifest version selected by the canonical package groups.

#### Scenario: Stable version matches

- **WHEN** tag `v0.1.0` is released and every publishable VSIX manifest declares `0.1.0`
- **THEN** version validation SHALL succeed

#### Scenario: Prerelease version matches the numeric manifest

- **WHEN** tag `v0.1.0-alpha.1` is released and every publishable VSIX manifest declares `0.1.0`
- **THEN** version validation SHALL succeed and the GitHub Release SHALL be marked prerelease

#### Scenario: Manifest version differs

- **WHEN** any selected publishable manifest version differs from the tag numeric base version
- **THEN** the Release workflow SHALL fail with the exact package path and observed version

### Requirement: Release publication is isolated and auditable

The Release workflow SHALL build supported-platform artifacts from the validated tag checkout, generate a SHA256 manifest, and perform GitHub Release creation only from a release-environment job with contents write permission.

#### Scenario: Release artifacts are complete

- **WHEN** all TypeScript extension and supported Engine packaging jobs succeed
- **THEN** the publication job SHALL attach every VSIX and one `SHA256SUMS` file to the GitHub Release

#### Scenario: Upstream release job fails

- **WHEN** source validation, tests, or any required packaging matrix job fails or is skipped
- **THEN** the publication job SHALL not create or update a GitHub Release
