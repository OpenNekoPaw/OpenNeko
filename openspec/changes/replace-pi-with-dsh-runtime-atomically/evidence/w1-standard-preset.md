# W1 DSH Standard Preset Evidence

Date: 2026-08-19

## Scope

- Use the shipped DSH `standard` preset as the sole general Agent capability composition.
- Keep the OpenNeko ACP bridge as a protocol adapter and official domain Tool carrier.
- Do not restore Pi, OpenNeko Skill/MCP/Plugin runtimes or duplicate DSH tools.

## Implementation

- `@neko/dsh-bridge` mounts the public `@deepseek-ai/dsh-agent-presets` roster with `default: standard`.
- Every ACP create/load/resume and model-change rebuild mounts the exact Agent through public `agentPresets.mount()` before publication.
- The bridge profile disables the same `dsh-base` process-global agent-plane rows that the official DSH Web profile disables. File/Shell/search/Skill/plan/goal/subagent/workflow tools therefore have one preset-owned registration path.
- Generation, Canvas and Cut remain official OpenNeko DSH bundle contributions to the canonical layered Tool registry.

## Verification

- `pnpm --filter @neko/dsh-bridge typecheck`: passed.
- `pnpm --filter @neko/dsh-bridge test -- --runInBand`: 2 files / 18 tests passed.
- The repository-owned development runtime builder rebuilt and qualified the darwin-arm64 closure from locked inputs.
- A temporary `userData` profile created through the real Desktop materializer completed ACP initialize, `session/new`, the canonical permission-preset extension read and `session/close` against the bundled runtime. The session advertised `read-only`, `workspace-write` and `danger-full-access`; preset mount produced no duplicate Tool registration failure.

## Agent Evaluation Decision

- Changed runtime path selection maps to `session-workflows`; decision: `update` the existing `agent-runtime.workflow-controller` suite rather than create a second runtime suite.
- User behavior: submit through the visible Desktop composer and exercise standard file/Shell/search/Skill/plan/goal/subagent/workflow capabilities on the exact Conversation.
- Canonical path: visible Desktop controls → sender-bound Agent Surface → package-owned ACP client → OpenNeko bridge → exact DSH Session → shipped `standard` preset.
- Required evidence: effective preset identity, exact DSH Tool calls and terminal states, permission decisions, cancellation/recovery facts, and absence of Pi, global duplicate Tools or OpenNeko fallback implementations.
- Expected failure: a missing preset/Host dependency, denied permission or unsupported projection remains local and visible instead of returning success.
- Real provider execution is intentionally not run in this step. The owning suite still contains Pi-era runtime assertions and the current Desktop fact contract does not expose a neutral effective-preset/tool-catalog fact, so claiming it as DSH standard behavior evidence would be invalid. Key-free harness validation remains infrastructure evidence only.

## Remaining Risk

This evidence proves profile composition and Session-time preset mount, not complete behavioral acceptance of every standard capability. Real provider calls remain skipped by current instruction. Web search still requires a configured provider credential; Shell/filesystem mutation requires sandbox and approval coverage; plan, goal, subagent and workflow events still require full ACP projection, cancellation/recovery and visible Electron verification. These gaps remain release blockers under tasks 4.13, 7.7 and the real-API gate.
