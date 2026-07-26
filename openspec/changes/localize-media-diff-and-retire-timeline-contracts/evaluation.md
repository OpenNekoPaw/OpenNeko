# Agent Evaluation Disposition

## Evaluation Scope

- Change/feature: retire the orphan Agent Timeline context projection and the unused generic operation-tool adapter binding while deleting shared Timeline/NKV contracts.
- Decision and owning suites:
  - `excluded` for `timeline-projection-authority` (`agent-runtime.stream-delivery`);
  - `excluded` for `capability-tool-routing` (`agent-runtime.perception-routing`).
- Why real Evaluation is not required: repository-wide production reference checks prove neither surface has a runtime producer or consumer. The change deletes unreachable exports and fallback inputs; it does not alter prompt composition, registered Tools, capability selection, provider/model routing, session execution or TUI event projection.
- Canonical path: active Agent messages continue through the generic `multimodalContextPacket` / Canvas-owned projection and registered capability bindings.
- Forbidden fallback: `timelineContextPacket`, `TimelineContextRuntime`, shared `ProjectData`/`TimelineElement`, and `operationToolAdapterRegistry`.

## Cases

- Timeline projection: excluded; source-absence checks, strict Agent typecheck and focused message/multimodal packet tests prove the deleted projection cannot be selected.
- Capability binding: excluded; strict binding-key tests and source-absence checks prove the unused adapter registry is not projected.
- Coverage delta: no provider-backed or TUI behavior case is added because there is no runtime target capable of reaching either deleted surface.
- Missing observability: none for these unreachable TypeScript contracts; a future Cut-to-Agent context feature requires a new owning contract and Evaluation decision.

## Verification

- Key-free selector validation passed: 5/5 tests.
- `pnpm test:agent:eval` passed in isolation: 40 files / 282 tests and 24 suites / 53 indexed dry-runs. An earlier run under concurrent build load timed out at the shared 5-second test limit; it was not counted as behavior evidence.
- Agent strict typecheck passed; focused message/multimodal packet tests passed 77/77.
- Shared contract tests passed 1,180/1,180 and source-boundary checks reject the deleted Timeline runtime, shared DTOs and operation adapter.
- Real provider-backed cases: not run; excluded by the deterministic, unreachable-surface disposition.

## Interpretation

The evidence may prove only that retired paths are absent and current Agent contracts still compile and pass deterministic tests. It must not be described as real Agent behavior acceptance.

## Residual Risk

- A future Agent Cut context producer could require real stream-delivery coverage; this cleanup intentionally does not invent that producer or preserve a speculative Timeline adapter.
