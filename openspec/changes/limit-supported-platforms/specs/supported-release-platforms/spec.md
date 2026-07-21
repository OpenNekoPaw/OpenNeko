## ADDED Requirements

### Requirement: Release platform matrix is closed

The repository SHALL define the complete currently supported release target set as exactly `darwin-arm64` and `linux-x64`.

#### Scenario: Release targets are enumerated

- **WHEN** CI, Release, or Engine packaging enumerates platform targets
- **THEN** the resulting target set SHALL equal the two canonical targets without additional entries

#### Scenario: A new target is proposed

- **WHEN** a platform outside the canonical set is introduced in any release consumer
- **THEN** repository regression guards SHALL fail until the platform contract and all required real-platform evidence are updated

#### Scenario: Host runtime compatibility is enumerated

- **WHEN** the repository enumerates VS Code Extension, Node CLI, or Bun TUI runtime targets
- **THEN** each Host SHALL contain exactly macOS ARM64 and Linux x64

### Requirement: Platform runners match target architecture

Remote platform jobs SHALL use an Apple Silicon macOS runner for `darwin-arm64` and an x64 Linux runner for `linux-x64`; they SHALL NOT schedule a Windows package job while Windows support is deferred.

#### Scenario: macOS package job runs

- **WHEN** GitHub Actions builds the `darwin-arm64` package
- **THEN** it SHALL run on a current Apple Silicon runner and SHALL NOT schedule an Intel macOS job

### Requirement: Engine artifacts only package supported targets

Engine package configuration, N-API artifacts, FFmpeg bundles, and VSIX platform artifacts SHALL only expose the two canonical targets.

#### Scenario: Platform package is produced

- **WHEN** an Engine platform package is requested for a canonical target
- **THEN** the packager SHALL select the matching native binding and FFmpeg artifact for that exact target

#### Scenario: Unsupported package target is requested

- **WHEN** a packaging command receives any other target
- **THEN** it SHALL fail with an explicit unsupported-target diagnostic before producing an artifact

### Requirement: Unsupported native platforms fail before loading

The native binding loader SHALL only resolve bindings for the two canonical OS and architecture combinations and SHALL reject Windows and every other combination before attempting optional-package or local-binary loading.

#### Scenario: Supported host loads a binding

- **WHEN** runtime platform and architecture map to a canonical target
- **THEN** the loader SHALL resolve only the corresponding canonical native binding identity

#### Scenario: Unsupported host starts the extension

- **WHEN** runtime platform and architecture do not map to a canonical target
- **THEN** the loader SHALL throw a diagnostic containing the actual host and supported targets
- **AND** it SHALL NOT fall back to another architecture, generic package, or local binary candidate

### Requirement: Supported platforms are documented consistently

User-facing development and release documentation SHALL identify macOS support as Apple Silicon only, list Linux x64, and identify Windows support as deferred without implying a Windows release artifact exists.

#### Scenario: User checks system requirements

- **WHEN** a user reads the supported-platform documentation
- **THEN** the two canonical targets, the absence of Intel macOS support, and the deferred Windows status SHALL be explicit

### Requirement: Deferred Windows support requires real-platform qualification

Windows-specific source code MAY remain in the repository, but it SHALL NOT be reachable through the current release, packaging, or native-loader success paths. Restoring `win32-x64` support SHALL require a separate platform-contract change and real Windows evidence.

#### Scenario: Windows host starts the current extension

- **WHEN** the native binding loader runs on Windows while support is deferred
- **THEN** it SHALL fail with an explicit unsupported-platform diagnostic before loading any Windows binding

#### Scenario: Windows support is proposed again

- **WHEN** `win32-x64` is proposed for the canonical target set
- **THEN** validation SHALL include native Rust/N-API compilation, platform VSIX installation and startup, and an Engine media read/export path on a real Windows runner or host
- **AND** macOS cross-compilation alone SHALL NOT satisfy the platform qualification
