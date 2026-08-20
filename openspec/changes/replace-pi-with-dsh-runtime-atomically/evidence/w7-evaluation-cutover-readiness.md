# W7 Evaluation Cutover Readiness

## Scope

This evidence tracks the incremental Evaluation cutover to the DSH-owned production path. It does
not claim that every existing behavior suite can already execute through the public DSH Desktop
driver.

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
PASS: 217 files, no findings

pnpm exec vitest run scripts/agent-eval/authoring/change-selector.test.mjs
PASS: 1 file / 8 tests

pnpm test:agent:eval
PASS: 45 files / 314 tests
PASS: 26 suites / 65 cases key-free dry-run
```

## Blocking Gap

The production runner no longer imports or defaults to the retired Pi scenario/driver. The strict
Scenario schema, supported assertion inventory, Desktop evidence adapter and neutral hard-gate
runner also no longer accept the retired `pi-runtime` assertion; see
`evidence/w7-pi-runtime-assertion-poison.md`. Timeline assertions now consume only exact DSH
Session/turn/end-reason/toolCall evidence at the Desktop boundary; the neutral Pi Timeline success
path has been deleted. Tool and Automation assertions now consume only canonical DSH `tool` events,
and the retired Pi/neutral Tool evaluators cannot return success. Process-order now observes
incremental DSH Session `message`/`tool` events and the neutral/old projection path is deleted. The
Desktop canonical-facts gate and `model-sequence` now accept only exact Conversation/DSH Session/
numeric-turn identities; the Pi runtime branch and Agent `turnId`/`runId` facts are poison-only.
Visible approval receipts also retain exact DSH permission identity. Reports mark unavailable DSH
configuration digest and token/cost usage as missing rather than inventing values. Remaining legacy
OpenNeko queue/send-now DSL, assertions, evaluators, messageQueue fixtures and Pi queue scenarios
have been deleted; active-session DSH inbox is explicitly excluded until a public Desktop product
operation exists and the rc.7 release-preservation blocker is resolved. Configuration updates now
resolve one advertised provider/model from the exact visible Conversation surface, require an idle
DSH Session, call the public `selectComposerModel` product operation and prove no DSH Turn was
created. The running-Turn future-configuration branch is rejected by the strict schema. The
unreachable OpenNeko `resource-display-projection` assertion/evaluators, synthetic
`resourceDisplayProjections` facts and Agent Webview media-card probe are also deleted. DSH Tool
results remain covered by exact Tool event `rawOutput`, content-locator and artifact evidence;
visible rendering remains a UI acceptance concern rather than a second Evaluation fact. Pi-era
Draft binding replacement, pre-Session Draft input, synthetic rejection facts and their four
dependent cases have been deleted rather than translated onto DSH Session calls. Ordinary first
submit remains canonical through the visible Composer. The dead `AgentDraftSubmitInput/Projection`
contract is also deleted while still-used input intent/reference receipt types move to the canonical
`agent-input-intent.ts` owner. Lifecycle checks now have matching
hard-gate assertions, but their real Desktop + Provider matrix remains unexecuted. A passing
key-free dry-run proves schema and discovery consistency only; it does not prove that every case can
execute through DSH.

Renderer reload and application restart recovery now reconnect on the new owner, require the visible
DSH Surface to retain the exact requested Conversation, and only then read its public Session
snapshot. A changed Surface Conversation fails instead of restoring through an active/recent
fallback. Every active scenario declaring `execution.lifecycleChecks` now requires one matching
`desktop-lifecycle` hard gate; reload, focus and graceful-close facts are retained in the Evaluation
report boundary instead of being unasserted setup actions. Real Desktop + Provider lifecycle
execution remains required for release evidence.

W7 requires one atomic Evaluation contract cutover across driver, workflow, scenario assembly, evidence assertions, reports and affected cases. Retired Draft operations must remain rejected by the strict schema and cannot return through compatibility bridges. Lifecycle operations use the canonical DSH path and exact hard-gated facts.

Real provider/API and visible Desktop execution were not rerun for this deterministic contract
slice. `~/.neko/config.toml` is readable, but no explicit provider/model/cost authorization was
present and this checkout already has an active Electron/Vite development owner. No API request was
started. The unexecuted real lifecycle and broader provider-backed matrices continue to block
complete release acceptance.
