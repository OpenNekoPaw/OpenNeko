# macos-desktop-release Specification

## Purpose
TBD - created by archiving change establish-macos-release-pipeline. Update Purpose after archive.
## Requirements
### Requirement: macOS release source and version are authoritative

The release procedure SHALL accept only an exact stable `v<semver>` tag whose commit is reachable
from `main`. The tag SHALL be the sole public release-version authority; the source Desktop manifest
version SHALL NOT gate a release.

#### Scenario: Release tag is invalid

- **WHEN** the release tag is not exactly `v<major>.<minor>.<patch>`
- **THEN** local packaging or publication SHALL fail

#### Scenario: Local and release versions differ

- **WHEN** a valid release tag differs from the version in `apps/neko-desktop/package.json`
- **THEN** the release operator SHALL project the tag-derived version into an isolated local release
  checkout before Forge runs
- **AND** the application and DMG SHALL use the tag-derived version
- **AND** the repository SHALL NOT require or persist a source manifest version change

#### Scenario: Tag commit is outside main

- **WHEN** the tagged commit is not reachable from `origin/main`
- **THEN** the release procedure SHALL fail without creating or editing a GitHub Release

### Requirement: Native release builds are local-only

GitHub Actions SHALL NOT invoke Electron Forge package/make/publish, upload a Desktop native
artifact, or create a GitHub Release. Native release packaging SHALL run only through an explicit
local Apple Silicon operation.

#### Scenario: GitHub validation runs

- **WHEN** Manual Gate or Merge Gate runs on GitHub Actions
- **THEN** it SHALL execute deterministic source, typecheck, test, OpenSpec, dependency, and quality
  checks only
- **AND** it SHALL NOT create or upload a Desktop package, DMG, checksum, or GitHub Release

#### Scenario: A release tag is pushed

- **WHEN** a stable release tag is pushed to GitHub
- **THEN** no GitHub Actions workflow SHALL build or publish the Desktop application

### Requirement: Ad-hoc trust state is explicit without prerelease metadata

The current macOS build SHALL use the repository's explicit ad-hoc application signature and SHALL
NOT require Apple credentials. Its GitHub Release SHALL be an ordinary release rather than a
prerelease and SHALL disclose that the DMG is not Developer ID signed or notarized.

#### Scenario: Apple credentials are absent

- **WHEN** a local release is assembled without Apple signing or notarization credentials
- **THEN** Forge SHALL create the explicit ad-hoc package and DMG without reading those credentials
- **AND** publication SHALL retain the unnotarized installation disclosure

#### Scenario: The ad-hoc package is invalid

- **WHEN** strict codesign verification, ad-hoc identity inspection, or DMG integrity verification
  fails
- **THEN** no release artifact SHALL be published

#### Scenario: Release metadata is created

- **WHEN** the verified DMG and checksum manifest are published to GitHub Releases
- **THEN** the release SHALL NOT carry GitHub prerelease metadata
- **AND** the newest published version SHALL be eligible for the Latest marker

### Requirement: Local development and release packaging share one trust mode

Local package/make and local release packaging SHALL use the same explicit ad-hoc signing contract.
Public release publication SHALL additionally require source, integrity, disclosure, and exact
artifact gates.

#### Scenario: Developer builds locally

- **WHEN** a developer runs the native package or make command
- **THEN** Forge SHALL create an explicit ad-hoc package without requesting or discovering Apple
  release credentials
- **AND** local output SHALL NOT be represented as a public release artifact until the release gates
  pass

### Requirement: Release artifact closure is exact

The local release procedure SHALL publish exactly one versioned `darwin-arm64` DMG and one
`SHASUMS256.txt` manifest derived from that DMG after all native checks pass. The DMG version SHALL
be derived from the release tag rather than the source Desktop manifest.

#### Scenario: Forge output is missing or ambiguous

- **WHEN** the expected versioned macOS DMG is absent or more than one candidate satisfies the
  release identity
- **THEN** the release assertion SHALL fail before publication

#### Scenario: Release output is accepted

- **WHEN** the exact DMG exists and every native release check passes
- **THEN** the release operator SHALL compute its SHA-256 and publish only the DMG and checksum
  manifest

### Requirement: Public release publication is fail-visible and final

The release operator SHALL create or edit an ordinary GitHub Release only after source, package,
ad-hoc signature, DMG, disclosure, and artifact checks complete successfully.

#### Scenario: An upstream release gate fails

- **WHEN** any required source, package, trust, or artifact check fails or is skipped
- **THEN** GitHub Release publication SHALL not run

### Requirement: Windows and Linux remain test-only

Windows and Linux CI SHALL execute deterministic validation without invoking Forge package, make,
publish, or artifact-upload paths for Desktop.

#### Scenario: Non-macOS platform validation runs

- **WHEN** the Windows or Linux platform test job executes
- **THEN** it SHALL run only source, typecheck, orchestration, or runtime compatibility tests
- **AND** it SHALL produce no Desktop release artifact
