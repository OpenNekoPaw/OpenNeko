# Agent Evaluation

Date: 2026-07-31

## Evaluation Scope

- Change/feature: Desktop Agent cold-start catalog projection, first-mount Host subscription
  ordering, pending user-message visibility and conversation-scoped send failure projection.
- Decision and owning suite: `reuse` the indexed `agent-runtime.workflow-controller` ownership for
  Desktop session/event behavior. No suite content is changed because the current runner cannot
  drive Electron Desktop composition or renderer projection.
- Why real Evaluation is required: the pending-send and Host event changes affect the user-visible
  Desktop Agent session projection. Catalog scoping, Popover styling and Workbench display-mode
  validation are deterministic non-model behavior.
- Canonical path and forbidden fallback: Desktop Shell Project catalog → read-only Pi catalog reader
  → Agent Home projection; Desktop Agent input → typed preload → Main controller/Pi runtime →
  authoritative Timeline → Agent Root. Forbidden paths are attach-all-workspaces startup, transcript
  hydration for Home listing, execution lease acquisition, active-conversation fallback, duplicate
  send, global-only send error, VS Code, mock or legacy Agent runtime.

## Cases

- Reused, updated, created or excluded: `reuse`
  `agent-runtime.workflow-controller`; no new case is authored until the Desktop complete-session
  driver can expose the required Desktop event facts.
- Evidence and coverage:
  - deterministic Pi/runtime tests prove exact workspace filtering, read-only catalog access,
    no lease acquisition, lifecycle disposal and fail-visible catalog errors;
  - deterministic Desktop tests prove Shell scopes Home before the first snapshot, Agent module and
    bootstrap start concurrently, rejected sends become conversation errors, and empty Main accepts
    `chat-main` but rejects `main-only`;
  - deterministic Agent Webview tests prove subscription precedes synchronous initialization
    response and one stable optimistic user message is visible before configuration and sent once
    after configuration;
  - shared UI/Desktop CSS tests prove the Popover semantic surface and Desktop theme tokens exist.
- Missing observability: the Evaluation runtime cannot yet launch a complete Desktop session,
  submit through its public Agent input, or observe renderer message reconciliation and terminal
  state as bounded facts.

## Verification

- Key-free validation: `pnpm test:agent:eval` passed with 35 test files, 234 tests, 22 indexed
  suites and 50 dry-run cases; this is harness/schema/index/dry-run evidence only.
- Real cases and reports: the focused `agent-runtime.workflow-controller` run is recorded at
  `reports/agent-eval/fix-desktop-agent-shell-regressions/local-run-summary.json` with outcome
  `infrastructure-blocked`; no behavior report or provider-backed assertion is claimed.
- Electron evidence: `pnpm package:desktop` and the full `pnpm build` passed. The production packaged
  app was launched against an isolated functional fixture and user-data directory. Opening the
  fixture Project immediately mounted `neko/boards/workspace.nkc` without
  `desktop-canvas-not-mounted`; the default mode was `Chat + Main`, both left and right Chat layouts
  rendered, and the Assets entry opened/focused exactly one independent Resource Browser Main tab
  while Agent remained the only Dock owner.
- Production Popover evidence: the rendered Radix portal surface had computed
  `opacity: 1`, `background-color: rgb(255, 255, 255)`, `color: rgb(32, 32, 31)`,
  `border-color: rgba(0, 0, 0, 0.13)`, `z-index: 50`, and `backdrop-filter: none`; visual
  inspection confirmed that underlying content did not show through.
- Agent surface evidence: the package Agent Root mounted in the isolated fixture without the
  previous loading stall. The fixture had no configured model, so the input reported no available
  model and a real send/reconciliation path could not be exercised.
- Blocked or unexecuted cases: `agent-runtime.workflow-controller` real execution remains
  `infrastructure-blocked` because no local Agent provider credential environment variable is
  available. Provider-backed send, Tool approval and checkpoint/cleanup are therefore not claimed
  as accepted.

## Interpretation

- Deterministic producer/consumer tests cover the five reported regressions at their owning
  boundaries and poison the relevant wrong paths. Production Electron evidence additionally covers
  default Canvas mounting, Resource Browser Main ownership, Chat/Main layout modes and Popover
  opacity.
- Key-free Evaluation success cannot establish real model, Tool, checkpoint or renderer behavior.

## Residual Risk

- A provider-configured packaged Electron fixture must still verify optimistic send reconciliation,
  authoritative user-message replacement and rejected-send terminal UI through the public Agent
  input.
- Provider-backed Agent execution, Tool approval and checkpoint/cleanup remain unverified until
  credentials or a Desktop complete-session driver with explicit cost authorization are available.
