## 1. Stable DSH Session ownership

- [x] 1.1 Keep the exact owned Session record visible throughout model replacement.
- [x] 1.2 Make concurrent async Session operations wait for the published replacement and re-resolve the exact owner.
- [x] 1.3 Preserve fail-local replacement failure and sibling Session availability without fallback.

## 2. Verification

- [x] 2.1 Add bridge invariants and deterministic Q0 coverage for concurrent model application and permission/catalog reads.
- [x] 2.2 Run affected package tests, type checks, Q0 qualification and strict architecture/OpenSpec gates.
- [x] 2.3 Verify the reported Conversation through visible Electron and record Evaluation coverage, blocked cases and residual risk.
