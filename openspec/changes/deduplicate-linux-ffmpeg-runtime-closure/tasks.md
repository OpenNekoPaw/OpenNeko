## 1. Regression Contract

- [x] 1.1 Add a real-symlink fixture test that reproduces duplicate Linux FFmpeg alias materialization
- [x] 1.2 Add failure cases for missing, ambiguous, and mismatched major-version SONAME inputs
- [x] 1.3 Add a dependency-closure regression for a native binary requesting an unavailable FFmpeg major version
- [x] 1.4 Add workflow regression coverage for configured FFmpeg SDK preparation before native compilation
- [x] 1.5 Add Engine inclusion-rule coverage and final OpenNeko staging coverage that reject `deps/` payloads

## 2. Canonical Linux Closure

- [x] 2.1 Implement one SONAME-validated Linux FFmpeg runtime materializer
- [x] 2.2 Route BtbN bundling through the materializer while preserving `$ORIGIN` patching
- [x] 2.3 Validate FFmpeg `DT_NEEDED` names for the native binary and materialized libraries
- [x] 2.4 Align CI and Release native compilation with the configured FFmpeg development source
- [x] 2.5 Exclude the build-only Engine `deps/` tree and enforce the final feature payload boundary

## 3. Validation

- [x] 3.1 Run the focused Engine script regression tests and media closure checks
- [x] 3.2 Run OpenSpec validation, diff checks, and applicable repository quality gates
- [x] 3.3 Record the real Linux Merge Gate packaging check required before the next release
- [x] 3.4 Build the Linux Engine and composed OpenNeko VSIX locally, then record closure and compressed-size evidence
