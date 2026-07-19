## ADDED Requirements

### Requirement: Local and remote architecture roles are explicit
The local CI wrapper SHALL use logical platform `linux/arm64/v8` by default on the ARM64 development path, SHALL normalize it to Docker's equivalent `linux/arm64` spelling when invoking `act`, SHALL accept an explicit container architecture override, and SHALL preserve GitHub-hosted Ubuntu AMD64 as the authoritative remote Linux result.

#### Scenario: Default local execution
- **WHEN** a developer invokes the local CI wrapper without an architecture override
- **THEN** each selected `act` job uses the architecture-specific ARM64/v8 image and cache namespace while `act` receives Docker-compatible architecture `linux/arm64`

#### Scenario: Explicit AMD64 compatibility execution
- **WHEN** a developer sets `ACT_CONTAINER_ARCHITECTURE=linux/amd64`
- **THEN** the wrapper uses an AMD64-specific image and cache namespace without changing the remote workflow runner

### Requirement: Local build caches are persistent, rebuildable, and architecture-isolated
The local CI wrapper SHALL store pnpm, Corepack, Turbo, Cargo, Rustup, and Cargo target data under an architecture-specific directory below `${ACT_CACHE_ROOT:-$HOME/.cache/openneko-act}`. It MUST NOT mount host `node_modules` or reuse host build output directories across operating systems or container architectures.

#### Scenario: Cache directories are mounted
- **WHEN** the wrapper starts a local job
- **THEN** it creates and bind-mounts the architecture-specific cache directories at the corresponding Linux tool paths

#### Scenario: Architecture changes
- **WHEN** two local runs select ARM64 and AMD64 respectively
- **THEN** no architecture-sensitive pnpm, Rustup, Cargo, Turbo, or Cargo target directory is shared between those runs

#### Scenario: Cache removal
- **WHEN** a developer deletes the configured local cache root
- **THEN** a later local run can recreate all directories without loss of source code, project state, settings, or other authoritative user data

### Requirement: Native build dependencies have one package source of truth
The prepared local runner image and the GitHub-hosted Linux build job SHALL install native Engine build dependencies from the same repository-owned package list. The workflow SHALL skip installation only when both `ACT` and `ACT_NATIVE_DEPS_READY` identify a prepared local runner.

#### Scenario: Prepared local runner
- **WHEN** the wrapper runs a job with its architecture-specific prepared image
- **THEN** the workflow does not execute apt update or native dependency installation

#### Scenario: GitHub-hosted runner
- **WHEN** GitHub Actions runs the Linux build job
- **THEN** the workflow installs every package in the shared native dependency list

#### Scenario: Custom act platform
- **WHEN** a developer overrides `ACT_PLATFORM` with an unprepared runner image
- **THEN** the wrapper does not claim native dependencies are ready and the workflow installs them

### Requirement: Runner image refresh is explicit
The local CI wrapper SHALL reuse an existing architecture-specific prepared runner image and SHALL disable `act`'s implicit runner-image pull by default. The wrapper's `--pull` option SHALL refresh the base image and rebuild the prepared image, or request a pull when a custom platform is selected.

#### Scenario: Warm runner image
- **WHEN** the architecture-specific prepared image already exists and `--pull` is absent
- **THEN** the wrapper skips Docker build and passes `--pull=false` to `act`

#### Scenario: Explicit prepared-image refresh
- **WHEN** a developer invokes the wrapper with `--pull`
- **THEN** Docker rebuilds the architecture-specific image with base-image pulling enabled and `act` does not attempt to pull the local tag

### Requirement: Remote workflow cache behavior is preserved
The workflow SHALL retain its existing GitHub-hosted Turbo cache restore and save behavior while bypassing `actions/cache` under `act`, where Turbo persistence is supplied by the architecture-specific bind mount.

#### Scenario: Local act cache path
- **WHEN** an `act` job evaluates the Turbo cache step
- **THEN** the `actions/cache` step is skipped and the mounted `.turbo` directory remains available to the build

#### Scenario: Remote cache path
- **WHEN** the same workflow runs on GitHub-hosted infrastructure
- **THEN** the `actions/cache` step executes with the existing keys and restore keys
