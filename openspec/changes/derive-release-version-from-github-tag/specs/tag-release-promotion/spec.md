## MODIFIED Requirements

### Requirement: Release tag and Desktop artifact versions agree

The Release workflow SHALL treat the validated GitHub version tag as the only published-version
input. It SHALL derive the numeric base version from that tag and project it into the
`apps/neko-desktop` manifest inside each ephemeral test or packaging checkout before any consumer
runs. The checked-in Desktop manifest version SHALL NOT be required to equal a newly created tag,
while a missing or invalid manifest MUST still fail visibly. Published Desktop artifact names and
embedded application versions SHALL equal the derived numeric version.

#### Scenario: Stable GitHub Release version is projected

- **WHEN** GitHub creates tag `v0.1.0` from main and checked-in publishable manifests declare an
  earlier valid version
- **THEN** every Release test and packaging checkout SHALL use Desktop manifest version `0.1.0`,
  and the final platform artifact names and embedded application versions SHALL use `0.1.0`

#### Scenario: Prerelease version uses the numeric manifest base

- **WHEN** GitHub creates tag `v0.1.0-alpha.1` from main
- **THEN** the Desktop manifest and artifact names SHALL use `0.1.0`, and the GitHub Release SHALL be
  marked prerelease

#### Scenario: Source versions differ from the GitHub Release tag

- **WHEN** the canonical Desktop manifest is valid but its checked-in version differs from the tag's
  numeric base version
- **THEN** source validation SHALL succeed and deterministic projection SHALL replace those versions
  inside each ephemeral Release consumer

#### Scenario: A publishable manifest is invalid

- **WHEN** `apps/neko-desktop` has no valid package manifest or its manifest cannot be projected
  without changing fields other than `version`
- **THEN** Release SHALL fail before tests, packaging, or publication
