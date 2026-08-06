## 1. Contracts And Stable Tables

- [x] 1.0 Define package ownership: `@neko/host` owns shell/settings contracts and services;
      `@neko/local-metadata` owns stable SQLite repositories; Desktop owns only Electron paths,
      startup wiring and diagnostic projection.
- [x] 1.1 Define version-free shell-state and application-settings repository contracts without
      renderer fields, workspace fallback, secrets or physical paths.
- [x] 1.2 Classify every canonical field under `local-storage-authority-policy` and reject fields owned
      by portable/user content, secrets, logs, Agent, workspace or rebuildable cache authorities.
- [x] 1.3 Use stable table initialization and additive optional columns; verify existing rows update only
      canonical columns and unknown columns remain untouched.
- [x] 1.4 Add producer/consumer tests for both repository contracts and state/cache transaction ownership.

## 2. Product Migration Retirement

- [x] 2.1 Delete legacy JSON readers/writers and startup import/preflight paths.
- [x] 2.2 Delete migration markers, coordinators, archive behavior and schema registries.
- [x] 2.3 Delete downgrade export and every compatibility/dual-read/dual-write path.
- [x] 2.4 Add reachability tests proving retired files/modules remain outside product imports, build,
      startup, public entries and ordinary tests while existing bytes remain untouched.

## 3. Desktop Composition And Local Failure

- [x] 3.1 Inject package-owned repositories into Host shell-state and application-settings services,
      reducing Desktop composition to concrete adapter construction and delegation.
- [x] 3.2 Keep preload and renderer contracts version-free and sender-bound.
- [x] 3.3 Preserve unknown authority-root metadata and reject invalid child records independently.
- [x] 3.4 Add tests proving one invalid Window, Workbench instance, Scene or settings component cannot
      clear valid siblings or disable Desktop.

## 4. Verification

- [x] 4.1 Run affected Local Metadata, Host and Desktop tests/typechecks plus repository quality gates.
- [x] 4.2 Run isolated real Electron cold-start, restart and workspace-switching scenarios.
- [x] 4.3 Document unchanged retired bytes, canonical-path evidence and unrelated owner exclusions.
- [x] 4.4 Record that rollback is source-level and cannot restore product migration or rewrite user data.
