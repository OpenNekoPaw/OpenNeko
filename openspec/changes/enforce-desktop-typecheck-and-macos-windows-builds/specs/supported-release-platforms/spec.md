## ADDED Requirements

### Requirement: Desktop release platform matrix is closed

The repository SHALL define the complete Desktop package and release target set as exactly
`darwin-arm64`.

#### Scenario: Release targets are enumerated

- **WHEN** Desktop packaging, native runtime staging, CI, or release documentation enumerates
  product targets
- **THEN** the resulting set SHALL contain only `darwin-arm64` without Windows, Linux, Intel macOS,
  or unknown entries

#### Scenario: Windows and Linux run tests

- **WHEN** source, typecheck, orchestration, local-metadata, dependency, or other deterministic
  checks run on Windows or Linux
- **THEN** those runners SHALL NOT be represented as Desktop support or produce a Desktop artifact

### Requirement: Unsupported native package hosts fail visibly

Desktop build, package, and make commands SHALL reject every OS/architecture pair other than
`darwin-arm64` before invoking Electron Forge.

#### Scenario: Unsupported host requests a package

- **WHEN** Windows, Linux, Intel macOS, or an unknown host invokes a native Desktop package command
- **THEN** the command SHALL fail with the actual host and the sole supported target
- **AND** it SHALL NOT fall back to another architecture or produce an artifact

### Requirement: Native runtime matrices match the release target

Sharp staging, local-metadata release checks, media descriptors, and packaged native runtime SHALL
accept exactly `darwin-arm64` and MUST reject every other target before staging release payloads.

#### Scenario: Windows or Linux native runtime is requested

- **WHEN** a release staging or descriptor command receives `win32-x64` or `linux-x64`
- **THEN** it SHALL fail with an unsupported-target diagnostic

#### Scenario: Sharp native closure is executed in CI

- **WHEN** CI validates the staged Sharp runtime used by Desktop packaging
- **THEN** the executable closure SHALL run on the matching `darwin-arm64` host
- **AND** Windows/Linux test jobs SHALL NOT stage a product-native Sharp closure

### Requirement: Platform documentation distinguishes tests from release support

Current user and architecture documentation SHALL identify macOS Apple Silicon as the only package
and release target and Windows/Linux as test-only platforms.

#### Scenario: A contributor reads platform status

- **WHEN** a contributor reviews current system requirements or the Desktop roadmap
- **THEN** the sole release target, unsupported architectures, test-only platforms, and outstanding
  formal-release evidence SHALL be explicit

### Requirement: Non-macOS tests cannot qualify a release

Windows and Linux test evidence SHALL remain deterministic compatibility evidence and SHALL NOT
satisfy a native package, signing, notarization, installation, or runtime release requirement.

#### Scenario: Windows or Linux tests pass

- **WHEN** a non-macOS platform test job succeeds
- **THEN** aggregate source gates MAY accept that test evidence
- **AND** no Desktop package or release qualification SHALL be inferred from it
