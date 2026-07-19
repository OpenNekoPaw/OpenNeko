## Why

Local `act` runs on Apple Silicon currently emulate AMD64, repeatedly download Linux native dependencies, and fail to persist pnpm, Turbo, and Cargo build data across isolated job containers. This makes the local CI feedback loop substantially slower than the GitHub-hosted AMD64 authority while the built-in `act` cache server is not reliably storing workflow cache entries.

## What Changes

- Make local `act` runs use native `linux/arm64/v8` by default while retaining an explicit AMD64 compatibility override and keeping GitHub-hosted CI authoritative.
- Build and reuse an architecture-specific local runner image with the Linux FFmpeg, Clang, SSL, VA-API, and Vulkan development dependencies required by the Engine build.
- Persist rebuildable pnpm, Corepack, Turbo, Cargo registry/git, Rust toolchain, and Cargo target data in architecture-isolated host cache directories mounted into `act` job containers.
- Skip `actions/cache` and native package installation only when the workflow is running through the prepared local `act` runner; retain the existing remote GitHub Actions behavior.
- Disable `act`'s implicit runner-image pull by default and make the wrapper's explicit `--pull` option refresh the base image and rebuild the prepared runner image.
- Add orchestration tests that verify architecture selection, cache isolation, container mounts, image reuse, and refresh behavior without running Docker workloads.

## Capabilities

### New Capabilities

- `local-act-ci-execution`: Defines the supported local CI architecture model, prepared runner image, rebuildable cache ownership, remote CI separation, and wrapper behavior.

### Modified Capabilities

None.

## Impact

- Local runner orchestration: `scripts/act-ci.sh` and new files under `scripts/act/`.
- CI workflow behavior: local-only conditions in `.github/workflows/ci.yml`; GitHub-hosted job semantics remain unchanged.
- Validation: orchestration tests under `scripts/test-orchestration/`.
- Local disk usage: architecture-specific, user-removable caches under `${ACT_CACHE_ROOT:-$HOME/.cache/openneko-act}` and reusable Docker runner images.
