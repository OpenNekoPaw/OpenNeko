## Why

OpenNeko currently declares and packages platform targets beyond the intended product support boundary. The obsolete `darwin-x64` GitHub runner is already leaving main-branch runs queued indefinitely, while retaining unsupported native loader branches and release artifacts creates a support promise that the project does not validate on real hardware.

## What Changes

- **BREAKING** Define the only supported release targets as macOS Apple Silicon (`darwin-arm64`), Linux x64 (`linux-x64`), and Windows x64 (`win32-x64`).
- Remove `darwin-x64` from CI, Release, Engine packaging configuration, native binding resolution, and target tests.
- Remove other non-product native binding success paths so unsupported OS/architecture combinations fail visibly instead of attempting optional package or local binary loading.
- Update macOS CI to a current Apple Silicon runner label and keep platform-specific artifacts limited to the three canonical target identities.
- Add regression guards proving workflow matrices, packaging configuration, and runtime native loading cannot reintroduce an unsupported target.
- Document the supported platform matrix and the prelaunch disposition: no user data changes, but unsupported installations must use a supported machine rather than a compatibility artifact.

## Capabilities

### New Capabilities

- `supported-release-platforms`: Defines the closed OS/architecture release matrix, native packaging artifacts, runner requirements, and fail-visible unsupported-platform behavior.

### Modified Capabilities

None.

## Impact

- GitHub Actions CI and Release platform matrices, plus the repository Host runtime compatibility matrix.
- `packages/neko-engine` target configuration, platform packager, N-API loader, FFmpeg bundle selection, and tests.
- Root and Engine documentation describing supported development and release systems.
- Existing `darwin-x64` artifacts are intentionally discontinued before public release; project files and user data formats are unchanged.
