## ADDED Requirements

### Requirement: Release platform matrix is closed

The repository SHALL define the complete supported release target set as exactly `darwin-arm64`, `linux-x64`, and `win32-x64`.

#### Scenario: Release targets are enumerated

- **WHEN** CI, Release, or Engine packaging enumerates platform targets
- **THEN** the resulting target set SHALL equal the three canonical targets without additional entries

#### Scenario: A new target is proposed

- **WHEN** a platform outside the canonical set is introduced in any release consumer
- **THEN** repository regression guards SHALL fail until the platform contract and all required real-platform evidence are updated

#### Scenario: Host runtime compatibility is enumerated

- **WHEN** the repository enumerates VS Code Extension, Node CLI, or Bun TUI runtime targets
- **THEN** each Host SHALL contain exactly macOS ARM64, Linux x64, and Windows x64

### Requirement: Platform runners match target architecture

Remote platform jobs SHALL use an Apple Silicon macOS runner for `darwin-arm64`, an x64 Linux runner for `linux-x64`, and an x64 Windows runner for `win32-x64`.

#### Scenario: macOS package job runs

- **WHEN** GitHub Actions builds the `darwin-arm64` package
- **THEN** it SHALL run on a current Apple Silicon runner and SHALL NOT schedule an Intel macOS job

### Requirement: Engine artifacts only package supported targets

Engine package configuration, N-API artifacts, FFmpeg bundles, and VSIX platform artifacts SHALL only expose the three canonical targets.

#### Scenario: Platform package is produced

- **WHEN** an Engine platform package is requested for a canonical target
- **THEN** the packager SHALL select the matching native binding and FFmpeg artifact for that exact target

#### Scenario: Unsupported package target is requested

- **WHEN** a packaging command receives any other target
- **THEN** it SHALL fail with an explicit unsupported-target diagnostic before producing an artifact

### Requirement: Unsupported native platforms fail before loading

The native binding loader SHALL only resolve bindings for the three canonical OS and architecture combinations and SHALL reject every other combination before attempting optional-package or local-binary loading.

#### Scenario: Supported host loads a binding

- **WHEN** runtime platform and architecture map to a canonical target
- **THEN** the loader SHALL resolve only the corresponding canonical native binding identity

#### Scenario: Unsupported host starts the extension

- **WHEN** runtime platform and architecture do not map to a canonical target
- **THEN** the loader SHALL throw a diagnostic containing the actual host and supported targets
- **AND** it SHALL NOT fall back to another architecture, generic package, or local binary candidate

### Requirement: Supported platforms are documented consistently

User-facing development and release documentation SHALL identify macOS support as Apple Silicon only and SHALL list Linux x64 and Windows x64 without implying Intel macOS or other architecture support.

#### Scenario: User checks system requirements

- **WHEN** a user reads the supported-platform documentation
- **THEN** the three canonical targets and the absence of Intel macOS support SHALL be explicit
