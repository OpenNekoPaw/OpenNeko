## Verification

- `pnpm test` in `packages/agent/runtime`: passed, 54 files / 394 tests.
- `pnpm typecheck` in `packages/agent/runtime`: passed.
- focused Desktop Session Host + byte-port tests: passed, 2 files / 30 tests.
- `pnpm test` in `apps/neko-desktop`: passed, 102 files / 616 tests.
- `pnpm typecheck` in `apps/neko-desktop`: passed.
- `pnpm check:agent-boundaries`: passed.
- `pnpm check:application-boundaries`: passed.
- `pnpm check:package-boundaries`: passed.
- `pnpm test:agent:eval`: passed, 45 files / 314 tests plus 26-suite / 69-case dry-run.
- `rg` for the deleted all-in-one Desktop admission module and symbols: no matches.

Canonical path: `@neko/agent-runtime/application` owns admission policy, while
`desktop-dsh-prompt-reference-byte-port.ts` owns exact Desktop authorization and Content reads.

Residual risk: the key-free harness validates Evaluation infrastructure only. A visible real-API
image submit case remains infrastructure-blocked because the current Scenario submit contract cannot
provide image attachments or assert their path evidence. No Evaluation-only product path was added.
