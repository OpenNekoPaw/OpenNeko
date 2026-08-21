# Verification

Date: 2026-08-10
Risk: L3 development packaging / Desktop Agent availability

## Runtime evidence

- Acquired the canonical checkout owner in process `49965`.
- Invoked the real package command `pnpm --filter @neko/app-desktop dev -- --openneko-functional-fixture`.
- The second launch exited `1` with `Desktop development process 49965 already owns the Vite bundle for this checkout` before Electron Forge output appeared.
- `apps/neko-desktop/.vite/build/main.cjs` retained SHA-256 `f5bd1db7a387b236f48e041245c711ec8e82696909db05bda1dd14bbe10bcf9a`.
- All six existing `openai-completions-*.cjs` paths and hashes were byte-identical before and after the rejected launch.
- After owner release, a new process reacquired and token-released the same checkout ownership successfully.

### Follow-up after repeated visible failure

- Process inspection found a surviving pre-change chain at PIDs `10339 -> 10346 -> 10375` with the direct `electron-forge start` command, plus Electron PID `53516`. It did not run `run-development.mjs` and therefore could not own the new lock.
- The screenshot referenced `index-CDE8fQUH.cjs -> openai-completions-C1LlqeQr.cjs`; neither file remained in the current `.vite` output, proving that process was still using a replaced graph.
- Terminated only that exact legacy Forge chain and its orphaned Electron child, then started the canonical package command. The new process chain includes owner launcher PID `59617` before Forge.
- The active Main graph references `openai-completions-BIjaYkGQ.cjs`, and that exact file exists.
- A second real canonical launch exited `1` with the live-owner diagnostic before Forge. `main.cjs` and the referenced provider chunk hashes were unchanged.

## Commands

- `node --test scripts/test-orchestration/desktop-development-bundle-owner.test.mjs`: 6/6 passed.
- `pnpm check:test-orchestration`: 100/100 passed after updating the native Desktop entry contract to recognize the guarded development launcher.
- `pnpm --dir apps/neko-desktop exec vitest run src/main/desktop-development-main-restart.test.ts`: 3/3 passed.
- `pnpm --dir apps/neko-desktop typecheck`: passed.
- `pnpm check:package-boundaries`: passed, 43 packages and 1485 reachable modules checked.
- `pnpm check:application-boundaries`: passed, 1553 files checked.
- `pnpm check:openspec`: 70/70 specs/changes passed strict validation.
- `pnpm test:agent:eval`: 44 files / 294 tests and 24 suites / 64 cases passed key-free validation.
- `pnpm check:legacy-debt`: passed with zero blocking findings.
- `pnpm check:unused`: passed with no unused exports; 82 existing non-blocking configuration hints remain.
- Focused Prettier and ESLint checks: passed.

## Quality review

No blocking or suggestion-level finding remains in the scoped diff.

- Responsibility stays in Node development/test orchestration; no Agent or Desktop business contract changed.
- The guarded package command is the only repository-supported development success path; the direct package-script Forge path was removed.
- Live conflicts and malformed state fail visibly. There is no provider, chunk or adapter fallback.
- Owner state uses atomic exclusive creation, restrictive permissions, process liveness and timing-safe token-fenced release.
- User projects, configuration, credentials, conversations and generated artifacts are untouched.

## Residual risk

- The first migration requires fully stopping the pre-change Forge parent and Electron child; `rs` or window reload does not switch the parent command to the guarded launcher.
- Direct manual invocation of the third-party Forge CLI remains outside repository command governance.
- Real-provider visible acceptance is blocked by missing explicit authorization and is not claimed as passed.

## Package writer follow-up

Date: 2026-08-22

- The live Electron process started at `02:41:18`, while the checkout `.vite/build` graph was overwritten at `02:42:47`. That ordering explains why eager Main code continued running but later EPUB/provider lazy imports became unresolvable until Main restarted.
- Canonical `build`, `package`, and `make` scripts now acquire the same checkout owner as development before Electron Forge can write `.vite`.
- A real package attempt while the development owner was live failed before Forge with the owner diagnostic. The focused owner suite passed 9/9, including uncontended package lifetime and development-versus-package exclusion.
- Content (148 tests), Agent Runtime (370 tests), focused Desktop DSH tests (35 tests), Content/Agent/Desktop typechecks, package/application boundary checks, strict affected OpenSpec validation, key-free Agent Evaluation (45 files / 314 tests; 26 suites / 69 cases), formatting, ESLint, and `git diff --check` passed.
- Because the active development owner correctly blocked a full package run, production Main was built into an isolated temporary output directory instead; 780 modules compiled successfully without touching the live `.vite` graph.
- The already-corrupted pre-guard process required one Main restart. Subsequent canonical runs are protected from the same repository-command race; direct third-party Forge CLI invocation remains outside repository governance.
