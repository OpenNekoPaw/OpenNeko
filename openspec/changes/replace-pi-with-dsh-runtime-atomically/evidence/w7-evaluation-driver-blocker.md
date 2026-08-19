# W7 Evaluation Driver Blocker

## Current Finding

The production Agent path has cut over to the DSH subprocess and package-owned ACP application client,
but `scripts/agent-eval` still contains an executable Pi-era Desktop driver. It expects the deleted
`window.openNekoDesktop.agent`, `window.openNekoDesktop.agentLaunch`, `confirmTool`, OpenNeko message queue,
Pi Session, `branchId` and Agent `runId` facts.

The default production `runCase` assembly is now disconnected from that driver. After provider/model/cost
authorization and before Desktop launch, it returns `infrastructure-blocked` unless a scenario factory is
explicitly injected by platform unit tests. This prevents the retired path from producing real Evaluation
success while preserving key-free runner composition tests. Injected scenarios are not Agent behavior
evidence.

Those names cannot be translated or aliased to the new bridge. The current product exposes sender-bound
DSH Session and Permission bridges, but driving them directly from Evaluation would bypass the visible
composer, Conversation navigation and approval controls. That would be a test-only direct runtime shortcut,
not the complete Desktop user path required by the Agent Evaluation boundary.

## Required Next Implementation

W7 remains blocked until one canonical driver can:

1. start the complete Desktop-owned DSH Session runtime;
2. submit through the real user-operable composer and Conversation selection;
3. exercise visible approval controls for permission cases;
4. observe package-owned DSH Session/turn/Tool-call projections without reading DSH storage;
5. restore the exact Conversation-to-DSH-Session binding after renderer and application reopen;
6. fail `infrastructure-blocked` when any required public control or fact is unavailable.

After that driver exists, the Evaluation owner must atomically replace the old workflow operations,
facts, hard gates, scenarios and fixtures, then delete the Pi driver. Evaluation report/sample `runId`
remains an external test-run identity; only Pi Agent runtime `runId`/`branchId` facts are retired.

## Forbidden Shortcut

- Do not call `window.openNekoDesktop.dshSessions` directly as the Evaluation input driver.
- Do not restore the deleted Agent launch/automation bridge or `confirmTool` contract.
- Do not translate DSH Session/turn/Tool-call identities into Pi `runId`/`branchId` shapes.
- Do not count key-free schema tests, injected mock drivers or direct ACP calls as Agent behavior evidence.

Real provider/API and visible Electron evidence remains unexecuted by user direction and continues to block
release acceptance.
