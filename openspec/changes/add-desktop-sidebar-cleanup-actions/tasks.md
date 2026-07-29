## 1. Contracts and red tests

- [ ] 1.1 Add renderer regression coverage proving recent Project and conversation rows expose distinct cleanup actions without triggering navigation.
- [ ] 1.2 Extend Shell/Home cleanup request contracts, parsers, preload bridge types, and IPC channels with revision and stable-identity validation.
- [ ] 1.3 Add Main-process red tests for persisted Project removal and authority-backed conversation deletion.

## 2. Canonical cleanup implementation

- [ ] 2.1 Implement atomic Shell Project catalog removal with cross-Window tab and active-target reconciliation.
- [ ] 2.2 Implement AppHost conversation deletion through the owning Desktop Agent workspace and authoritative Home projection.
- [ ] 2.3 Connect localized primary-sidebar icon actions, destructive confirmation, authoritative projection updates, and visible errors.

## 3. Verification

- [ ] 3.1 Run focused renderer, Shell, AppHost, preload/IPC, and Agent workspace tests.
- [ ] 3.2 Run Desktop typecheck and test suite, agent-boundary checks, `git diff --check`, and OpenSpec validation.
- [ ] 3.3 Record verification evidence and residual risks in the change artifacts.
