## 1. Platform Contract

- [x] 1.1 Inventory CI, Release, Engine packaging, FFmpeg, N-API, loader, optional dependency, and documentation platform declarations
- [x] 1.2 Make the Engine canonical target configuration equal exactly `darwin-arm64`, `linux-x64`, and `win32-x64`
- [x] 1.3 Add exact-set regression tests preventing unsupported target declarations

## 2. Packaging And Runtime

- [x] 2.1 Remove unsupported target branches from platform packaging and FFmpeg selection
- [x] 2.2 Remove unsupported N-API package declarations and generated artifact mappings
- [x] 2.3 Make the native loader reject unsupported hosts before optional or local binding resolution
- [x] 2.4 Add loader path tests proving supported mapping and unsupported fail-visible behavior

## 3. CI And Release

- [x] 3.1 Limit CI and Release matrices to the three canonical targets
- [x] 3.2 Run `darwin-arm64` jobs on the current GitHub Apple Silicon runner
- [x] 3.3 Add orchestration tests proving workflow matrices match the canonical target set

## 4. Documentation And Verification

- [x] 4.1 Document Apple Silicon macOS, Linux x64, and Windows x64 as the complete supported matrix
- [x] 4.2 Run focused package, loader, orchestration, and local macOS ARM64 packaging validation
- [x] 4.3 Run OpenSpec, legacy-debt, unused-code, diff hygiene, and Neko quality review checks
