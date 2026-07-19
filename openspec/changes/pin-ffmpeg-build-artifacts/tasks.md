## 1. Regression Contract

- [x] 1.1 Add package-owned tests for immutable FFmpeg descriptors and checksum match/mismatch behavior
- [x] 1.2 Run the focused tests against the current floating configuration and capture the expected failure

## 2. Canonical FFmpeg Acquisition

- [x] 2.1 Replace floating BtbN templates with exact release, archive, and SHA256 descriptors
- [x] 2.2 Add one shared archive verifier and require both development download and runtime bundling to verify before extraction
- [x] 2.3 Route Windows CI and release packaging through the Engine-owned setup command and remove Chocolatey invocation
- [x] 2.4 Document the intentional FFmpeg artifact update procedure in the Engine package README

## 3. Validation

- [x] 3.1 Run focused Engine script tests, workflow assertions, OpenSpec validation, and diff checks
- [x] 3.2 Run applicable repository quality gates and record Windows-hosted packaging as verified or residual risk
