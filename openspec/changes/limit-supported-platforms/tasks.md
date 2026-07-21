## 1. Platform Contract

- [x] 1.1 Inventory CI, Release, Engine packaging, FFmpeg, N-API, loader, optional dependency, and documentation platform declarations
- [x] 1.2 Make the Engine canonical target configuration equal exactly `darwin-arm64` and `linux-x64`
- [x] 1.3 Add exact-set regression tests preventing unsupported target declarations

## 2. Packaging And Runtime

- [x] 2.1 Remove unsupported target branches from platform packaging and FFmpeg selection
- [x] 2.2 Remove unsupported N-API package declarations and generated artifact mappings
- [x] 2.3 Make the native loader reject unsupported hosts before optional or local binding resolution
- [x] 2.4 Add loader path tests proving supported mapping and unsupported fail-visible behavior

## 3. CI And Release

- [x] 3.1 Limit CI and Release matrices to the two canonical targets
- [x] 3.2 Run `darwin-arm64` jobs on the current GitHub Apple Silicon runner
- [x] 3.3 Add orchestration tests proving workflow matrices match the canonical target set

## 4. Documentation And Verification

- [x] 4.1 Document Apple Silicon macOS and Linux x64 as the complete supported matrix, with Windows explicitly deferred
- [x] 4.2 Run focused package, loader, orchestration, and local macOS ARM64 packaging validation
- [x] 4.3 Run OpenSpec, legacy-debt, unused-code, diff hygiene, and Neko quality review checks

## 5. Defer Windows Support

- [x] 5.1 Update the platform contract so the canonical target set is exactly `darwin-arm64` and `linux-x64`
- [x] 5.2 Remove `win32-x64` from CI, Release, Engine packaging configuration, N-API metadata, and native binding resolution
- [x] 5.3 Remove Windows from Host runtime metadata and add fail-visible regression coverage preventing Windows release-path re-entry
- [x] 5.4 Document Windows as deferred and define real-Windows qualification requirements for restoring support
- [x] 5.5 Run focused platform, packaging, loader, orchestration, OpenSpec, build, test, and quality validation
