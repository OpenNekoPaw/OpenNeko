## MODIFIED Requirements

### Requirement: Release tag and VSIX versions agree

The Release workflow SHALL treat the validated GitHub version tag as the only published-version
input. It SHALL derive the numeric base version from that tag and project it into every publishable
application and feature manifest selected by the canonical package groups inside each ephemeral
test or packaging checkout before any consumer runs. Source manifest versions SHALL NOT be required
to equal a newly created tag, while missing or invalid manifests MUST still fail visibly. Published
VSIX filenames and embedded manifest versions SHALL equal the derived numeric version.

#### Scenario: Stable GitHub Release version is projected

- **WHEN** GitHub creates tag `v0.1.0` from main and checked-in publishable manifests declare an
  earlier valid version
- **THEN** every Release test and packaging checkout SHALL use manifest version `0.1.0`, and the
  final platform VSIX filenames and embedded manifests SHALL use `0.1.0`

#### Scenario: Prerelease version uses the numeric manifest base

- **WHEN** GitHub creates tag `v0.1.0-alpha.1` from main
- **THEN** every publishable manifest and VSIX filename SHALL use `0.1.0`, and the GitHub Release
  SHALL be marked prerelease

#### Scenario: Source versions differ from the GitHub Release tag

- **WHEN** all canonical publishable manifests are valid but one or more checked-in versions differ
  from the tag's numeric base version
- **THEN** source validation SHALL succeed and deterministic projection SHALL replace those versions
  inside each ephemeral Release consumer

#### Scenario: A publishable manifest is invalid

- **WHEN** a canonical publishable package has no valid package manifest or its manifest cannot be
  projected without changing fields other than `version`
- **THEN** Release SHALL fail before tests, packaging, or publication
