## Context

`act` 0.2.87 defaults to pulling runner images for every invocation and starts each job in a new Linux container. On the ARM64 development host, AMD64 emulation made the measured build job take about 14m55s, while the native ARM64 run completed in about 7m05s. The native run still spent 82.6s downloading and installing 322 MB of Clang/FFmpeg/Vulkan packages, restored no pnpm packages, and could not use the host's macOS Cargo or Turbo output safely. Both restore and save through the local `act` Actions cache endpoint failed after about 21s with `socket hang up`.

GitHub-hosted Ubuntu remains the authoritative Linux AMD64 environment. Local `act` is a fast workflow-shape and Linux build check, while macOS Rust validation remains owned by the existing local Rust command and GitHub macOS runner. The active pruned-workspace change also requires the Engine release build to remain one sequential `build:cli && build:napi && compile` owner.

## Goals / Non-Goals

**Goals:**

- Run local CI natively on Apple Silicon by default and make AMD64 an explicit compatibility mode.
- Persist only rebuildable Linux dependency and build data, isolated by container architecture.
- Remove repeated native package downloads with a reusable local runner image.
- Keep remote GitHub Actions cache and dependency installation behavior unchanged.
- Make image refresh, cache paths, and mounted data visible and testable through one wrapper.

**Non-Goals:**

- Replacing GitHub-hosted AMD64 or macOS CI authority with local ARM64 results.
- Sharing macOS `node_modules`, Turbo outputs, Rust toolchains, or Cargo targets with Linux containers.
- Changing the Engine's release profile, LTO settings, native build order, or Turbo cacheability contract.
- Treating caches as durable project state or adding a general-purpose cache service.

## Decisions

### The wrapper owns local execution policy

`scripts/act-ci.sh` remains the canonical local entry point. It selects the architecture, prepares directories, ensures the runner image exists, and supplies all mounts and local-only environment signals. The workflow consumes only two explicit signals: `ACT`, which `act` already owns, and `ACT_NATIVE_DEPS_READY`, which is emitted only when the wrapper selected the prepared image.

Alternative considered: encode bind mounts and local paths in the workflow. This would leak host-specific execution policy into remote CI and make direct GitHub execution depend on local conventions.

### Caches are architecture-isolated bind mounts

The default root is `${ACT_CACHE_ROOT:-$HOME/.cache/openneko-act}` with an architecture key such as `linux-arm64-v8` or `linux-amd64`. The wrapper mounts separate pnpm store, Corepack, Cargo home, Rustup, Turbo, and Cargo target directories at their expected Linux container paths. It explicitly sets pnpm's store directory because pnpm otherwise detects the container workspace overlay as a different filesystem and creates a disposable workspace-local store. The wrapper never binds the whole workspace and never reuses host `node_modules`, `.turbo`, Rust toolchains, or `target` directories.

Architecture separation is required because pnpm optional packages, Rust toolchains, and native outputs can contain platform-specific binaries. All mounted content is derived and can be removed without losing source or user data.

Alternative considered: mount the existing macOS caches. This has better apparent hit rates but can mix incompatible native artifacts and makes failures nondeterministic.

### A small prepared image owns apt/FFmpeg dependencies

`scripts/act/Dockerfile` extends the existing `catthehacker/ubuntu:act-latest` base and installs the package set from `scripts/act/native-build-packages.txt`. The remote workflow reads the same package list, preserving one package source of truth. Docker build context is limited to `scripts/act/` so the 14 GB development workspace is not transferred to Docker.

The wrapper builds the architecture-tagged image only when absent. `--pull` refreshes the base and rebuilds it; otherwise Docker layers and the local image are reused. A custom `ACT_PLATFORM` bypasses the prepared-image assertion, so the workflow installs dependencies normally. For the logical `linux/arm64/v8` platform, the wrapper passes Docker's equivalent normalized `linux/arm64` value to `act`: Docker's local image metadata omits the v8 variant, and `act` 0.2.87 otherwise misclassifies the local image as incompatible and attempts a registry pull.

Alternative considered: persist `/var/cache/apt` and `/var/lib/apt/lists`. This still repeats package installation for every job, couples cache correctness to apt metadata, and provides less deterministic local runners.

### Local Actions cache steps are bypassed explicitly

The two `.turbo` `actions/cache` steps run only when `env.ACT != 'true'`. Local Turbo data is persisted directly by the architecture-specific mount. GitHub-hosted runners keep their existing cache keys, restore behavior, and save behavior.

Alternative considered: rely on the `act` cache server. Repeated restore and save attempts currently fail with `socket hang up`, add roughly 42 seconds, and store no usable cache payload in `~/.cache/actcache`.

### Local and remote architecture evidence have different roles

Native `linux/arm64/v8` is the default local feedback path because it avoids emulation and was about 52% faster in the measured build. `ACT_CONTAINER_ARCHITECTURE=linux/amd64` remains supported for an explicit local compatibility probe. GitHub's `ubuntu-latest` AMD64 result remains required for authoritative CI compatibility.

## Risks / Trade-offs

- [Cache disk growth] Cargo target and registry data can grow to multiple gigabytes → isolate all data below one documented cache root so users can inspect or delete it safely.
- [Stale native runner packages] Reusing the prepared image does not automatically pick up base-image updates → make `--pull` an explicit refresh and rebuild operation; changes to the package list also produce a new Docker layer during the next build.
- [Custom runner lacks dependencies] A custom `ACT_PLATFORM` may not contain the prepared package set → do not set `ACT_NATIVE_DEPS_READY`; the workflow installs the shared dependency list.
- [ARM64-only local defect gap] Native ARM64 cannot prove Linux AMD64 compatibility → preserve the GitHub-hosted AMD64 gate and explicit local AMD64 override.
- [Bind mount path parsing] Docker container options must preserve host paths as one argument → quote generated volume specifications and cover the exact wrapper arguments with fake-tool orchestration tests.
- [ARM64 variant normalization] `act` receives `linux/arm64` rather than the equivalent `/v8` spelling → retain `linux-arm64-v8` in user-facing configuration and cache identity, and test the normalized runtime argument explicitly.

## Migration Plan

1. Add the shared package list and prepared runner Dockerfile.
2. Add local-only workflow conditions while leaving remote behavior unchanged.
3. Update the wrapper and orchestration tests.
4. Run the build job once to populate the image and caches, then again to verify warm-cache behavior.

Rollback removes the local image/cache orchestration and the local-only workflow conditions. Cache directories contain no authoritative data and can be deleted independently.

## Open Questions

None.
