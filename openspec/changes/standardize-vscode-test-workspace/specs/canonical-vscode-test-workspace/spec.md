# canonical-vscode-test-workspace Specification

## ADDED Requirements

### Requirement: Runtime acceptance uses one workspace root

OpenNeko SHALL use `${HOME}/Git/neko-test` as the only workspace root for
Extension Development Host, Webview, and real-media acceptance.

#### Scenario: Development Host starts

- **WHEN** a developer starts an OpenNeko runtime validation launch
- **THEN** the final workspace argument is `${env:HOME}/Git/neko-test`
- **AND** no repository-local `.tmp` workspace or other workspace root is
  selected

#### Scenario: Runtime validation receives an explicit media directory

- **WHEN** the requested directory resolves outside `${HOME}/Git/neko-test`
- **THEN** validation fails before reading media
- **AND** the external directory is not treated as acceptance evidence

### Requirement: Generated fixtures preserve the workspace root

OpenNeko SHALL generate disposable runtime fixtures only in marker-owned
subdirectories of `${HOME}/Git/neko-test/.neko/.functional`.

#### Scenario: Media fixture is prepared

- **WHEN** the media fixture generator runs
- **THEN** it writes only below
  `${HOME}/Git/neko-test/.neko/.functional/media-runtime`
- **AND** it does not remove or replace `${HOME}/Git/neko-test`

#### Scenario: Existing fixture ownership is unknown

- **WHEN** the generated fixture directory exists without the expected marker
- **THEN** replacement fails visibly
- **AND** no file in that directory is deleted

#### Scenario: Existing fixture marker is valid

- **WHEN** the generated fixture directory contains the expected schema and
  kind marker
- **THEN** only that exact generated directory may be replaced
- **AND** sibling test media and project files remain unchanged

### Requirement: Non-workspace temporary data remains independently isolated

The canonical workspace rule SHALL apply to runtime acceptance workspaces and
source directories, not to unit-test temporary files, build outputs, caches, or
gitignored reports.

#### Scenario: Unit test allocates a temporary directory

- **WHEN** the directory is not opened as an Extension Development Host
  workspace and is not used as real-media acceptance evidence
- **THEN** the test may use its framework-owned temporary directory
