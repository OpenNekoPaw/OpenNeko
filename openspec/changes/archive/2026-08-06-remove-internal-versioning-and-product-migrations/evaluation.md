## Evaluation Scope

- Change: `remove-internal-versioning-and-product-migrations`, Agent tasks 5.1-5.5.
- Decision: update and reuse `agent-runtime.workflow-controller`; retain
  `agent-runtime.stream-delivery` as the projection owner suite.
- Canonical path: visible composer or hidden Desktop public Agent input -> sender-bound Desktop
  controller -> Pi Conversation runtime -> Pi Session and SQLite catalog -> Conversation projection
  store -> terminal Webview projection.
- Forbidden fallback: direct runtime execution, a second session owner, mock provider, retired Host
  session owner, legacy Agent event projector, in-memory-only restore, projection version dispatch,
  and renderer epoch routing.

## Cases And Evidence

- `conversation-persistence-resume` now restarts the complete Desktop application/session owner
  between turns, reconnects by exact Workbench/Agent Surface ownership, restores the same
  Conversation from Pi Session and SQLite, and continues through the public Agent input path.
- `tool-approval-visible` now creates its Conversation through the visible Entry Draft composer,
  approves the exact projected Write Tool through the visible confirmation control, reloads the
  renderer with a replacement `connectionId`, restores the Conversation, verifies composer focus,
  and closes Desktop gracefully.
- Evaluation terminal evidence uses exact `conversationId + turnId + runId + terminalState`.
  Removed projection versions and renderer/view epochs are not accepted as validity or routing
  evidence.
- The hidden and visible cases both pass strict focused dry-run selection. The full key-free gate
  passes 44 test files / 286 tests and validates 22 suites / 53 cases. This is Evaluation platform
  readiness only, not real Agent behavior acceptance.

## Deterministic Recovery Exclusion

- The Agent Home catalog owner-containment fix is `excluded` from provider-backed Evaluation. It
  only validates persisted Conversation owner semantics before Home projection and cannot change
  Prompt composition, provider/model selection, Tool routing, turn execution, or response quality.
- Canonical path evidence covers `agent_conversation_authority` -> Pi catalog reader -> Agent Home
  owner projection -> Host Shell snapshot. A Workspace context whose runtime scope is the known
  Assistant Space is omitted with an identity-bearing `invalid-conversation-record` diagnostic;
  valid Assistant and Workspace siblings remain projected.
- Deterministic coverage proves the retired `agent_conversation_context` table reader is absent
  from product imports and registrations. Existing rows remain unchanged and cannot be read as a
  fallback or used to repair the canonical authority record.
- Focused Agent Runtime tests passed 2 files / 29 tests, Host producer/consumer tests passed 37
  files / 332 tests, Desktop Main composition passed 1 file / 31 tests, and an isolated SQLite copy
  of the reported local database confirmed the affected Conversation was diagnostic-only. The
  production Desktop package also built and passed package-output validation.

## Real Execution

- Hidden attempt: `agent-runtime.workflow-controller/conversation-persistence-resume`.
  Outcome: `infrastructure-blocked`; report:
  `reports/agent-eval/remove-internal-versioning-hidden/local-run-summary.json`.
- Visible attempt: `agent-runtime.workflow-controller/tool-approval-visible` with
  `visible-desktop` evidence. Outcome: `infrastructure-blocked`; report:
  `reports/agent-eval/remove-internal-versioning-visible/local-run-summary.json`.
- `~/.neko/config.toml` was readable. The process did not have explicit provider identity, model
  identity, and cost authorization, so both attempts stopped before Electron launch and before any
  API request. No configuration contents or credentials were read into this artifact.

## Foundational Matrix

| Behavior                                            | Current evidence                                                                                               | Real-API status                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Basic and multi-turn conversation                   | Producer/Webview/session unit and integration coverage passed in task 5.4                                      | Blocked before launch by missing explicit provider/model/cost authorization |
| Compaction and continuation                         | Canonical compaction code was not changed in this Agent slice                                                  | Real continuation remains unexecuted and is residual risk                   |
| Owner/application reopen and transcript restoration | Restart-capable hidden case and deterministic AppHost/Pi Session restoration coverage                          | Hidden complete-session case blocked before launch                          |
| Restored generation Tool/Job/artifact records       | Generation contracts are outside tasks 5.1-5.5 and remain scheduled under task 6.6                             | Real restoration remains unexecuted and is residual risk                    |
| Conversation switching                              | Message Queue and retained Tab/attachment tests passed in task 5.4                                             | Real multi-Conversation switching remains unexecuted and is residual risk   |
| Conversation isolation                              | Queue, projection attachment, Window/Workbench/Surface and stale-connection rejection tests passed in task 5.4 | Real interleaved session isolation remains unexecuted and is residual risk  |
| Visible UI, approval and renderer reload            | Visible composer/approval/reload case passes strict dry-run                                                    | Visible Electron/API case blocked before launch                             |

## Residual Risk

No real provider-backed Agent behavior was accepted in this environment. Before release readiness,
rerun the two focused cases with explicit provider/model/cost authorization, then execute the
remaining applicable foundational matrix cells through the complete Desktop owner. Key-free,
deterministic, or mock evidence must not be promoted to real Agent acceptance.

## Persisted Root Containment And Stable-Table Evidence

- The reported local `desktop.shell` authority contains unknown `catalogRevision` and
  `storageRevision` root metadata. The canonical Host codec now restores required Project and
  Window collections independently, retains unknown root metadata by exact field name, and
  serializes its JSON values unchanged without selecting a parser or migration path.
- The same additive root containment applies to `desktop.application-settings`. A real Desktop
  restart restored the existing preferences, projected an exact metadata warning, and did not
  enter the authority-rejection/default-settings path.
- The existing SQLite `desktop_application_state` table also contains an unknown required column.
  The repository now updates an existing authority row directly and inserts only for an absent
  authority identity. Focused coverage proves an arbitrary unknown required column remains
  unchanged; the product does not inspect it, synthesize a value, or alter table structure.
- Read-only inspection before startup confirmed the existing JSON values. After ordinary Desktop
  scene commits, read-only inspection confirmed both unknown JSON metadata values and the unknown
  table-column value remained unchanged. No data repair, migration, or schema rewrite ran.
- A clean real Electron launch reached `Desktop renderer loaded`. CDP path evidence confirmed the
  Workbench and Agent Surface were mounted, no root failure was present, and Asset Center,
  Extension Management, Project Management, and return-to-Asset-Center transitions all retained
  the Workbench. Media Library reported list view selected and exposed directory connect,
  relocate, and refresh operations.
- The local Shell authority contained zero Project records before this change. The one retained
  old Window contains a removed field and remains locally rejected and unchanged; the product
  creates a separate canonical Window rather than converting that record. Therefore this change
  cannot restore Project facts that are absent from the authority, and no automatic reconstruction
  was attempted.

Focused and owner-level validation passed: Host 340 tests, Local Metadata 88 tests, Desktop 388
tests, Host/Local Metadata/Desktop typechecks, strict OpenSpec validation, `git diff --check`,
`check:legacy-debt`, and `check:unused`. The final internal-version audit reports zero baseline and
zero new internal occurrences, with 143 exact external, 191 exact user-managed domain and two exact
repository-correctness allowances.

The allowance validators require exact finding identity, path, category and token. External entries
also require owner, field scope, HTTPS normative source and isolation rule; domain entries require an
owning `@neko` package, user workflow, business requirement, field scope and isolation rule;
correctness entries require owner, concrete consumer, invariant, version-free analysis, field scope,
isolation rule and removal condition. The audit self-tests pass 10/10 and cover stale, incomplete,
misowned and newly introduced occurrences.

All 24 active changes modified by this implementation pass strict OpenSpec validation. Canonical-path
evidence is recorded in the owner-level producer/consumer tests; retired paths are proven absent from
imports, exports and registrations; invalid records retain sibling availability; managed Character,
Asset and generated-output versions remain exact owner-scoped business identities; existing retired
bytes remain untouched and product-unreachable.

The later Workbench regression shown in the Desktop screenshot was traced to duplicate owner records
where the exact active Workbench followed an inactive sibling. The Host decoder now retains the exact
active instance and isolates only the duplicate sibling; 26 focused Workbench catalog and Shell state
tests pass. The repeated visible Electron workspace-switching and application-reload scenario passed
after this correction.

## Entity Read Isolation And Desktop Render Containment

- Disposition: `excluded` for provider-backed Agent Evaluation. The changed Agent behavior is the
  deterministic Workspace Entity read boundary only: `decodeProjectEntityDocument` ->
  `NodeProjectEntityRepository.readAvailable` -> Agent file-search mention projection. Prompt,
  provider/model selection, Tool routing, turn execution and response quality are unchanged.
- Canonical positive evidence keeps one valid Entity mention and ordinary Workspace file results
  available beside an invalid Entity. The owning Entity result retains an exact
  `invalid-project-entity-document` diagnostic with `entityId`; whole-document container mismatch
  remains fail-visible and does not return empty success.
- Resource-reference and binding-availability projections now use the same entry-isolating read;
  mutation still uses strict `load/mutate`, so a partial document cannot be written back.
- Desktop reuses `@neko/ui/error-boundary` at the renderer root, Workbench instance and slot
  boundaries. Focused jsdom evidence proves a synchronous Surface render failure leaves the
  PrimarySidebar and sibling Surface mounted and displays an accessible retry diagnostic. Each
  retained Agent Surface is additionally isolated by exact `agentSurfaceId`, so one conversation
  render failure does not replace its retained sibling Roots.
- The explicit Project Entity repair tool is isolated under `tools/offline-repair`, requires an
  absolute target, exact Entity identity and identity-bound confirmation, creates an exclusive
  original-byte backup, preserves the source permission mode without forcing `0600`, writes
  atomically and validates the persisted canonical document. The reachability audit proves it is
  absent from product imports, build, startup, ordinary tests and CI.

## Completion Gate Evidence

The following repository gates passed against the final owner slices before the focused Preview
scenario correction:

- `pnpm build`; Electron Forge produced
  `apps/neko-desktop/out/OpenNeko-darwin-arm64/OpenNeko.app` with the externally required
  application release version retained in `apps/neko-desktop/package.json`.
- `pnpm test`; Desktop passed 65 files / 388 tests, Host passed 37 files / 340 tests, and Agent
  Runtime passed 116 files / 1093 tests. Expected ErrorBoundary test stacks remained visible and did
  not fail the suite.
- `pnpm check`, `pnpm check:quality`, `pnpm check:legacy-debt`, `pnpm check:unused`, and
  `git diff --check`.
- `pnpm test:agent:eval`; 44 files / 286 tests and the strict 22-suite / 53-case dry-run passed. This
  is key-free Evaluation harness readiness only.
- `node --test scripts/check-no-internal-versioning.test.mjs`; 10/10 audit tests passed.
- `node scripts/check-no-internal-versioning.mjs --require-clean`; zero baseline and zero new
  internal occurrences, with 143 external, 191 user-managed domain, and two repository-correctness
  allowances.

`check:unused` emitted 73 configuration hints and no failure. The dependency audit found no
violation across 1415 modules. Historical debt ledgers and their validation mode were deleted;
`check:legacy-debt` now validates current source directly.

## Real Electron Desktop Acceptance

The following isolated real Electron reports passed:

- `desktop-workbench-scenes`:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-06T06-48-19.111Z-desktop-workbench-scenes-development/report.json`.
  This proves startup, exact active Workbench restoration, Agent Surface composition, workspace
  activation/switching, application reload restore, management-surface transitions, content-only
  Preview composition, focus and responsive layout.
- `resource-browser-entity-management`:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-06T06-51-29.086Z-resource-browser-entity-management-development/report.json`.
  This proves Resource Browser default list mode, directory/resource operations and context menus,
  plus Entity candidate, detail and binding projections.
- `cut-openneko-consumer`:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-06T06-54-16.201Z-cut-openneko-consumer-development/report.json`.
- `canvas-openneko-consumer`:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-06T06-54-59.674Z-canvas-openneko-consumer-development/report.json`.
- `preview-openneko-consumer`:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-06T07-01-03.938Z-preview-openneko-consumer-development/report.json`.
  Image, audio, video, PDF, GLB and glTF viewers loaded through the OpenNeko resource handler; the
  Desktop-owned active Workbench tab closed each content-only Preview and every session URL became
  unreachable.
- `pnpm test:local:media-openneko`:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-06T07-01-43.211Z-openneko/report.json`.
  Electron 43/Chromium 150 with FFmpeg 8.1.2 passed video/audio playback and seek, byte Range, image,
  PDF, GLB/glTF dependency loading, sender isolation, PCM client/owner cancellation, reload URL
  revocation and window-close resource release.

The Preview scenario correction was limited to its functional driver: content-only Preview no
longer expects package-owned duplicate chrome and closes through the active Desktop Workbench tab.
`node --check packages/preview/webview/functional/desktop-openneko-consumer.mjs` and the real Preview
scenario passed after this change.

## Final Quality Review

Risk classification is L4 because the change crosses persisted local data, shared contracts,
Electron IPC, Agent workflow, media runtime and packaging. No blocking review finding remains in the
implemented boundary.

- Responsibility: package owners retain contract, state and workflow policy; Desktop remains the
  Electron trust, sender, lifecycle and composition boundary. The Preview functional driver now uses
  the Desktop-owned tab close control instead of restoring duplicate package chrome.
- Dependency: package, application, Agent, Webview and content-access boundary checks passed with no
  exception or direction violation. Offline repair remains outside every product and CI graph.
- Interface: internal version, migration and compatibility discriminators are removed from the
  changed contracts. Exact instance/session/request identity, owner serialization and source
  fingerprints are used only for their stated runtime invariants. Character, managed Asset,
  generated-output and external versions remain owner-scoped allowances.
- Extension: each business intent has one canonical owner/handler/adapter/projection path; adding a
  future provider or viewer does not require a schema generation or product migration framework.
- Testing: focused producer/consumer tests, full build/test/check gates, real Electron workflows and
  media lifecycle qualification all passed. The final terminology cleanup also passed Content 31/31
  and Local Metadata 7/7 focused tests.

The final `pnpm check:quality` run passed all 42 strict OpenSpec items, application/package/Webview
boundaries, offline-repair reachability, storage authorities and strict TypeScript checks. The final
audit again reported zero baseline and zero new internal occurrences.

Residual risks remain explicit:

- Provider-backed Agent behavior was not accepted because provider identity, model identity and cost
  authorization were unavailable. The two focused real-API lanes remain `infrastructure-blocked` as
  recorded above.
- The successful Preview matrix emitted two non-fatal Agent listener warnings for Preview-owned
  `document:statusUpdate` and `document:saveState` window messages. No Preview, Agent or resource
  operation failed, but the existing shared-window listener ownership should be corrected in a
  separate contract-scoped change instead of adding an ignore-list branch here.
- The cleanup ledger still reports existing maintenance warnings for deleted paths and one
  unregistered high-volume Generation candidate; `check:unused` still reports 73 non-blocking
  configuration hints.

## Final Revalidation (2026-08-06)

The completed change was revalidated after task closure:

- The exact internal-version audit self-tests passed 10/10. The clean audit again reported zero
  baseline and zero new internal occurrences, with only the evidence-backed 143 external, 191
  user-managed domain and two correctness allowances.
- Forced component-failure coverage passed: Desktop 31/31, shared UI 10/10, Host 38/38, Assets
  45/45 and Local Metadata 6/6. The failing Surface displayed its local alert while the healthy
  Agent Surface, PrimarySidebar, Workbench, valid sibling records and unrelated workspace state
  remained available.
- `desktop-workbench-scenes` passed in real Electron with no console error, exception or warning:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-06T07-11-37.569Z-desktop-workbench-scenes-development/report.json`.
- `resource-browser-entity-management` passed in real Electron with no console error, exception or
  warning. It confirmed default Resource Browser list presentation, file/directory context actions,
  Entity candidate/confirmed/attention projections and binding visibility:
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-06T07-12-48.644Z-resource-browser-entity-management-development/report.json`.
- The final `pnpm check:quality`, strict OpenSpec validation and `git diff --check` passed.
