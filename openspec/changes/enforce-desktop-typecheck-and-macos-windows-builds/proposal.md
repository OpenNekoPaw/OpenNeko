## Why

The repository can currently package the Electron application while Desktop TypeScript contracts are
invalid, because the root build gate does not run `apps/neko-desktop` typecheck. The same build path
also packages a Linux Desktop application on Ubuntu even though the product target is being narrowed
to macOS and Windows.

## What Changes

- Add an explicit workspace typecheck graph and make Desktop typecheck a required input to local and
  remote build gates.
- Separate host-neutral validation from native Desktop packaging so an Ubuntu CI runner cannot
  implicitly produce a supported Desktop artifact.
- Add native package jobs for macOS Apple Silicon and Windows x64, with each target built on its
  matching host runner.
- Make CI validation ownership explicit: native platform packaging, deterministic unit/contract
  tests, and credential-free headless functional tests run remotely, while provider-backed Agent
  Evaluation and graphical Electron UI acceptance remain explicit local actions.
- **BREAKING** Replace the `darwin-arm64` plus `linux-x64` product release set with exactly
  `darwin-arm64` plus `win32-x64`.
- **BREAKING** Reject Linux and every other OS/architecture in Desktop package, Sharp staging, media
  runtime, local metadata release-matrix, and release-documentation success paths.
- Keep Linux available only for host-neutral lint, test, OpenSpec, dependency, and static quality
  checks; those checks do not constitute Linux Desktop product support.

## Capabilities

### New Capabilities

- `desktop-build-gates`: Defines the workspace typecheck gate, the boundary between host-neutral
  build validation and native packaging, and required native CI evidence.
- `supported-release-platforms`: Defines the closed Desktop release target set as macOS Apple
  Silicon and Windows x64; the retired Linux/VSIX matrix is not a compatibility baseline.

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
- Windows packaging dependencies and the workspace lockfile
