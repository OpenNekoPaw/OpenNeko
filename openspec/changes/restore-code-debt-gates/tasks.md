## 1. Debt Gate Ownership

- [x] 1.1 Add scanner self-tests for Agent/non-Agent scope partitioning and explicit rejection diagnostics
- [x] 1.2 Make the repository quality gate block only non-Agent owned findings
- [x] 1.3 Classify explicit migration modules and presentation defaults without hiding successful dual reads

## 2. Ledger Synchronization

- [x] 2.1 Replace LCDR-018 substring matching with exact removed-surface patterns
- [x] 2.2 Mark pruned script and Puppet entries removed and update the retained Live contract entry
- [x] 2.3 Remove obsolete required coverage and add coverage for current high-volume migration boundaries

## 3. Dormant Cut Cleanup

- [x] 3.1 Delete the unreachable Cut Webview tool executor and stale documentation
- [x] 3.2 Delete unreachable subtitle components and Pen tool editor while retaining active subtitle parsing
- [x] 3.3 Delete duplicated unused Cut audio-effect definitions and use shared authoritative contracts
- [x] 3.4 Narrow Cut Knip ignores to retained active component trees and verified runtime entries

## 4. Verification

- [x] 4.1 Run scanner self-tests, legacy-debt checks, and Agent boundary checks
- [x] 4.2 Run Knip and focused Cut/shared tests and builds
- [x] 4.3 Run repository quality checks and record unrelated residual failures
- [x] 4.4 Split the OpenSpec, gate, and dormant-code changes into focused commits

## Verification Notes

- `node scripts/check-legacy-debt-surfaces.mjs --self-test`, `pnpm check:legacy-debt`, `pnpm check:legacy-debt:ledger`, and `pnpm check:agent-boundaries` pass.
- `pnpm --dir packages/neko-cut/packages/webview test` passes with 26 files and 489 tests. `pnpm ci:local:proto` and the `act` `proto-check` job pass.
- `pnpm check:unused` passes after the user-owned TUI mutation-port migration landed. `pnpm --dir packages/neko-types test` passes with 183 files and 1570 tests.
- `check:quality` passes all gates except the user-owned Agent Webview boundary finding for `packages/neko-agent/packages/webview/src/components/AppShell.tsx` importing an obsolete keyboard reporter; that path is outside this change.
- `pnpm format:check`, `pnpm lint` (0 errors, existing warnings), and the TypeScript/Webview build tasks pass locally. Native Rust build was stopped while waiting on an existing Cargo lock held by another user process; the committed host-api Clippy fix remains present.
