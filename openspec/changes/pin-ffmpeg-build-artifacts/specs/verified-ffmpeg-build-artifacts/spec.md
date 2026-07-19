## ADDED Requirements

### Requirement: BtbN artifacts have immutable repository-owned identity

Every BtbN-backed FFmpeg development or runtime artifact used by a supported Engine target SHALL be described by an immutable release tag, an exact archive filename, and a lowercase SHA256 digest in the Engine package configuration. The configuration MUST NOT use `latest`, a mutable release alias, or a synthesized filename that can resolve to different bytes without a repository change.

#### Scenario: Inspect supported BtbN artifact configuration

- **WHEN** the Engine package configuration is validated
- **THEN** every BtbN runtime and development entry has an exact archive and 64-character SHA256 under one non-mutable release tag

#### Scenario: A mutable artifact descriptor is introduced

- **WHEN** a descriptor uses `latest`, omits its digest, or contains malformed integrity metadata
- **THEN** package-owned validation fails before CI or release packaging can consume it

### Requirement: FFmpeg archives are verified before use

The Engine FFmpeg acquisition path MUST calculate the SHA256 of every downloaded BtbN archive and compare it with the repository-owned digest before extraction, native compilation, or runtime-library copying. A mismatch MUST fail visibly with the archive identity and expected and actual digests; no checksum bypass, fallback installer, or successful partial result is permitted.

#### Scenario: Downloaded archive matches its descriptor

- **WHEN** the acquired archive bytes produce the configured SHA256
- **THEN** the canonical consumer may proceed to extraction

#### Scenario: Downloaded archive does not match its descriptor

- **WHEN** the acquired archive bytes produce a different SHA256
- **THEN** the operation fails before extraction and reports the expected and actual values

### Requirement: Windows packaging uses the Engine-owned FFmpeg setup path

GitHub CI and release packaging for `win32-x64` SHALL invoke the repository-owned Engine FFmpeg setup path and MUST NOT install `ffmpeg-shared` through Chocolatey. Native compilation SHALL resolve the prepared workspace FFmpeg prefix, and runtime bundling SHALL use the separately declared verified runtime artifact.

#### Scenario: Main CI packages the Windows Engine VSIX

- **WHEN** the `win32-x64` package matrix reaches FFmpeg setup
- **THEN** it invokes the Engine downloader for `win32-x64`, verifies the development archive, and does not execute Chocolatey

#### Scenario: Release workflow packages the Windows Engine VSIX

- **WHEN** the release matrix reaches FFmpeg setup for `win32-x64`
- **THEN** it follows the same Engine-owned verified setup path as main CI

### Requirement: FFmpeg artifact updates are atomic and reviewable

Advancing the packaged FFmpeg build SHALL update the release tag, exact archive identity, and SHA256 together in the Engine-owned configuration. CI workflow files MUST NOT duplicate supplier URLs, archive hashes, or version-specific FFmpeg package metadata.

#### Scenario: Maintainer advances the FFmpeg build

- **WHEN** a new BtbN build is selected
- **THEN** the reviewed configuration change identifies the new release, archives, and digests while CI and release workflow commands remain unchanged
