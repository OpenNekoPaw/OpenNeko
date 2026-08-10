# Agent Evaluation

Date: 2026-08-10

## Evaluation Scope

- Change/feature: prevent a concurrent Desktop development/functional launch from replacing hashed Main chunks underneath an active Agent provider session.
- Decision and owning suite: `reuse` `agent-runtime.stream-delivery` as adjacent regression coverage; development bundle ownership itself is excluded from model judgment and owned by deterministic orchestration/runtime checks.
- Why real Evaluation is or is not required: the change does not alter prompts, model binding, provider routing, Tool behavior or AgentSession state. A real provider can reveal a missing chunk, but cannot prove exclusive pre-Forge ownership or unchanged bundle bytes.
- Canonical path and forbidden fallback: root/functional development command -> guarded `@neko/app-desktop dev` -> one owner -> Electron Forge. Forbidden paths are concurrent direct Forge success, provider retry, alternate adapter selection, retained old-chunk fallback and error suppression.

## Cases

- Reused: `agent-runtime.stream-delivery` key-free suite validation.
- Created deterministic coverage: separate-checkout identity, live conflict, stale recovery, malformed record, restrictive permissions, token-fenced release, argument/exit propagation and package/functional delegation.
- Runtime evidence: one owner process held the checkout while a second real `pnpm --filter @neko/app-desktop dev -- --openneko-functional-fixture` invocation failed before Forge. The active `main.cjs` and six `openai-completions-*.cjs` hashes were identical before and after rejection. Ownership was reacquired and released after the first owner exited.
- Follow-up runtime evidence: the repeated visible failure came from a still-running pre-change process chain whose command was `node ../../scripts/assert-supported-desktop-host.mjs && electron-forge start`. The screenshot's `index-CDE8fQUH.cjs -> openai-completions-C1LlqeQr.cjs` graph had already been replaced on disk, while this process had never acquired the new owner. After terminating that exact legacy Forge chain and its orphaned Electron child, the canonical command started through `run-development.mjs` with owner PID `59617`; its active `index-sLBcpY0B.cjs -> openai-completions-BIjaYkGQ.cjs` reference exists on disk. A second real canonical launch failed before Forge and left the bundle hashes unchanged.
- Missing observability: no Agent runtime fact is needed; ownership is established before Desktop Main exists.

## Verification

- Key-free validation: 44 files / 294 tests passed; all 24 indexed suites / 64 cases dry-ran successfully.
- Real cases and reports: no provider-backed case was run. The user-provided visible failure is the pre-fix symptom, not post-fix acceptance evidence.
- Blocked or unexecuted cases: `~/.neko/config.toml` is readable, but provider, model and cost authorization environment values are unset. A visible real-provider rerun is infrastructure-blocked and is not replaced by key-free evidence.

## Interpretation

- Confirmed root cause: both reported processes referenced Main/provider graphs that had been replaced on disk. The follow-up process inspection proved that the surviving application was still owned by the removed direct `electron-forge start` package script, so an additional launch could still replace its shared `.vite` output. The evidence does not establish a single guarded Vite watcher corrupting its own graph.
- Confirmed fix behavior: concurrent canonical development launch now fails before Forge and preserves the active bundle bytes.
- No provider/model attribution: the provider adapter was unavailable because its code chunk had been removed; this is not evidence of an OpenAI-compatible provider failure.

## Residual Risk

- A pre-change direct Forge process must be fully terminated before the first guarded launch. Reloading the window or using Forge's `rs` command is insufficient because the parent process remains outside ownership.
- A manually invoked third-party `electron-forge start` command can bypass repository tooling; canonical root, package and functional commands are guarded.
- Post-fix visible provider behavior remains unexecuted until explicit provider/model/cost authorization is supplied.
