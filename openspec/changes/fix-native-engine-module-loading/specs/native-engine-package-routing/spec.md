## ADDED Requirements

### Requirement: Native Engine VSIX uses only platform-specific packaging

Release package grouping MUST exclude `neko-engine` from the TypeScript-only extension set. CI and tag release workflows SHALL produce Engine VSIX artifacts only through the canonical supported-platform matrix that owns N-API and FFmpeg preparation.

#### Scenario: Package TypeScript-only extensions

- **WHEN** CI or tag release enumerates `packages.tsExtensions`
- **THEN** `neko-engine` is absent and VSCE does not invoke its native prepublish build in that job

#### Scenario: Package Engine extensions

- **WHEN** CI or tag release packages `neko-engine`
- **THEN** each supported target is built by the platform-specific Engine job with the matching native binding and FFmpeg closure

### Requirement: Engine remains a stable release package

Removing Engine from the TypeScript-only group MUST NOT remove it from `buildRelease`, the stable release channel, the platform matrix, or release artifact aggregation.

#### Scenario: Audit release ownership

- **WHEN** release package groups and workflow dependencies are validated
- **THEN** Engine has exactly the platform-specific VSIX packaging owner and remains part of the stable release artifact set
