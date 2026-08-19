# W7 Evaluation Cutover Readiness

## Scope

This slice updates Evaluation change selection to recognize the DSH-owned production path. It does not claim that the Desktop Evaluation controller or existing behavior suites have migrated from Pi identities and facts.

## Updated Selection Path

The selector now maps the following canonical owners:

- `packages/dsh-bridge`
- package-owned ACP application client and projection
- Conversation-to-DSH-Session binding/application clients
- Desktop DSH runtime bootstrap, Session host and Permission host
- DSH Session/Permission preload contracts
- native `DesktopAgentSurface`

Deleted Desktop Agent composition, bridge and event-cursor files are no longer used as current coverage fixtures. The Agent architecture gate now also fails if the retired Desktop bridge/contracts reappear.

## Deterministic Evidence

```text
pnpm check:agent-boundaries
PASS: 417 files, no findings

pnpm exec vitest run scripts/agent-eval/authoring/change-selector.test.mjs
PASS: 1 file / 8 tests

pnpm test:agent:eval
PASS: 45 files / 313 tests
PASS: 27 suites / 80 cases key-free dry-run
```

## Blocking Gap

The production runner no longer imports or defaults to the retired Pi scenario/driver. With complete provider/model/cost authorization it returns `infrastructure-blocked` before Desktop launch unless a scenario factory is explicitly injected by platform unit tests. The unreachable legacy driver source, workflow evidence and multiple suites still consume or assert `window.openNekoDesktop.agent`, `agentLaunch`, queue operations, `confirmTool`, Pi Session facts and generic `runId`/`branchId` identities. A passing key-free dry-run proves schema and discovery consistency only; it does not prove that a case can execute through DSH.

W7 requires one atomic Evaluation contract cutover across driver, workflow, scenario assembly, evidence assertions, reports and affected cases. Unsupported Draft publication, queue, compact and lifecycle operations must become explicit infrastructure blockers until their DSH public product paths exist. They must not be translated onto DSH Session calls or retained through compatibility bridges.

Real provider/API and visible Desktop execution remain skipped by user direction and continue to block release acceptance.
