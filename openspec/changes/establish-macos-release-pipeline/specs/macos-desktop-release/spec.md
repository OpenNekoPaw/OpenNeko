## ADDED Requirements

### Requirement: macOS release source and version are authoritative

The release workflow SHALL accept only an exact stable `v<semver>` tag whose commit is reachable
from `main`. The tag SHALL be the sole public release-version authority; the source Desktop
manifest version SHALL NOT gate the release.

#### Scenario: Release tag is invalid

- **WHEN** the release tag is not exactly `v<major>.<minor>.<patch>`
- **THEN** the workflow SHALL fail before packaging or publication

#### Scenario: Local and release versions differ

- **WHEN** a valid release tag differs from the version in `apps/neko-desktop/package.json`
- **THEN** the workflow SHALL project the tag-derived version into the ephemeral release checkout
  before Forge runs
- **AND** the application and DMG SHALL use the tag-derived version
- **AND** the repository SHALL NOT require or persist a local manifest version change

#### Scenario: Tag commit is outside main

- **WHEN** the tagged commit is not reachable from `origin/main`
- **THEN** the workflow SHALL fail without creating a GitHub Release

### Requirement: Preview trust state is explicit

The current open-source preview build SHALL use the repository's explicit ad-hoc application
signature and SHALL NOT require Apple credentials. The GitHub Release SHALL be marked as a
prerelease and SHALL disclose that the DMG is not Developer ID signed or notarized.

#### Scenario: Apple credentials are absent

- **WHEN** a preview tag workflow runs without Apple signing or notarization credentials
- **THEN** Forge SHALL create the explicit ad-hoc package and DMG without reading those credentials
- **AND** publication SHALL retain the preview and unnotarized disclosure

#### Scenario: The ad-hoc package is invalid

- **WHEN** strict codesign verification, ad-hoc identity inspection, or DMG integrity verification
  fails
- **THEN** no preview artifact or GitHub Release SHALL be created

### Requirement: Preview trust mode is explicit across local and release packaging

Local package/make and the preview release workflow SHALL use the same explicit ad-hoc signing
contract. Only the tag workflow MAY represent the verified DMG as a public prerelease.

#### Scenario: Developer builds locally

- **WHEN** a developer runs the native package or make command
- **THEN** Forge SHALL create an explicit ad-hoc package without requesting or discovering Apple
  release credentials
- **AND** local output SHALL NOT be represented as a public release artifact without the tag
  workflow's source, integrity, disclosure, and publication gates

### Requirement: Release artifact closure is exact

The release workflow SHALL publish exactly one versioned `darwin-arm64` DMG and one
`SHASUMS256.txt` manifest derived from that DMG after all native preview checks pass. The DMG version
SHALL be derived from the release tag rather than the source Desktop manifest.

#### Scenario: Forge output is missing or ambiguous

- **WHEN** the expected versioned macOS DMG is absent or more than one candidate satisfies the
  release identity
- **THEN** the release assertion SHALL fail before publication

#### Scenario: Release output is accepted

- **WHEN** the exact DMG exists and every preview check passes
- **THEN** the workflow SHALL compute its SHA-256 and publish only the DMG and checksum manifest

### Requirement: Public release publication is fail-visible and final

The workflow SHALL create a GitHub prerelease only after source, deterministic test, package,
ad-hoc signature, DMG, disclosure, and artifact checks complete successfully.

#### Scenario: An upstream release gate fails

- **WHEN** any required source, test, package, trust, or artifact check fails or is skipped
- **THEN** the GitHub Release creation step SHALL not run

### Requirement: Windows and Linux remain test-only

Windows and Linux CI SHALL execute deterministic validation without invoking Forge package, make,
publish, or artifact-upload paths for Desktop.

#### Scenario: Non-macOS platform validation runs

- **WHEN** the Windows or Linux platform test job executes
- **THEN** it SHALL run only source, typecheck, orchestration, or runtime compatibility tests
- **AND** it SHALL produce no Desktop release artifact
