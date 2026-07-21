## ADDED Requirements

### Requirement: Each supported platform has one installable artifact

The distribution SHALL produce exactly one directly installable OpenNeko VSIX for each canonical supported platform and SHALL NOT publish internal feature VSIX files.

#### Scenario: Package macOS release

- **WHEN** the `darwin-arm64` packaging target succeeds for version `0.0.2`
- **THEN** its only public VSIX SHALL be named `OpenNeko-darwin-arm64-0.0.2.vsix`

#### Scenario: Package Linux release

- **WHEN** the `linux-x64` packaging target succeeds for version `0.0.2`
- **THEN** its only public VSIX SHALL be named `OpenNeko-linux-x64-0.0.2.vsix`

#### Scenario: Internal feature package reaches publication

- **WHEN** a release artifact set contains `neko-agent`, `neko-assets`, `neko-canvas`, `neko-cut`, `neko-engine`, `neko-preview`, `neko-suite`, or `neko-tools` as a separate VSIX
- **THEN** publication SHALL fail before creating or updating the GitHub Release

### Requirement: The OpenNeko VSIX owns the complete retained product

The installed OpenNeko extension SHALL contain and activate Engine, Tools, Preview, Assets, Cut, Canvas, and Agent through the application composition root without requiring those internal extension IDs to be installed from a marketplace.

#### Scenario: Install offline

- **WHEN** a user installs the platform OpenNeko VSIX in an isolated supported VS Code host with no Neko extensions installed
- **THEN** all retained commands, views, custom editors, themes, languages, Webviews, and Engine APIs SHALL be available after activation

#### Scenario: Inspect product manifest

- **WHEN** the final VSIX manifest is inspected
- **THEN** it SHALL have the OpenNeko application identity and runtime entry
- **AND** it SHALL NOT declare an internal `extensionPack` or internal Neko `extensionDependencies`

### Requirement: Embedded feature ownership remains isolated

The application SHALL activate each retained feature through an explicit embedded adapter with a feature-scoped resource root, storage projection, subscription collection, and exported API registration.

#### Scenario: Activate retained features

- **WHEN** the OpenNeko application activates
- **THEN** it SHALL activate Engine, Tools, Preview, Assets, Cut, Canvas, and Agent in canonical dependency order
- **AND** each feature SHALL resolve its own packaged Webview and localization resources from its scoped root

#### Scenario: Deactivate the application

- **WHEN** the OpenNeko application deactivates
- **THEN** feature deactivation and disposable cleanup SHALL run in reverse dependency order
- **AND** failures SHALL be reported rather than silently ignored

### Requirement: Internal feature APIs use explicit composition

Internal Neko feature callers SHALL resolve embedded feature APIs from the shared in-process registry and SHALL NOT depend on marketplace discovery of internal Neko extension IDs.

#### Scenario: Resolve an embedded API

- **WHEN** Canvas requests the Assets or Preview API, Agent requests Engine or Canvas, or Tools requests Engine or Assets
- **THEN** the registry SHALL activate the canonical embedded owner at most once and return its exported API

#### Scenario: Resolve an invalid embedded API

- **WHEN** an internal feature ID is missing, duplicated, stale, or participates in an activation cycle
- **THEN** resolution SHALL fail with an explicit diagnostic containing the feature identity or cycle
- **AND** it SHALL NOT fall back to an absent standalone Neko extension

#### Scenario: Resolve an external VS Code extension

- **WHEN** a feature requests an external extension such as `vscode.git`
- **THEN** the request SHALL continue through the VS Code extension API rather than the internal registry

### Requirement: Package assembly is deterministic and closed

The assembler SHALL derive feature membership from the canonical package group, merge manifests and localization deterministically, and reject incomplete, conflicting, or cross-target payloads before creating the final VSIX.

#### Scenario: Merge compatible contributions

- **WHEN** retained feature manifests contain distinct contribution identities and compatible localization keys
- **THEN** the final manifest SHALL contain their complete deterministic union

#### Scenario: Detect a contribution collision

- **WHEN** two feature manifests declare the same contribution identity with different definitions or localization values
- **THEN** assembly SHALL fail with both owning feature paths

#### Scenario: Inspect native closure

- **WHEN** a final platform VSIX is inspected
- **THEN** it SHALL contain exactly the Engine native binding and FFmpeg closure for its target
- **AND** it SHALL contain no native binary for the other supported target

### Requirement: Release publication is allowlisted

Merge Gate and Release SHALL use the same two-target OpenNeko artifact contract, and the release-environment job SHALL generate checksums and publish only an exact allowlist of final platform VSIX files.

#### Scenario: Publish a complete release

- **WHEN** both platform packaging jobs succeed for a validated main-history version tag
- **THEN** the GitHub Release SHALL attach exactly the two OpenNeko platform VSIX files and one `SHA256SUMS`

#### Scenario: Platform package is missing or extra

- **WHEN** either canonical platform VSIX is absent or any unexpected VSIX is present
- **THEN** the publication job SHALL fail before obtaining a successful release result

### Requirement: Legacy multi-extension state is not silently discarded

The unified extension SHALL detect installed legacy Neko feature extensions and SHALL expose the state-reset and removal boundary before enabling the single-owner runtime.

#### Scenario: Legacy extensions are installed

- **WHEN** the unified extension detects one or more legacy internal Neko extension IDs
- **THEN** it SHALL identify the conflicting extensions and require explicit user confirmation/removal
- **AND** it SHALL NOT silently register duplicate commands or delete project files, settings, credentials, or extension data

#### Scenario: Clean single-package installation

- **WHEN** no legacy Neko feature extensions are installed
- **THEN** activation SHALL proceed without a migration prompt
