## 1. Native Runner Image

- [x] 1.1 Add the shared Linux native dependency package list and architecture-aware `act` runner Dockerfile.
- [x] 1.2 Make the Linux build workflow consume the package list and skip installation only for a prepared local runner.

## 2. Local Cache Orchestration

- [x] 2.1 Add architecture-isolated pnpm, Corepack, Turbo, Cargo, Rustup, and Cargo target mounts to `scripts/act-ci.sh`.
- [x] 2.2 Add prepared-image reuse, explicit refresh, custom-platform behavior, and default `--pull=false` semantics.
- [x] 2.3 Bypass workflow `actions/cache` steps under `act` while preserving GitHub-hosted behavior.

## 3. Verification

- [x] 3.1 Add fake-tool orchestration tests for default ARM64, AMD64 isolation, mounts, image reuse, refresh, and custom platforms.
- [x] 3.2 Extend native dependency tests to prove the workflow and Dockerfile share the package list.
- [x] 3.3 Run script syntax, orchestration, OpenSpec, diff, and ARM64 cold/warm build validation; record performance and residual risk.
