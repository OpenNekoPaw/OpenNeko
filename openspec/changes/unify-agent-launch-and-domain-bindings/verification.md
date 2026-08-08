# Verification

Date: 2026-08-08

## First-submit title and Primary navigation typography

Tasks 16.1-16.5 keep Conversation title ownership in the canonical Agent/Pi path:

- Agent application normalizes and bounds the validated typed first input, retaining `/command` and
  `$skill` identities without making a title-generation model call.
- Session materialization passes the title to the exact Workspace runtime, and Pi writes it during
  Conversation creation before invalidating the authoritative Home projection. Renderer navigation
  continues to read the catalog title and has no `New conversation` replacement path.
- Primary navigation Project headers, standalone Assistant/Workspace group headers, Conversation
  rows and expand controls use the same 11px directory-entry size. The 10px section heading remains
  a distinct catalog hierarchy.

Verification on 2026-08-08:

- Focused Agent runtime tests: 3 files, 61 tests passed; focused Desktop tests: 3 files, 73 tests
  passed; Agent runtime and Desktop typechecks passed.
- Full `@neko/agent-runtime` suite: 111 files, 1015 tests passed. Headless Desktop functional suite:
  11 files, 142 tests passed. Strict OpenSpec validation, repository OpenSpec checks, formatting,
  `git diff --check`, `pnpm check:quality` and UI Skill contract checks passed.
- Visible Electron scenario `desktop-agent-entry-workspace-skill` passed with report
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T10-49-30.261Z-desktop-agent-entry-workspace-skill-development/report.json`.
  The persisted and visible title was `$storyboard 请根据所选参考创建一份简洁的分镜。`; Project
  and Conversation computed font sizes were both 11px. The completed Session had one native image
  provider request, no run status, execution activity, stop control, alert, Console error, warning
  or Renderer exception. The final screenshot was inspected directly with no clipping or overlap.
- The full Desktop unit suite had two pre-existing failures in
  `desktop-agent-content-effects.test.ts`: current mention projections include the already-added
  `mediaType` field while those unrelated fixture expectations omit it. The three touched Desktop
  files and the headless suite pass; this change does not alter those content-effect projections.

## Generation ownership and entry paths

Task 6.7 consumes the implementation and path evidence owned by
`extract-generation-domain-package`:

- `WorkspaceGenerationApplicationRuntime` returns the same exact `GenerationJobPort` to the Agent
  Tool and direct-operation consumers for one Workspace identity and authorized root. Reusing the
  Workspace identity with another root fails before Job submission.
- `DirectGenerationOperationPort` validates the exact purpose, provider and model before creating
  one detached Generation Job. A rejected binding creates no Job, and a failed Job is returned as a
  terminal diagnostic without retrying through the Agent entry.
- Agent Webview direct image/video/audio submission calls the direct generation port before any
  Conversation lookup, optimistic transcript write or Agent message dispatch. The tests assert that
  no Agent message is sent and no transcript item is fabricated for that operation.
- Desktop resolves Draft direct generation through the exact launch connection and Workspace grant,
  and Session direct generation through the exact registered Agent connection. Forged, stale,
  cross-Window and cross-Workspace identities fail locally before the Generation owner is called.
- The Agent Tool path continues to use the same purpose-qualified Generation Job port. Neither entry
  creates a generation-specific Conversation, Turn or hidden AgentSession, and neither failure path
  switches to the other entry or another provider/model.

The focused package, Agent Webview, preload and Desktop tests passed as part of the prerequisite
qualification. `pnpm test:agent:eval` also passed 44 files and 288 tests, and the all-suite dry-run
validated 23 suites and 57 cases. These key-free results prove deterministic routing, schema and
harness readiness only.

Real provider and visible Desktop evidence remains blocked until an explicit provider/model/cost
authorization is supplied and the public Desktop Evaluation driver can operate the direct media
control. No provider-backed or pixel-level acceptance is claimed by task 6.7.

## Character extension boundary and retired launch path

Tasks 7.1-7.5 and 10.4 cover only the Agent-side extension boundary and removal of the old launch
path; they do not claim a Chara product owner:

- `@neko/agent-runtime/application` defines one optional Chara consumer port, validates exact
  Character, CharacterVersion, role-profile and materialized CharacterRun identities from a bounded
  test provider, and returns an owner-qualified unavailable result when no provider is composed.
- Desktop composes no Chara provider and exposes no successful Character target, Conversation,
  CharacterRun or Scene. Entity candidates, fixtures and authoring-test snapshots are not accepted as
  CharacterVersion authority.
- A future authoritative Chara provider can contribute bounded context and shared input/configuration
  policy without adding a Character-specific Agent runtime or Webview `conversationKind` branch.
- The `startCharacterDialogueFromSlash` and `confirmRoleplayCandidate` message shapes, builders and
  handlers were removed. Strict protocol tests retain those strings only to prove both retired
  messages decode to `null`; production reachability search has no match.

Verification passed on 2026-08-08:

- `pnpm --dir packages/chara test`: 10 files, 63 tests passed.
- `pnpm --dir packages/chara typecheck`: passed.
- Focused Agent application tests cover optional-provider unavailable, exact-owner validation and
  cross-owner rejection.
- Focused Agent Webview controller tests: 1 file, 58 tests passed.
- Focused Agent Contracts protocol tests: 2 files, 44 tests passed.
- Focused Agent Webview input/controller/header/presenter tests: 4 files, 130 tests passed.

The existing `packages/chara` test and typecheck results confirm that removal of the special-text
Agent path did not regress its pre-existing Dialogue/Embody capabilities; they are not
CharacterVersion/Run producer evidence. Published CharacterVersion, CharacterRun materialization,
Character Scene and visible provider-backed Character interaction are transferred to a follow-on
Chara change. Task 11.5 is complete because the missing authoritative Desktop owner and neutral
observability gap are recorded above as required.

## Desktop application composition

Tasks 9.1-9.5 are supported by sender-bound bridge, application delegation and Scene
projection evidence:

- Main composes `createAgentLaunchApplicationService`,
  `createAgentDomainBindingApplicationService` and
  `createAgentLaunchDraftSubmissionApplicationService`; `DesktopAppHost` decodes the typed request,
  validates its sender-derived Window/surface identity and delegates the operation.
- Preload exposes only typed Agent launch operations. The Renderer adapter owns recoverable Draft
  presentation state and replaces stale connections without acquiring filesystem or Electron
  authority.
- AppHost and bridge tests cover forged/cross-Window identity, replaced connections, detached
  Windows, stale surfaces, exact Draft/Scene identity and idempotent first-submit replay.
- A provider failure test proves the already materialized Conversation remains in the exact
  Assistant Session Scene, the pending Turn becomes `failed` with its diagnostic, and the request
  does not return to Draft or select another provider/owner.
- The Desktop architecture gate asserts that launch catalog construction and first submit delegate
  through Agent application public services, and that Desktop launch sources contain no active,
  current, recent or first Project resolution, try-next path or model merge/resolution owner.

Verification passed on 2026-08-08:

- Focused Main/preload/Renderer launch bridge tests: 4 files, 33 tests passed.
- Focused AppHost/Desktop Renderer tests: 3 files, 79 tests passed.
- AppHost plus Desktop architecture-boundary tests after provider-failure coverage: 2 files,
  61 tests passed.
- `pnpm typecheck:desktop`: passed.
- `pnpm --dir apps/neko-desktop test`: 69 files, 440 tests passed. The first run had one
  resource-browser timeout under concurrent gate load; the isolated file passed 8/8 and the full
  suite then passed without changing the timeout or implementation.
- `pnpm test:functional:headless`: 11 files, 136 tests passed.

Tasks 9.2 and 9.3 are complete for the current Assistant/Workspace scope. Their former Character
clauses were transferred to the follow-on Chara change because satisfying them here would require
fabricating or importing an authoritative CharacterVersion/CharacterRun product owner.

## Visible Workspace layout evidence

The visible `desktop-workspace-resize` scenario passed after the dock tracks were made shrinkable
inside the viewport and the functional scenario began waiting for both Shell projection and
`aria-pressed` state. The final report is
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T02-10-45.621Z-desktop-workspace-resize-development/report.json`.

- Exact Workspace navigation produced a bound Draft, and the real `@agent-reference.txt` result used
  the active Workspace composer.
- Agent, Main and Management hide/restore cycles retained their exact presentation state.
- Timeline remained disabled with no owner instead of pretending to open.
- At 1440px the Primary, Agent, Main and Resources bounds remained within `0..1440`; the observed
  post-resize bounds were `0..240`, `240..630`, `638..1042` and `1050..1440`.
- All nine screenshots were inspected directly; no clipping, incoherent overlap, text overflow,
  console error, warning or renderer exception was observed.

This covers the bound Workspace `@` and layout portion of task 10.6.

## Visible Entry Workspace and Skill evidence

The focused `desktop-agent-entry-workspace-skill` scenario passed through the real Entry composer.
The final report is
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T06-56-33.963Z-desktop-agent-entry-workspace-skill-development/report.json`.

- The fixture first created one durable Project, returned to a fresh unbound Entry Draft, then used
  the visible Workspace menu to select that exact Project. The Entry composer exposed no duplicate
  Start Conversation, `/` or `$` footer action; typing `/` discovered the launch-safe `/new`
  catalog item, and both the command menu and its trigger remained inside the viewport.
- Typing `@unbound-scope` before selecting a target invoked no Workspace search, displayed the
  expected local empty result and produced no global alert. The empty mention menu remained
  dismissible with `Escape` in the focused Webview regression test.
- Selecting the Workspace retained the exact Draft identity, the entered Draft text and the same
  single Agent Root. It stayed in the Entry Scene, created no Conversation and did not remount a
  second Agent controller.
- The menu selection created a new sender-bound Draft grant for the same exact Workspace. The real
  `@agent-reference` query returned `agent-reference.txt` through that Draft binding and projected
  exactly one selected reference token without reading an active Project fallback.
- Typing `$storyboard` opened the canonical Skill catalog, selected the exact builtin entry, and
  the submitted transcript retained
  `$storyboard Create a concise fixture storyboard from the selected reference.`.
- First submit created exactly one Workspace Conversation and changed the interaction from Draft to
  Session. The committed Scene retained the selected Workspace id and exact Draft grant, and the
  same single Agent Root remained mounted through handoff.
- The functional provider received exactly one keyless `POST /api/chat/completions` request and the
  transcript displayed `OPENNEKO_FUNCTIONAL_RESPONSE_1`. Completion left no run status, execution
  activity, stop control, alert, Console error, warning or Renderer exception.
- All six current screenshots were inspected directly: unbound `/`, unbound `@`, Workspace target,
  selected reference, typed `$storyboard` and completed Workspace Session. They contained no
  duplicate trigger controls, clipped menu, repeated reference, incoherent overlap or obscured
  Agent, Canvas and Resources surface.

Regression verification on 2026-08-08:

- `pnpm --dir packages/agent/webview exec vitest run src/components/ChatView/InputArea/InputArea.test.tsx`:
  1 file, 62 tests passed, including unbound Entry mention isolation and `Escape` cancellation of
  an empty mention menu.
- `pnpm --dir packages/agent/webview test`: 90 files, 708 tests passed.
- `pnpm --dir packages/agent/webview run build`: passed.
- `pnpm --dir apps/neko-desktop test`: 70 files, 449 tests passed, including the application,
  sender-bound Desktop adapter and Renderer launch paths.
- The packaged scenario reached every Draft, typed-trigger, binding, mention and Skill-menu
  checkpoint, then failed after Conversation creation because macOS Keychain lookup returned
  `userCanceledErr`. It therefore supplies no packaged provider-turn success claim; the complete
  authoritative interaction and visual evidence comes from the development Desktop report above.

The first run exposed an outdated fixture declaration: the functional model advertised a 4096
output-token limit while the canonical Draft request is 8192. The fixture metadata now advertises
8192; production validation remained unchanged and continued to reject the invalid configuration
before Conversation creation. Tasks 10.6 and 13.4 are complete. This local keyless provider
evidence does not replace the explicitly authorized real-provider visible and hidden Evaluation
required by task 11.7.

## Agent Evaluation authoring and readiness

The reviewed Evaluation dispositions for this change are:

| Behavior                                       | Disposition                               | Suite                               | Evidence and remaining gap                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft launch and owner-qualified Scene handoff | `create`                                  | `agent-runtime.launch-binding`      | Visible Entry-to-Assistant and Workspace-to-Workspace first-submit cases require exact Draft, Conversation, owner and connection evidence. `stale-binding-rejection` replaces the binding, submits the captured old receipt, requires exact rejection plus unchanged unbound Entry Draft/no Conversation, then restores the Renderer and completes one visible canonical submit.             |
| Entry `$skill` first submit                    | `update`                                  | `agent-runtime.skill-runtime`       | `entry-explicit-builtin-first-submit` requires visible composer dispatch, exact builtin Host identity/fingerprint, Skill injection receipt and Entry-to-Assistant materialization.                                                                                                                                                                                                           |
| Conversation model switching                   | `update`                                  | `agent-runtime.model-binding`       | `same-conversation-model-switch` dispatches a future-configuration update after the first Turn identity is public but before terminal completion, then requires the first immutable snapshot to retain `gpt-5.5` and the second to use `gpt-5.6-luna`. `unavailable-model-update-rejection` requires a diagnostic, unchanged submission count and the prior model on both surrounding Turns. |
| Session compaction                             | `update`                                  | `agent-runtime.workflow-controller` | `session-compact-continuation` resolves `/compact` from the exact Session catalog, requires `compressionResult`, then continues the same Conversation. `entry-compact-session-required` submits the exact unavailable Draft catalog identity, requires `session-required`, unchanged Draft/no Conversation, then restores the visible composer for a canonical first submit.                 |
| Character binding                              | `excluded` from executable Evaluation     | none                                | Desktop has no durable CharacterVersion/CharacterRun owner or owner-qualified visible Session evidence. Creating a case would fabricate product authority; execution remains `infrastructure-blocked` until that product boundary exists.                                                                                                                                                    |
| Workspace native image input                   | `reuse`                                   | `agent-runtime.launch-binding`      | Exact Workspace binding, first-submit and terminal-idle ownership are unchanged and reuse the existing suite. Deterministic path tests plus the visible functional provider prove one native image request and no persisted base64; visible/hidden execution against an explicitly authorized real multimodal provider remains blocked under task 11.7.                                      |
| Workspace dock sizing                          | `excluded` from Agent behavior Evaluation | none                                | Deterministic CSS contract tests and the visible Electron resize scenario own this presentation-only behavior.                                                                                                                                                                                                                                                                               |

The Evaluation platform now supports reusable, case-neutral evidence for:

- `startSurface: entry | workspace` with visible Entry submission and post-materialization Assistant
  bootstrap through the public Desktop Agent bridge;
- per-step model-profile selection and per-idle immutable Turn facts;
- typed Session input invocation resolved from the public input catalog;
- typed Draft binding and rejected input evidence with exact old/current catalog receipts, surface
  identity and no-Conversation facts;
- running/idle Conversation configuration updates with requested/effective policy evidence and an
  unchanged public submission count;
- Draft-to-Session owner/Scene, model-sequence, Draft rejection, configuration-update and
  input-invocation hard gates.

It does not dispatch by case id, call `AgentSession` directly, seed a Conversation, use a mock
provider, or treat final text as path evidence. A case that names additional explicit models is
rejected before Desktop launch unless every model is in the same-provider
`OPENNEKO_AGENT_EVAL_MODEL_IDS` authorization set. The singular terminal model identity remains
mandatory and cost authorization still covers the invocation.

Verification passed on 2026-08-08:

- Focused Evaluation schema/discovery/selector/workflow/driver/evidence/runner tests passed after
  the new implementation-level assertions were added.
- `pnpm test:agent:eval`: 44 files, 294 tests passed.
- `node scripts/agent-eval/all-suite-dry-run.mjs`: 23 indexed suites and 60 cases passed strict
  resolution, including 3 launch-binding, 3 skill-runtime, 3 model-binding and 12
  workflow-controller cases.

These are key-free harness and authoring-readiness results only. On 2026-08-08,
`~/.neko/config.toml` was readable, but `OPENNEKO_AGENT_EVAL_PROVIDER_ID`,
`OPENNEKO_AGENT_EVAL_MODEL_ID`, `OPENNEKO_AGENT_EVAL_MODEL_IDS` and
`OPENNEKO_AGENT_EVAL_COST_APPROVED` were all absent. No visible or hidden provider-backed case was
started, no API cost was incurred, and task 11.7 remains open.

### Foundational matrix disposition

| Matrix cell                                        | Current artifact                                                                    | Disposition for this change                                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Basic and multi-turn conversation                  | Existing canonical and continuation cases; new launch/model cases                   | Authored and key-free validated; real provider rerun blocked by missing authorization.                                    |
| Compaction continuation                            | `session-compact-continuation`, `entry-compact-session-required`                    | Session continuation and Entry no-turn rejection are authored and key-free validated; provider execution remains blocked. |
| Owner/application reopen                           | `conversation-persistence-resume`                                                   | Existing case reused; provider execution not rerun in this change.                                                        |
| Generation record restoration                      | Existing detached/regenerate/board delivery cases                                   | Existing cases reused; direct-generation ownership was deterministically verified, provider execution not rerun.          |
| Conversation switching                             | No complete-session multi-Conversation operation/evidence in the declarative driver | Blocked by missing neutral switching evidence; visible functional navigation evidence does not replace Agent Evaluation.  |
| Transcript/queue/config/context/artifact isolation | Existing queue, persistence, media and board cases plus per-Turn model facts        | Partial reusable coverage; cross-Conversation interleaving remains blocked by the same multi-Conversation driver gap.     |

The matrix audit is complete because every required cell has an explicit covered, reused or blocked
disposition. It is not a claim that the provider-backed foundational matrix passed.

## Completion quality gates and review

The final deterministic qualification passed on 2026-08-08:

- `pnpm check:quality`: passed, including Agent/application/package/Webview boundaries, strict
  TypeScript, storage authority, test orchestration and strict validation of all 61 OpenSpec items.
  The internal-versioning audit reported 0 baseline occurrences, 143 external occurrences, 198
  allowed domain occurrences, 1 correctness allowance and 0 new occurrences. CharacterVersion names
  in Agent contracts are future user-domain identity refs and do not route an internal schema or
  implementation generation.
- `pnpm check:unused`: passed with 74 non-blocking configuration hints and no unused-code finding.
- `pnpm check:legacy-debt`: passed with 0 blocking `delete-now`, `migrate-now`, `migration-only`,
  `current-bridge` or `needs-review` occurrence.
- `pnpm gate:local`: passed end to end. It ran format, lint with 0 errors, all workspace typechecks,
  the macOS arm64 Desktop package build, every workspace test suite, dependency-cruiser and the full
  repository-quality composition. Representative totals include Desktop 69 files/441 tests, Agent
  runtime 111 files/1008 tests and Agent Webview 90 files/706 tests.
- `pnpm test:agent:eval`: passed 44 files/294 tests; the all-suite dry-run passed 23 suites/60 cases.
- `openspec validate unify-agent-launch-and-domain-bindings --strict`, `pnpm check:openspec` and
  `git diff --check`: passed.

The first `gate:local` attempt stopped at Prettier for 23 exact files. After formatting those files,
the next attempt exposed five blocking lint errors; those unused symbols, one `let` and one test
generator fixture were corrected rather than excluded. A later run observed concurrent worktree
updates that temporarily reintroduced two format differences and one missing test import; the exact
files were revalidated with ESLint and Desktop typecheck before the final full gate passed. No gate,
rule or timeout was weakened.

The `neko-quality-review` found no remaining blocking defect in this change:

- Agent Contracts own the canonical Draft/Session, binding, input and configuration shapes; Agent
  Runtime application services own materialization and future-Turn configuration; future Chara owns
  CharacterVersion/Run context while remaining uncomposed here; Desktop remains a sender-bound
  adapter and Scene composition root.
- Dependency and runtime direction passed package, application, Agent, Webview and storage-authority
  gates. No Renderer path acquires Node/Electron authority.
- First submit, command/Skill invocation, model selection and mention search each use one exact
  catalog/binding path. Invalid source entries, receipts, models and providers fail in their owning
  item, Draft, Turn or request without clearing sibling capabilities or changing owner.
- Draft snapshots remain non-authoritative presentation data. Provider failure preserves the
  committed Conversation and failed Turn diagnostic; no project fact, Character fact or transcript
  is replaced with a fabricated default.

The final reachability audit found no executable reference to the deleted
`AgentRootPresentation` exports or constructors. Deleted `invokeSlashCommand`, `invokeSkill`,
`invokePluginSlashCommand`, `getSkills`, `skillsList`, `startCharacterDialogueFromSlash` and
`confirmRoleplayCandidate` names occur only in negative tests that assert absence or codec rejection.
The Agent launch production chain contains no active/current/recent/first Project resolver, old
launch-only Skill presenter, duplicate command handler or raw-text role trigger. Empty
`projectFiles` messages are used only to synchronously invalidate stale mention presentation when a
Draft binding changes; unbound search returns a visible scope diagnostic and cannot succeed through
an implicit Project.

Provider-backed acceptance remains explicitly incomplete. The authored model identities are
`nekoapi-chat/gpt-5.5` and `nekoapi-chat/gpt-5.6-luna`, but no provider/model authorization set was
supplied in the environment and cost approval was absent. The runner supports an explicit
same-provider model allowlist and rejects any unlisted profile before Desktop launch. No
provider-backed report or API result is claimed. The visible Workspace layout and Entry Workspace
Skill reports are listed above. Real-provider Evaluation remains open in task 11.7. Durable
Character/CharacterRun composition
and World product behavior belong to follow-on changes and are not completion criteria here.

## Workspace Fountain reference and terminal activity regression

The reported Workspace reference and stale execution-activity paths were requalified on 2026-08-08:

- Desktop Main now classifies `.fountain` as authorized text content and keeps the existing exact
  Workspace locator, containment, NUL and 256 KiB checks. Unsupported binary or structured files
  still fail at the reference boundary instead of producing empty context or exposing a raw path.
- The Agent Webview treats a non-streaming, non-empty Assistant response after the latest user
  message as the terminal Conversation projection for generic activity presentation. Streaming
  text, pending Tools, empty response shells and a newer user Turn retain their prior activity
  behavior; runtime, queue and task ownership are unchanged.
- Focused Desktop resolver and Webview presenter/component tests passed: 1 Desktop file/6 tests and
  2 Webview files/32 tests. The Desktop full suite passed 70 files/452 tests; Agent Webview typecheck
  passed, and its final full run passed 90 files/712 tests.
- `pnpm test:agent:eval` passed 44 files/294 tests and its all-suite dry-run passed 23 suites/60 cases,
  including the reused `agent-runtime.launch-binding` terminal-idle coverage. This remains key-free
  authoring evidence only; task 11.7 retains the real-provider and explicit-cost requirement.
- `pnpm check:quality` passed the package, application, Agent, Webview, strict TypeScript, storage,
  test-orchestration and OpenSpec gates. The canonical-path audit found no new internal version or
  alternate-path occurrence.

The visible development Electron scenario passed at
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T07-48-27.140Z-desktop-agent-entry-workspace-skill-development/report.json`.
It selected exactly one `test.fountain` token through the bound Workspace Draft, submitted the exact
`$storyboard` input, issued one functional provider request and reached the exact Workspace Session.
The final checkpoint recorded `providerResponseVisible: true`, `runStatusVisible: false`,
`executionActivityVisible: false`, `stopControlVisible: false` and no alerts. The report also recorded
no Console error, warning, Renderer exception or poisoned request. All six screenshots were inspected
directly; no clipped menu, duplicate token, global diagnostic, stale processing indicator, overlap or
text overflow was observed.

## Workspace image reference native multimodal regression

The reported `@test.png` failure was traced to the Workspace mention projection dropping the file's
image media type. The selected token therefore reached Desktop as an unknown binary reference and was
rejected before the Agent provider path. The canonical path now keeps each boundary narrow:

- Workspace mention search classifies the file through `@neko/media` and projects `mediaType: image`.
- Desktop resolves the sender-bound Workspace reference to a `ContentLocator` payload only. It does
  not read image bytes or expose a raw absolute path or base64 through IPC, the UI or the transcript.
- The Agent Workspace owner uses its existing package-owned `AgentContentAccessRuntime` to load at
  most four images, with a 5 MiB limit per image and an 8192-pixel maximum edge. `sharp` validates the
  actual PNG, JPEG, WebP or GIF format, MIME, extension and dimensions before provider execution.
- The exact selected `agent.main` model must declare image input. An invalid locator, unsupported or
  spoofed image, oversized image, audio/video reference or text-only model fails the current Turn
  without switching provider, model, source or Tool path.
- Pi receives the validated bytes as transient native image content for both ordinary and Skill
  Turns. Before checkpointing or retaining in-memory conversation history, Pi removes the temporary
  base64 image part; the durable user context retains only the Workspace-relative locator summary.

Focused deterministic verification passed on 2026-08-08:

- Agent application, Pi runtime and mention projection: 3 files, 61 tests passed. Coverage includes
  native image content at the provider boundary, locator-only durable transcript, Skill image input,
  non-image-capable model rejection before provider execution and PNG bytes spoofed as JPEG.
- Desktop resolver and controller composition: 2 files, 15 tests passed. Coverage proves image
  locator-only projection, unchanged bounded text handling and fail-visible video rejection.
- Agent Runtime and Desktop typechecks passed; the production Desktop package build passed with the
  existing external Sharp native runtime closure.
- `pnpm test:agent:eval` passed 44 files and 294 tests; strict dry-run discovery passed 23 suites and
  60 cases. The existing `agent-runtime.launch-binding` ownership remains correct because this fix
  changes bounded input materialization, not prompt/Skill selection or provider routing.
- `pnpm check:quality` passed all package, application, content-access, Agent, Webview, strict
  TypeScript, storage, test-orchestration and OpenSpec gates. Focused Prettier and `git diff --check`
  also passed. The L3 `neko-quality-review` found no blocking ownership, dependency, canonical-path,
  fail-local, user-data or test-evidence issue.

The authoritative visible development Electron scenario passed at
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T09-45-57.898Z-desktop-agent-entry-workspace-skill-development/report.json`.
It selected exactly one `test.png` token through the Workspace-bound Entry Draft, invoked the exact
builtin `$storyboard` Skill and completed the same Workspace Conversation. The functional provider
received one `POST /api/chat/completions` request with `nativeImageCount: 1`; its final checkpoint
recorded `providerResponseVisible: true`, no run status, execution activity, stop control or alert, and
no Console error, warning or Renderer exception. All six current screenshots were inspected directly;
the image token, menus and final response were visible without clipping, duplicate controls, overlap,
text overflow or residual processing state.

This local functional provider proves the native multimodal request shape without incurring external
API cost. It does not satisfy task 11.7: no explicitly authorized real-provider visible/hidden
Evaluation was run, so that task and its cost-dependent residual risk remain open.
