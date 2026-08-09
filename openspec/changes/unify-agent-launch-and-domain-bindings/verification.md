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

## Workspace linked Media Library mention regression

The Workspace mention catalog now composes linked Media Library files through an Assets-owned Node
source instead of treating the symlinked directory as an ordinary Workspace walk:

- Assets resolves configured linked libraries and returns only bounded portable locators shaped as
  `neko/assets/<libraryName>/...`; it does not return the physical target path or follow nested links.
- Bound Draft and Session mention searches use the same optional contributor, preserve
  `source: media-library`, deduplicate by portable locator and keep ordinary Workspace results when the
  linked-library contributor fails.
- Focused Assets, Agent and Desktop tests passed (1 Assets test, 7 Agent content-controller tests and
  10 Desktop content-effect tests). Agent Runtime, Assets Node and Desktop typechecks passed.
- `pnpm check:quality` and strict OpenSpec validation passed. The key-free Agent Evaluation harness
  passed 44 files / 294 tests and 23 suites / 60 cases, including the existing launch-binding and
  media-library-content owners.

Task 17.4 reuses the indexed
`agent-runtime.media-library-content/linked-media-search-read` case rather than creating a second
Evaluation owner. Its focused strict dry-run passed one suite / one case and preserves the canonical
`QueryProjectSearch -> workspace-file locator -> ReadImage` path, including rejection of absolute,
cache and `project://assets` paths.

The isolated visible Electron scenario `desktop-agent-linked-media-mention` passed at
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T19-10-04.889Z-desktop-agent-linked-media-mention-development/report.json`:

- The fixture Workspace linked `neko/assets/Reference` to a separate Media Library directory. After
  the exact Workspace Agent connection became ready, typing `@library-image` returned
  `neko/assets/Reference/library-image.png` with localized Media Library and image provenance badges.
  Selection produced one reference token whose title retained only that portable locator; neither
  the physical link target nor another Host path appeared in the Agent Surface.
- First submit retained the exact Workspace id and grant, materialized one Conversation, issued one
  request to the isolated keyless provider and included exactly one native image part. The terminal
  state showed the final response with no alert, run status, execution activity or stop control.
- Both screenshots were inspected directly. The selected reference and completed Conversation were
  visible without clipping or overlap. Canvas and Resources still showed their independent loading
  labels, so this evidence does not claim those sibling surfaces had completed loading.

The `/`, `$` and `@` path audit found no second Desktop execution implementation. `/` and `$` share
the contract-owned trigger parser and the Webview catalog-to-intent resolver; Draft execution is
validated by the exact launch catalog and Session execution by the exact Conversation catalog before
the Agent runtime handles the command or Skill. Draft and Session `@` transports are lifecycle-specific,
but both call the same Agent-owned Workspace mention search and the same injected Assets-owned Media
Library contributor. Desktop only authorizes the exact binding and transports typed requests; it does
not parse commands, activate Skills or read referenced content through another success path.

The keyless provider and dry-run evidence do not satisfy task 11.7. No real provider/model cost was
authorized, so matching visible and hidden real-provider complete-session execution remains open.

## Workspace grant restart and Agent Surface failure containment

The application-restart regression was requalified on 2026-08-08:

- Desktop Main restores the persisted Workspace Draft's exact `workspaceGrantId` only after the
  sender, Window, Workbench, Agent Surface, View, Draft and Workspace binding match the active Scene.
  Restore failure returns the canonical owner-qualified `unavailable` result and does not call Agent
  launch attach, generate another grant, resolve an active Workspace or reject Shell startup.
- Preload preserves `ready | unavailable` as the typed attach result. Renderer mounts no fake Agent
  adapter for an unavailable result, sanitizes unknown asynchronous attach failures, and displays a
  translated panel-local diagnostic with an explicit retry command.
- Focused Agent contract tests passed 1 file / 5 tests. Focused Desktop Main, preload and Renderer
  tests passed 3 files / 60 tests, including exact grant restore after clearing process authority,
  typed unavailable decoding, raw IPC/grant text suppression, sibling Canvas DOM preservation and
  retry to a normally mounted Agent Root. Agent contracts and Desktop typechecks passed.
- `pnpm test:local:ui:contract` passed 6 tests. `pnpm test:agent:eval` remained at 44 files / 294
  tests with the 23-suite / 60-case strict dry-run disposition already recorded above; this restart
  fix changes Host recovery and UI projection rather than prompts, Skills, provider selection or
  model behavior, and no external provider cost was authorized.
- `pnpm check:quality`, `pnpm check:application-boundaries`, `pnpm check:legacy-debt`, strict
  OpenSpec validation, focused Prettier and `git diff --check` passed. The L2 quality review found no
  blocking ownership, dependency-direction, canonical-path, fail-local, user-data or test-evidence
  issue. `pnpm check:unused` still reports only the pre-existing unrelated
  `activateWorkbenchMainView` export in `DesktopShell.tsx`.

The authoritative visible development Electron success scenario passed at
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T13-27-42.552Z-desktop-agent-workspace-restart-development/report.json`.
Before and after a complete application restart it retained the same exact Workspace and grant
identities and displayed `工作区已就绪`. The composer and toolbar fit the narrow Agent Surface; no
failure panel, alert, raw grant diagnostic, Console error, warning or Renderer exception was present.
Both current screenshots were inspected directly: Agent, Canvas and Resources remained visible and
coherent without clipping, overlap, blank regions or stale error text.

The visible unavailable-state inventory remains explicitly blocked. The first attempt could not
start a second Forge runtime because an existing development server already owned port 5173. A
second isolated Electron fixture connected to that server but stopped before React mounted because
the pre-existing Vite module graph retained an unrelated Canvas export error
(`CANVAS_ADD_TO_CUT_ACTION_ID`). The fail-visible report is preserved at
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T13-34-00.560Z-desktop-agent-workspace-restart-unavailable-development/report.json`;
it contains no Agent failure-state screenshot and is not claimed as product evidence. The required
unavailable-state function, localization, retry and sibling containment are covered by the focused
Renderer test, but UI validation remains `blocked` for that visual state until it is rerun from a
fresh authoritative Desktop development runtime.

## Locator-first unified content references

The locator-first content reference regression was requalified on 2026-08-09:

- Desktop now performs only exact Workspace grant authorization and projects canonical
  `workspace-file` locators. The Agent workspace runtime owns bounded strict UTF-8 reads, canonical
  document routing and native image materialization. PDF, DOCX, EPUB, CBZ and Fountain use the
  Content-owned document classifier and existing `ReadDocument`; document images retain the
  `ReadDocument.imageInfo -> ReadImage` chain. Missing audio/video perception rejects only the
  current Turn, and Turn preparation failure projects an exact Conversation error instead of a
  global application error.
- Provider input and durable Pi history are now separate projections of the same Turn. The provider
  receives transient bounded text, while checkpointed and in-memory Conversation history retain
  only the authorized locator. Skill invocation uses the same provider/durable context projection,
  so `$skill` Turns no longer drop document, text or media references. No raw path, base64 payload or
  extracted text is written into the durable reference prompt.
- Agent Evaluation disposition is `reuse` for
  `agent-runtime.stream-delivery/read-document-tool-result`,
  `agent-runtime.stream-delivery/document-image-native-delivery` and
  `agent-runtime.launch-binding/workspace-bound-first-submit`. The deterministic Desktop and Agent
  tests cover the new mention-to-locator preparation boundary and poisoned Desktop format policy,
  so no second Evaluation owner or scenario was added.
- `pnpm test:agent:eval` passed 44 files / 294 tests and strict discovery of 23 suites / 60 cases.
  Focused dry-runs for all three reused cases passed. This is key-free schema, runner and selection
  evidence only. No real provider/model or cost was authorized, so visible and hidden real behavior
  execution remains explicitly blocked under task 11.7.
- `pnpm --dir packages/agent/contracts test` passed 42 files / 271 tests. Agent runtime focused tests
  passed 4 files / 132 tests and the full runtime passed 111 files / 1033 tests. Desktop passed 75
  files / 487 tests; Agent Webview passed 90 files / 712 tests and its build passed. Agent contracts,
  Agent runtime and Desktop typechecks passed. Strict change validation and repository-wide
  `check:openspec` passed.
- The authoritative isolated Electron scenario `desktop-agent-entry-workspace-skill` passed at
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-08T18-52-19.666Z-desktop-agent-entry-workspace-skill-development/report.json`.
  It proved unbound local `@`, exact Workspace binding, one selected Workspace image locator,
  `$storyboard` first submit, one native image provider part, exact Workspace Scene handoff, one
  provider request, terminal response and absence of global alerts, run status, execution activity
  and stop controls. All six screenshots were inspected directly: menus, reference token, Skill
  selection and terminal Agent Surface were visible without clipping or overlap. The terminal
  screenshot still showed independent Canvas and Resources loading labels, so it is not claimed as
  evidence that those sibling surfaces had completed loading.
- `pnpm check:quality`, `pnpm check:legacy-debt`, focused path/reachability scans and
  `git diff --check` passed. The L3 quality review found no blocking ownership, dependency,
  canonical-path, user-data, fail-local or test-evidence issue. `pnpm check:unused` still reports only
  the pre-existing unrelated `activateWorkbenchMainView` export in `DesktopShell.tsx`.

Residual risk: deterministic tests prove locator routing for EPUB, CBZ, PDF and DOCX, while the
visible representative flow exercised the same boundary with a Workspace image and Skill Turn. A
real provider-driven visible document selection plus matching hidden complete-session run remains
unexecuted without explicit cost authorization. Audio/video success also remains capability- and
provider-dependent; only the exact unavailable-capability rejection is qualified here.

## Pi document range and image Tool-result regression

The reported Pi regressions were requalified on 2026-08-09:

- `ReadDocument` now exposes one strict model-visible range shape: `range.locator`. Undeclared
  top-level fields are rejected, and a direct top-level `locator` receives an exact corrective
  diagnostic instead of becoming a compatibility alias or a second successful input path.
- The Workspace Agent runtime now creates one package-owned Pi Tool-result asset loader from the
  same `AgentContentAccessRuntime` used by `ReadImage`. It materializes only exact content or
  representation locators, reuses the bounded image normalization/contact-sheet transport and
  supplies transient provider data URLs only after authorization. It never reads `uri`, raw paths,
  cache paths or another reader.
- Every Workspace Tool snapshot receives this loader unconditionally. The unused optional AppHost
  injection surface was removed; Desktop owns no image loader or format policy.
- Focused Agent Runtime tests passed 4 files / 92 tests, including strict range projection, invalid
  top-level locator, single and ordered batch materialization, representation preservation,
  production AppHost continuation, missing locator, content-authority failure and non-image byte
  rejection. Full Agent Runtime passed 112 files / 1056 tests, Agent Contracts passed 42 files /
  273 tests, Media passed 10 files / 142 tests and Desktop passed 78 files / 514 tests. Agent
  Runtime, Agent Contracts, Media and Desktop typechecks passed.
- `pnpm test:agent:eval` passed 44 files / 294 tests and strict discovery of 24 suites / 63 cases.
  The focused `agent-runtime.stream-delivery/document-image-native-delivery` dry-run passed one
  suite / one case. This is key-free schema, runner and selection evidence only.
- Strict OpenSpec validation, `pnpm check:quality`, `pnpm check:legacy-debt` and `git diff --check`
  passed. The L3 quality review found no blocking ownership, dependency-direction, canonical-path,
  user-data, fail-local or test-evidence issue. `pnpm check:unused` still reports only the unrelated
  existing `activateWorkbenchMainView` export in `DesktopShell.tsx`.
- The current development Electron process was restarted completely so Main, preload and Renderer
  used the same build. The Workspace Shell, Agent transcript, composer, Canvas loading state and
  Resources rendered without a global startup error, clipping or overlap in the inspected current
  screenshot. Existing `Pi image Tool result requires a Host asset loader` entries remain visible
  because they are durable history from runs before this fix; they are not evidence from the new
  runtime.

Visible UI validation of a new EPUB `ReadDocument -> ReadImage -> native Pi continuation` remains
`blocked`: no provider/model cost was explicitly authorized under task 11.7, so no new request was
submitted. The same limitation blocks the matching hidden complete-session execution. Deterministic
tests prove the production Workspace AppHost injection and exact locator materialization, but they
do not replace that real-provider acceptance evidence.

## Simple model content references and format routing

The model-facing content protocol was requalified on 2026-08-09:

- `PiContentToolModelProtocol` now owns one exact Conversation-scoped binding for authorized input,
  document unit, cursor and image refs. The model-visible `ReadDocument` and `ReadImage` schemas use
  only short strings and fixed intent fields; canonical content, document, representation and cursor
  locators remain in application memory and persisted Pi Tool `details`.
- Successful `ReadDocument`, `ReadImage`, `QueryProjectSearch`, Generation and other locator-bearing
  Tool results issue deterministic short refs. Search results no longer require the model to rebuild
  a Workspace locator from `filePath`; generated outputs can flow directly to `ReadImage` by
  `image_ref`. Reopen restores bindings from user-message presentation metadata and the append-only
  Tool details, including branches that contain Pi compaction entries.
- Model-visible document text is capped at 24,000 characters, document manifests at 100 units and
  image selection at five refs. Larger generic locator-bearing Tool results return a bounded summary
  plus refs; image payload delivery continues through the existing normalization, source-byte,
  total-byte and contact-sheet budgets.
- Plain text continues through bounded basic content Read/Write behavior. Native visual input uses
  Pi `ImageContent`; a non-native model proceeds only when the exact Turn has a registered image
  perception Tool. Audio/video require an exact registered perception capability. MIDI/MusicXML,
  generic archives, executables/native binaries and unknown binary bytes now fail the exact Turn
  with class-specific unavailable diagnostics instead of being decoded as text or routed through a
  Desktop reader.
- The Agent sandbox ADR now permits already-authorized bounded local reads, metadata, local OCR,
  image normalization and at-most-five-image overview/detail work without per-step confirmation.
  Widened grants, network or paid perception, significant cost, user code, recursive/bulk unpacking
  and consequential writes require approval. Permission runtime code was intentionally unchanged.

Evaluation disposition is `update`: `agent-runtime.stream-delivery` covers attached EPUB
`input_ref -> ReadDocument -> image_ref -> ReadImage`; `agent-runtime.media-library-content` covers
search-result `image_ref`; `agent-runtime.workflow-controller` covers generated-output `image_ref`;
and `agent-runtime.perception-routing` retains the DeepSeek non-native-vision boundary. Internal Tool
assertions still require canonical locators, so the scenarios prove that short refs are a protocol
projection rather than a second content identity or raw-path fallback.

Verification performed:

- `pnpm --dir packages/agent/runtime typecheck` passed after the Agent protocol implementation. A
  final rerun was externally blocked by a concurrent Canvas change in
  `canvas-host-runtime-contract.ts`, where a string progress stage no longer satisfies
  `GenerationJobStage`; no Agent file appears in that diagnostic.
- `pnpm --dir packages/agent/runtime test` passed 113 files / 1065 tests.
- Focused protocol, AppHost, attachment and message-runtime tests passed 125 tests, followed by 80
  tests after the unused old locator-prompt export was removed.
- `pnpm test:agent:eval` passed 44 files / 294 tests and strict dry-run discovery of 24 suites / 63
  cases. Focused stream-delivery and DeepSeek perception-routing dry-runs each passed one case. These
  are key-free contract/runner results, not provider behavior acceptance.
- `openspec validate unify-agent-launch-and-domain-bindings --strict`, `pnpm check:openspec`,
  `pnpm check:legacy-debt`, Agent/Application/Content boundary checks and `git diff --check` passed.
- `pnpm check:unused` reports only the unrelated existing `activateWorkbenchMainView` export.
  `pnpm check:quality` is externally blocked by concurrent new internal-versioning findings in
  `packages/ai/sdk` and `packages/generation`; this change did not edit or suppress them.

Real visible GPT-compatible and DeepSeek-compatible Desktop calls, and the matching hidden
complete-session runs, remain unexecuted without task 11.7 cost authorization. The non-native image
success path also remains capability-dependent: the current AppHost correctly rejects it unless an
actual `perception.image.understand` provider is registered; no placeholder Tool or alternate model
fallback was added.

## Structured Workspace directory discovery

The Workspace directory-to-content route was qualified on 2026-08-09:

- `ListDirectory` now accepts one normalized Workspace-relative directory, returns at most 80
  immediate entries in stable order and keeps each authorized `workspace-file ContentLocator` only
  in Tool details. Model-visible schema and results contain no absolute path, recursive switch,
  physical locator or shell output. Continuation uses a Conversation-scoped `cursor_ref`.
- The existing `PiContentToolModelProtocol` projects text as `workspace_path`, documents and media
  as `input_ref`, images as `image_ref`, `.nkc/.otio` as owning-domain routes, and unsupported
  score/archive/executable classes as explicit unavailable diagnostics. Reopen reconstructs the
  same bindings from persisted Tool details; no Desktop runtime or generic ResourceRef was added.
- `Read` rejects known non-text formats before reading and enforces one 4 MiB fatal UTF-8/NUL
  boundary for textual and unknown extensions. Directory traversal through a symlink is rejected
  before enumeration. Assets-owned linked Media Library discovery remains separate from the normal
  Workspace walker.
- Format classification is package-owned and shared by directory projection, turn reference
  materialization and Workspace mention presentation. A focused regression caught and fixed the
  `.ts` MIME ambiguity so TypeScript remains text rather than MPEG transport video.
- Agent Runtime focused tests passed 3 files / 47 tests; its full suite passed 114 files / 1086
  tests and typecheck passed. Key-free Agent Evaluation passed 44 files / 294 tests and strict
  discovery of 24 suites / 64 cases, including the new indexed
  `agent-runtime.stream-delivery/directory-format-routing` dry-run. This is harness and contract
  evidence, not real provider behavior acceptance.
- Strict change validation, repository-wide `check:openspec`, `check:legacy-debt`, Agent, Content
  and Application boundary checks, and scoped `git diff --check` passed. The L3 quality review found
  no blocking ownership, dependency, canonical-path, fail-local or user-data issue in this scope.
  `check:unused` now reports only the two pre-existing unrelated exports in `DesktopShell.tsx` and
  `agent-contract.ts`.

Visible UI validation is not applicable because this increment changes no Renderer/Webview layout,
interaction or presentation. Real visible and hidden complete-session provider execution remains
under task 11.7 because no provider/model cost authorization was supplied. Repository-wide
`check:quality` remains externally blocked at `check:no-internal-versioning` by concurrent changes in
`packages/ai/sdk` and `packages/generation`; none of those findings is in this implementation scope.
