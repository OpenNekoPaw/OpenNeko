# D0 Replacement Inventory

## Release Isolation

- Desktop `build`, `package`, and `make` fail closed through `scripts/assert-dsh-cutover-release-ready.mjs`.
- This integration-only state is not a release candidate.

## Protected Data Baseline

- No repository Pi JSONL, SQLite/database, or `.neko/` byte-preservation fixture was present when D0 began.
- D0 does not inspect or mutate user directories.
- Task 0.1 and task 0.7 remain incomplete until the owning data-protection work adds canonical fixtures and records before/after hashes.

## Replacement Failures

The initial package and Desktop typecheck failures after retired-code deletion are the authoritative input for this section. Each failure must be assigned to the future ACP application adapter, DSH bridge, Desktop subprocess adapter, DSH-owned extension management, or owning domain Tool contract. No stub, no-op, compatibility adapter, or retired-code restoration may close an item.

### ACP application adapter and Conversation binding

- `apps/neko-desktop/src/main/index.ts`, `app-host.ts`, `desktop-agent-bridge-runtime.ts`, and `desktop-agent-controller-composition.test.ts` still consume the removed `AgentAppHost`, controller composition, Conversation runtime, queue, transcript projector, and configuration projection. The explicit Pi catalog reader has been deleted; these remaining unresolved application symbols must be replaced by the ACP application adapter rather than restored.
- Replacement owner: W1 package-owned ACP application adapter plus W4 Desktop consumer cutover.

### Desktop subprocess, credentials, and provider boundary

- The removed Pi credential runtime and macOS Pi auth prompt no longer have production consumers. `@neko/host/settings` now owns the provider credential authority; Desktop supplies a new isolated `provider-credentials.json` `safeStorage` adapter and Direct Generation consumes its reader.
- The retired `agent-credentials.json` and `openneko.agent.pi.credential:*` keys are not read, migrated, rewritten or deleted. DSH reverse credential requests and protocol non-leak evidence remain W1 replacement work.

### DSH-owned Skill, MCP, and Plugin management

- Desktop Main no longer consumes the removed OpenNeko Extension Manager, Personal Skill Manager, or Pi Skill package creation service. Preload/renderer extension management surfaces remain unresolved W3/W4 consumers.
- The Desktop MCP client factories, Automation Plugin Tool adapter, provider inspector, and their direct lifecycle wiring have been deleted.
- The Automation Node MCP provider wrapper, session-owned MCP runtime, CUA MCP target discovery, MCP argument injection, and MCP result projection have also been deleted. Automation profiles, permissions, grants, target selection, and local artifact management remain domain-owned and transport-neutral.
- Replacement owner: W3 DSH extension inventory/readiness/configuration/diagnostics projection and exact management commands.

### Domain Tool bridge

- Desktop no longer registers the retired Character/World capability providers through the old Agent composition. Agent launch, text-editor tests, and remaining Automation consumers still reference removed Tool registry, Pi Tool protocol, or Plugin Tool adapter surfaces.
- Replacement owner: W2 Generation and Canvas typed DSH-to-Host requests, followed by W6 remaining domain Tools. Direct native UI operations remain owned by their domain application services.

### Agent Evaluation

- `scripts/agent-eval/suites/coverage-index.test.mjs` no longer imports the removed Pi Skill Host or Pi execution environment, but canonical facts/assertions/cases still describe Pi execution paths.
- Replacement owner: W7 must migrate those paths to ACP/DSH and derive official Skill identity/fingerprint evidence from the DSH-owned profile without adding a direct runtime runner.

## Current Deterministic Results

- `pnpm --dir packages/agent/runtime run typecheck`: passes after retired implementation/barrel removal.
- `pnpm --dir packages/agent/contracts run test`: 44 files and 263 tests pass, including the frozen DSH ACP extension contract.
- `pnpm --dir packages/agent/runtime run test`: 52 files and 433 tests pass, including the package-owned ACP application client and poison assertions proving retired MCP/Tool runtime exports remain absent.
- `pnpm --dir apps/neko-desktop exec vitest run src/main/desktop-dsh-subprocess-supervisor.test.ts`: 3 tests pass for exact subprocess byte transport, duplicate-start rejection and fail-visible crash propagation.
- `pnpm --dir apps/neko-desktop run typecheck`: fails visibly at the replacement consumers listed above.
- `pnpm --dir apps/neko-desktop run package`: fails before Electron Forge through the integration-only release guard.
- `pnpm check:package-boundaries`: passes after deleting the final Desktop Pi credential/catalog/Skill consumers.
- Production dependency and public-entry scans find no `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@neko/agent-runtime/pi`, `@neko/agent-runtime/extensions`, `@neko/agent-runtime/tool-registry`, or `@neko/agent-runtime/tools` implementation/export/consumer. Test and Evaluation fixtures are not yet the complete W8 deletion proof.

## W1 Replacement Progress

- Added the single package-owned host-neutral ACP application client under `@neko/agent-runtime/acp`; it uses the official ACP SDK, rejects unadvertised recovery methods before dispatch and accepts only the frozen OpenNeko Host extension methods.
- Added the Desktop-only DSH subprocess supervisor. Its injected boundary is an async byte transport, not ACP SDK or Agent policy; it owns one process, stdio, stderr observation, bounded stop and unexpected-exit diagnostics.
- Added the package-owned ACP Session catalog adapter and Conversation composition. It resolves bindings only after a complete bounded `session/list` scan, rejects duplicate Session identities and invalid pagination, and revalidates the exact binding before each Conversation-scoped operation.
- Added `@neko/dsh-bridge` as the sole ACP stdio plugin for the OpenNeko profile. It uses only public DSH package entrypoints and maps DSH Agent/Session/Persistence ownership to standard ACP create/list/load/resume/close, history replay, prompt/cancel and initial Tool event projection without implementing another loop, store or registry.
- Added bridge poison tests that scan the production source, package manifest and Cordis profile. They reject DSH private `lib/*` or `src/*` imports, an upstream `@deepseek-ai/dsh-acp` dependency/profile entry, multiple ACP plugin entries, and declarations of a second Agent loop, Session store, queue, Tool registry, Skill Host, MCP manager or Plugin runtime.
- Deterministic Q0 now passes create/close, two process restarts, list, resume without replay, load with history/event replay, Tool call/result live/replay projection and active-session inbox read/replace/remove without contacting a provider. Remaining permission/cancel, inbox preservation, reverse Tool, extension, backpressure and injected-crash work stays visible in tasks 1.6–1.10 and W1.
- These surfaces are not wired into Desktop `index.ts` or the old Desktop Agent bridge yet. The corresponding replacement failures intentionally remain visible until the rest of the frozen contract is implemented.
- Packaged executable resolution is also still open: Electron `RunAsNode` remains security-disabled and the current repository has no standalone Node executable/DSH dependency closure suitable for `extraResource`. Development `process.execPath`, system `node`, and globally installed `dsh` are not accepted product paths.

Focused deletion-proof command:

```bash
pnpm --dir packages/dsh-bridge run typecheck
pnpm --dir packages/dsh-bridge run test
```

Result: 1 test file and 6 tests pass. This closes only task 4.9; it does not qualify Desktop wiring, permission/cancel, inbox preservation, reverse Host Tools, extension management, concurrency/backpressure or crash recovery.
