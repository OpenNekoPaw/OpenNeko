## Implementation evidence

### Canonical path

- `46b85f9d` atomically removed DSH/ACP/profile/subprocess/plugin production paths and restored the
  package-owned Agent contracts, application runtime, Pi adapter, typed Desktop bridge and existing
  `@neko/agent-webview` Root.
- Content, Generation, Canvas, Cut, Search, Automation, Character and World providers register through
  `CapabilityRegistryRuntime` and the single `ToolRegistry`. Exact Tool, provider and MCP server identity
  conflicts now fail before replacing an existing owner; short-name-only collisions remain diagnostics
  because execution uses the full Tool identity.
- Production search outside historical OpenSpec/docs/report data finds no DSH/ACP registration, import,
  profile, IPC or runtime resource.

### Agent Evaluation disposition

- Decision: `reuse` the indexed `agent-runtime.launch-binding`, `agent-runtime.skill-runtime`,
  `agent-runtime.model-binding`, `agent-runtime.workflow-controller`,
  `agent-runtime.external-automation`, `agent-runtime.creative-media-workflow` and
  `agent-runtime.stream-delivery` suites. The cutover restores their canonical runtime rather than adding
  a new behavior owner or Evaluation-only path.
- Positive evidence: exact Conversation-owned Desktop session, effective model binding, exact capability
  Tool call/provider facts, terminal Tool/Job state and typed Desktop projection.
- Failure evidence: stale or missing launch binding, disabled/unknown capability, denied Tool, duplicate
  exact registration, missing provider/model/target and forbidden alternate source/runtime do not return
  success. Existing registered sibling Tools and providers remain available.
- Key-free validation passed: 45 files / 310 tests and all-suite dry-run, 27 suites / 80 cases. This proves
  schema, fixture, runner and hard-gate readiness only.
- Visible real-provider/domain-Tool Evaluation was not run because the user explicitly deferred API
  validation. Mock, fixture-provider and final-text results are not counted as real Agent behavior.

### Deterministic verification

- Agent contracts: 43 files / 261 tests.
- Agent runtime: 107 files / 1006 tests after exact-registration hardening.
- Agent Webview: 107 files / 822 tests.
- Desktop: 108 files / 732 tests; focused producer-consumer checks: 3 files / 50 tests.
- Generation: 29 files / 163 tests; Canvas: 36 files / 295 tests; Cut: 6 files / 61 tests.
- Character: 44 files / 241 tests; World: 17 files / 65 tests; Automation: 12 files / 63 tests.
- Host: 38 files / 320 tests.
- Full workspace typecheck, dependency/package/application/Agent boundaries, OpenSpec, test orchestration
  and legacy-debt gates passed.
- `check:unused` was executed and still reports the existing baseline of 6 unused files and 149 unused
  exports; this change does not claim that repository debt is resolved.

### UI validation

- Authoritative runtime: isolated real Electron Desktop through `desktop-workbench-scenes`.
- Report:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-19T03-05-53.197Z-desktop-workbench-scenes-development/report.json`.
- Passed Agent inventory: one Sidebar and one Agent Root; Conversation/Creation mode selector; Character
  and World context actions; fixture model selector; approval control; large and small Entry composer fit;
  management-scene round trip; exact Project open; Workspace + Canvas context bar; narrow Workspace
  composer fit and attachment presentation.
- Directly reviewed screenshots:
  `screenshots/03-agent-only-large.png`, `screenshots/04-agent-only-small.png` and
  `screenshots/13-workspace-agent-context-large.png` under the report directory. Controls are visible and
  readable without overlap, clipping or text escape in the inspected states.
- The overall scenario remains `failed`, so UI validation is not globally passed. It proceeds through the
  Agent checkpoints and then stops at an adjacent stale Resource Browser chrome assertion: the canonical
  UI exposes one library management control while the old assertion expects zero. This unrelated assertion
  was left fail-visible instead of changing product UI or reporting a pass.

### Remaining risk

- DSH-era user records have not been exercised against the canonical catalog. Data preservation and
  record-local unsupported diagnostics remain unverified and task 5.1 stays open.
- Real provider/domain-Tool behavior, visible approval, terminal response and artifact delivery remain
  unverified while API validation is deferred; task 5.3 stays open.
- The full adjacent Character/Canvas UI inventory has not completed after the Resource Browser assertion;
  task 4.2 stays open even though the Agent Entry and Workspace Agent checkpoints passed.
