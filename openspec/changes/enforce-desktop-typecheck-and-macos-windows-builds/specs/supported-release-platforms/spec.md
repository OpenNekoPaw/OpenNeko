## ADDED Requirements

### Requirement: Desktop release platform matrix is closed

The repository SHALL define the complete Desktop release target set as exactly `darwin-arm64` and
`win32-x64`.

#### Scenario: Release targets are enumerated

- **WHEN** Desktop packaging, native runtime staging, CI, or release documentation enumerates
  product targets
- **THEN** the resulting set SHALL equal the two canonical targets without Linux, Intel macOS,
  Windows ARM/IA32, or unknown entries

#### Scenario: Linux runs host-neutral checks

- **WHEN** lint, unit tests, OpenSpec validation, dependency analysis, or other host-neutral checks
  run on Linux
- **THEN** that runner SHALL NOT be represented as Linux Desktop support or produce a Linux Desktop
  artifact

### Requirement: Unsupported native package hosts fail visibly

Desktop build, package, and make commands SHALL reject every OS/architecture pair outside the
canonical target set before invoking Electron Forge.

#### Scenario: Unsupported host requests a package

- **WHEN** Linux, Intel macOS, Windows ARM/IA32, or an unknown host invokes a native Desktop package
  command
- **THEN** the command SHALL fail with the actual host and the supported target list
- **AND** it SHALL NOT fall back to another architecture or produce an artifact

### Requirement: Native runtime matrices match release targets

Sharp staging, local metadata release checks, media descriptors, and packaged native runtime SHALL
accept exactly `darwin-arm64` and `win32-x64`, and they MUST reject every other target before
staging release payloads.

#### Scenario: Linux native runtime is requested

- **WHEN** a release staging or descriptor command receives `linux-x64`
- **THEN** it SHALL fail with an unsupported-target diagnostic

#### Scenario: Windows media descriptor is qualified

- **WHEN** a `win32-x64` media runtime descriptor is verified
- **THEN** it SHALL require the portable software decoder, H.264/AAC encoder, and common filter
  baseline
- **AND** it SHALL NOT claim VAAPI, VideoToolbox, or unqualified Windows hardware acceleration

### Requirement: Platform documentation distinguishes build from qualification

Current user and architecture documentation SHALL identify macOS Apple Silicon and Windows x64 as
the only intended Desktop targets, Linux as host-neutral CI only, and native package construction
as insufficient evidence for complete platform qualification.

#### Scenario: A contributor reads platform status

- **WHEN** a contributor reviews current system requirements or the Desktop roadmap
- **THEN** the target set, unsupported architectures, and outstanding Windows qualification work
  SHALL be explicit

### Requirement: Windows evidence comes from Windows

`win32-x64` package evidence SHALL be produced on a real x64 Windows runner or host.

#### Scenario: Windows package target is validated

- **WHEN** CI validates the Windows Desktop target
- **THEN** Electron download/checksum, Vite bundles, ASAR/fuses, native dependencies, and packaged
  output SHALL be produced on Windows x64
- **AND** macOS or Linux cross-packaging SHALL NOT satisfy the requirement
