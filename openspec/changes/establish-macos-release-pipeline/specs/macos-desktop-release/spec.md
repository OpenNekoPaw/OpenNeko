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
- **AND** the application and ZIP SHALL use the tag-derived version
- **AND** the repository SHALL NOT require or persist a local manifest version change

#### Scenario: Tag commit is outside main

- **WHEN** the tagged commit is not reachable from `origin/main`
- **THEN** the workflow SHALL fail without creating a GitHub Release

### Requirement: Release mode requires the macOS trust closure

The release build SHALL use a Developer ID Application identity, hardened runtime, Apple
notarization, stapling, strict codesign verification, and Gatekeeper assessment.

#### Scenario: A release credential is absent

- **WHEN** release mode lacks the signing identity, keychain, Apple ID, app-specific password, or
  team ID
- **THEN** Forge configuration SHALL fail visibly and SHALL NOT fall back to ad-hoc signing

#### Scenario: Trust verification fails

- **WHEN** signing, notarization, stapling, codesign verification, or Gatekeeper assessment fails
- **THEN** no public artifact or GitHub Release SHALL be created

### Requirement: Development packaging is isolated from release mode

Local Desktop package and make commands SHALL retain an explicit ad-hoc development signature when
release mode is absent.

#### Scenario: Developer makes a local package

- **WHEN** a developer runs the native package command without release mode
- **THEN** Forge SHALL produce an ad-hoc-signed validation package without requiring repository
  release credentials
- **AND** that package SHALL NOT be represented as a public release artifact

### Requirement: Release artifact closure is exact

The release workflow SHALL publish exactly one versioned `darwin-arm64` ZIP and one
`SHASUMS256.txt` manifest derived from that ZIP after all native trust checks pass. The ZIP version
SHALL be derived from the release tag rather than the source Desktop manifest.

#### Scenario: Forge output is missing or ambiguous

- **WHEN** the expected versioned macOS ZIP is absent or more than one candidate satisfies the
  release identity
- **THEN** the release assertion SHALL fail before publication

#### Scenario: Release output is accepted

- **WHEN** the exact ZIP exists and every trust check passes
- **THEN** the workflow SHALL compute its SHA-256 and publish only the ZIP and checksum manifest

### Requirement: Public release publication is fail-visible and final

The workflow SHALL create a GitHub Release only after source, deterministic test, package, trust,
and artifact checks complete successfully.

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
