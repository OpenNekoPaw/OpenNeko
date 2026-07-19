# Verification: optimize-local-act-cache

Date: 2026-07-19

## Passed

- `bash -n scripts/act-ci.sh` and `git diff --check` pass.
- `pnpm check:test-orchestration` passes 35 tests plus ownership and coverage audits.
- `pnpm check:openspec` passes strict validation for all 21 OpenSpec items, including this change.
- The focused act/native-dependency tests pass 7/7, covering ARM64 defaulting, AMD64 isolation, image reuse/refresh, custom platforms, quoted mounts, shared package lists, and all remote-only Turbo cache steps.
- The prepared ARM64 image builds successfully in about 74 seconds. Docker reports `linux/arm64` metadata (the normalized runtime spelling) and an inspected image size of about 1.02 GB.
- Three ARM64 `build` runs succeeded: cold cache about 13m02s, cache/hash warm-up about 6m25s, and stable warm cache about 4m42s. The stable run reused 1,176 pnpm packages with zero downloads, hit 9/10 Turbo tasks, and completed the Engine N-API release build in about 1m37s.

## Cache evidence

The default cache root is `${ACT_CACHE_ROOT:-$HOME/.cache/openneko-act}`. The measured `linux-arm64-v8` namespace is about 3.6 GB: pnpm store 972 MB, Cargo home 660 MB, Cargo target 1.4 GB, Rustup 539 MB, Turbo 13 MB, and Corepack 20 MB. `~/.cache/act` contains about 913 MB of action sources; `~/.cache/actcache` is effectively empty (about 64 KB) and is no longer relied upon. Prepared runner images are Docker-managed separately from the bind-mounted cache root.

## Architecture and residual risk

- Local ARM64/v8 is the default fast feedback path; `act` receives equivalent `linux/arm64` because act 0.2.87 does not preserve the v8 image variant marker.
- `ACT_CONTAINER_ARCHITECTURE=linux/amd64` provides an explicit local compatibility probe with an isolated cache namespace. GitHub-hosted Ubuntu AMD64 remains the authoritative remote Linux result; local ARM64 does not replace it.
- `pnpm`, Corepack, Cargo, Rustup, Turbo, and Cargo target data are rebuildable and removable. The cache root contains no source or authoritative project state; removing it causes repopulation on the next run. Docker runner images must be removed through Docker when desired.
- This change does not validate macOS Rust authority, remote GitHub Actions behavior, or provider-backed/UI runtime paths; those remain covered by their existing local/remote gates.
