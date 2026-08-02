## Why

The repository can package the Electron application while Desktop TypeScript contracts are invalid,
because the root build gate does not run `apps/neko-desktop` typecheck. The same build path has also
treated multiple CI operating systems as native product targets even though the current release
decision is macOS Apple Silicon only.

## What Changes

- Add an explicit workspace typecheck graph and make Desktop typecheck a required input to local and
  remote build gates.
- Separate host-neutral validation from native Desktop packaging so an Ubuntu CI runner cannot
  implicitly produce a supported Desktop artifact.
- Add one native package job for macOS Apple Silicon on its matching host runner, while Windows and
  Linux remain deterministic test hosts without Forge output.
- Make CI validation ownership explicit: native platform packaging, deterministic unit/contract
  tests, and credential-free headless functional tests run remotely, while provider-backed Agent
  Evaluation and graphical Electron UI acceptance remain explicit local actions.
- **BREAKING** Replace the previous macOS/Linux and intermediate macOS/Windows product matrices with
  exactly `darwin-arm64`.
- **BREAKING** Reject Windows, Linux, and every other OS/architecture in Desktop package, Sharp
  staging, media runtime, local metadata release-matrix, and release-documentation success paths.
- Keep Windows and Linux available only for deterministic source, typecheck, orchestration,
  local-metadata, and static quality tests; those checks do not constitute Desktop product support.

## Capabilities

### New Capabilities

- `desktop-build-gates`: Defines the workspace typecheck gate, the boundary between host-neutral
  build validation and native packaging, and required native CI evidence.
- `supported-release-platforms`: Defines the closed Desktop release target set as macOS Apple
  Silicon only; Windows, Linux, and the retired VSIX matrix are test surfaces rather than release
  compatibility baselines.

### Modified Capabilities

None. `supported-release-platforms` has not been promoted into `openspec/specs/`; this change
therefore establishes its new canonical requirement instead of writing a delta against a
nonexistent baseline.

## Impact

- Root scripts and Turbo task configuration
- `apps/neko-desktop` Forge configuration, package scripts, and architecture tests
- GitHub Actions build/package jobs and aggregate gates
- Root headless-functional and local graphical UI validation commands
- Sharp, media-runtime, and local-metadata platform matrices
- Build-orchestration and platform-closure tests
- Architecture, roadmap, and Desktop packaging documentation that currently names Linux as a
  release target
- Removal of obsolete Windows/Linux release-runtime closure entries
