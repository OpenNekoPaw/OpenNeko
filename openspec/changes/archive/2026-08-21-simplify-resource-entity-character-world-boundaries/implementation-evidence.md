# Implementation evidence

## 2026-08-12 data-shape qualification

No Character or Entity payload was logged. The audit inspected canonical contracts, repository paths,
test fixtures and production registrations. No sender-bound user Workspace grant was available to this
development task, so it did not recursively inspect arbitrary user projects. The default local metadata
root contained no matching `entities.json`, `characters.json`, Entity operation journal, Entity Asset
requirement or Project composition file at audit time; this is not evidence that user Workspaces contain
no such records.

| Record/path                           | Current accepted shape or writer                                                                                                                                             | Evidence                                                                                                                                                     | Qualification before removal                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `neko/entities.json`                  | `ProjectEntityRecord` requires unrestricted `facts`; optionally accepts Entity Asset `provenance` containing origin/applied revision, import base and representation origins | `project-entity-document.ts` plus Node atomic repository                                                                                                     | per authorized Workspace count records containing non-empty facts/provenance, group fact keys only, preserve source bytes and show record-local unsupported diagnostic |
| `facts`                               | recursive arbitrary JSON value                                                                                                                                               | repository fixtures exercise `role`, `personality`, `availability`, `local-note`, `already` and `skipped`; these are test evidence, not proof of user values | treat every non-empty key as potentially user-authored; do not copy to Chara/World or silently discard                                                                 |
| Entity Asset provenance/package bytes | provenance can be persisted inside `entities.json`; deterministic services create snapshots in memory                                                                        | no production Asset revision reader, publication adapter or service construction exists; services are public exports plus tests                              | preserve any provenance-bearing Entity record; package storage, if discovered through an explicitly authorized Asset owner, remains untouched and unsupported          |
| root `characters.json`                | legacy Character Registry contract and path helper                                                                                                                           | public barrel export exists; no production reader/writer or registration was found                                                                           | leave bytes untouched; remove public code only after poison tests prove no successful reader                                                                           |
| creative Entity composition records   | legacy candidates, providers, requirements, drafts and representation contracts                                                                                              | public barrel export remains; `core/ports`, `representationResolver` and provider contracts still consume selected legacy types                              | first replace those exact consumers with canonical Project Entity/projection contracts; unknown files remain untouched                                                 |
| `neko/entity-operation-journal.json`  | short-lived confirm/merge recovery state containing previous/next Entity documents                                                                                           | Node Inspector runtime                                                                                                                                       | a journal containing superseded record shape must fail visibly; no normal migration or automatic replay into a narrowed contract                                       |
| `neko/project-composition.json`       | Character/World local membership and immutable dependencies only                                                                                                             | Project contract and Node repository                                                                                                                         | add exact Entity/Character association in one canonical shape; do not infer associations from names or existing membership                                             |

The strict Entity contract cannot be enabled until tests prove that an unsupported record remains byte-for-
byte unchanged, a valid sibling remains visible, mutation is blocked for the affected document, and no
automatic association or latest CharacterVersion repair occurs.

Qualification coverage is now anchored by `node-project-entity-repository.test.ts`, which preserves exact
unsupported bytes, returns valid sibling Entities with record-local diagnostics, blocks mutation and keeps
a sibling Workspace usable. Project composition contract/Node tests reject copied Character payload,
name/active/latest fields, preserve an invalid association document and keep a sibling Project repository
usable. These tests do not reinterpret the unsupported bytes and do not add a compatibility reader.

## 2026-08-12 reachability inventory

### Entity Asset

Production/public reachability exists only as declarations and projections:

- `@neko/entity-domain` exports `project-entity-assets`, three Entity Asset services and the lifecycle
  projection from its public barrels.
- `ProjectEntityRecord`, Inspector intent/projection and Webview action code expose provenance,
  instantiate, publish, diff and apply-update.
- SQLite/local-metadata types named `EntityAssetProjection` store candidate, occurrence and binding
  availability rows. Those rows have active consumers but are generic rebuildable Entity projections;
  they must be renamed rather than deleted with Entity Asset lifecycle.
- Desktop initializes those projection tables, but does not construct any
  `ProjectEntityAssetInstantiationService`, `ProjectEntityAssetPublicationService` or
  `ProjectEntityAssetUpdateService`.
- No non-test consumer constructs the three services, supplies `ProjectEntityAssetRevisionReader` or
  `ProjectEntityAssetPublicationAdapter`, or registers an Entity Asset Asset-provider handler.

Atomic deletion boundary: first remove Asset/provenance operations from the Entity document, Inspector
contract/projection/Webview and public barrels; then delete the three services and lifecycle projection;
keep and rename the active generic candidate/occurrence/availability projection owner in the same consumer
switch. Existing workspace and package bytes are never scanned, rewritten or deleted by that operation.

### Entity-owned Character interaction

- Entity contract, Inspector intent service, projection and Webview declare `character-dialogue`,
  `room-open` and `character-embody` using vague Character/Room identities.
- The Assets Resource Browser source supplies only reference-rewrite blockers and never supplies those
  interaction capabilities.
- Desktop constructs `NodeProjectEntityInspectorRuntime` without an interaction port, so a forged raw
  Entity interaction intent fails with an owner-missing diagnostic.
- Desktop and Agent do contain production Character Dialogue/Room/Embody paths, but they are Chara/Agent
  owners and must remain. They are not consumers of the Entity Inspector interaction port.

Atomic deletion boundary: remove only the Entity Inspector operations/port/projection/Webview actions.
Do not remove Chara contracts, Agent entry targets, CharacterRun/Room services or their Desktop wiring.
Replacement actions are added later from an exact Project-owned Entity/Character association and a
Chara-owned exact CharacterVersion handoff.

### Legacy Character Registry and creative composition

- `character-registry.ts` is exported by the Entity domain but has no non-test consumer outside its own
  declaration/barrel.
- The large creative composition contract is exported publicly and selected types are still used by
  Entity `core/ports`, `representationResolver` and provider contracts. It is therefore not safe to delete
  as one file yet.
- Path/adapters still expose legacy `characters.json` and Entity Asset requirement paths, although no
  production Node repository registers a normal reader for those files.

The Character Registry can be removed with its export and poison tests. Creative composition requires a
symbol-by-symbol consumer switch to current identity, binding and projection contracts before its file,
path helpers and adapters can be deleted.

## 2026-08-12 canonical switch evidence

- `ProjectEntityRecord` and `ProjectEntitySemanticSnapshot` now accept only kind, names,
  representations, lifecycle and timestamps; former `facts` and Entity Asset `provenance` are rejected
  record-locally.
- Contract and Node repository tests retain a valid sibling, reject the affected document for mutation,
  preserve the exact source bytes and keep a sibling Workspace usable. No migration, compatibility reader
  or automatic Character association was added.
- Project composition now owns exact `entityId -> characterProjectId` associations. The exact parser rejects
  copied Character payload, name matching, active/current Project inference and latest-version fields;
  association requires an already-linked CharacterProject.
- Entity Asset contract, instantiate/publication/update services, lifecycle projection, public exports,
  Inspector operations and Webview actions were deleted. Resource Browser and Desktop had no production
  Entity Asset capability registration before or after the switch.
- Entity Inspector dialogue, Room and embody operations/port methods/projection capabilities/Webview actions
  were deleted. Existing Chara/Agent dialogue, Room and embody production paths remain untouched. The
  replacement Project-association-to-Chara handoff is exact and Chara-owned; Resources now carries it only
  through the Project-owned linked presentation and does not recreate an Entity interaction operation.
- The unused legacy Character Registry contract, barrel export, `characters.json` path helper and conversion
  adapter were deleted after a repository-wide search found no production reader, writer or registration.
  Existing `characters.json` bytes are not read, migrated or removed. Creative composition remains because
  selected provider/resolution contracts still have real consumers, so task 6.1 is intentionally incomplete.
- `CharacterCreationSourceService` now owns the pre-write review boundary for quick Character creation.
  Manual or Agent-produced draft content, authorized Content locators, exact Asset/resource identities and
  exact ContentProject/ProjectEntity identities are parsed into one `CharacterCreationSourceSelection`.
  Minimal injected owner ports must accept each Content, Asset and confirmed Character Entity selection before
  the service materializes the existing `CharacterCreationSeed` and invokes the same CharacterProject creation
  port. Owner rejection and duplicate source identities stop before the repository write; successful refs are
  owner-qualified and contain no raw file path or copied Entity/Asset facts. The Renderer-facing Character
  Foundation and Project-local contracts now require `sources` and reject the former raw `seed` input; manual
  creation sends an explicit empty selection, while non-empty Content/Entity selections carry exact Workspace
  grants into a tested Desktop adapter. Fresh drafts containing direct representation refs/defaults are rejected
  before review or persistence, and the manual create surface no longer exposes free-text opaque resource fields.
  Asset selections now require an exact Content `package-resource` locator whose package identity matches the
  Asset identity; the current Desktop fails visibly because no manifest-backed representation resolver is yet
  composed. Portable `.neko-character` archive input is poison-tested outside the creator source union. Chara
  (195), Project (40), Chara Webview (15), focused Desktop adapter/AppHost (59) and all affected typechecks pass.
  Resource Browser now offers one explicit project-local creation handoff for exact Content items and confirmed,
  unassociated Project Entities. Its confirmation dialog shows the exact destination and editable Character name;
  Content keeps its typed locator and Workspace grant, Entity selection reuses the exact identity, and successful
  composition opens the CharacterProject in the existing Workspace Character Studio View. Candidate or already
  associated Entities and flat Asset rows do not expose this action. An incomplete four-step result keeps its exact
  receipt in the mounted dialog, removes cancellation and retries only the missing suffix. Character Studio source
  picking and the production manifest-backed Asset resolver remain pending, so task 4.1 is not marked complete or
  presented as a shipped Asset creation flow.
- Project-local Character creation now has one Project-owned sequence: fresh CharacterProject, exact local
  membership, explicit Entity create-or-select and exact Entity-to-Character association. Its receipt records
  only exact identities and the committed step prefix; a failure never deletes or redirects the valid Character,
  membership or Entity, and retry invokes only the missing suffix. Existing-Entity selection requires the exact
  identity and character kind; name lookup is poison-tested. Desktop quick creation uses the same service and a
  Node Entity adapter backed by `ProjectEntityOperationService` plus the canonical Entity repository. Standalone
  Character creation remains Chara-owned and does not require an Entity. Main/AppHost now projects
  `created | incomplete` through one strict IPC contract; preload validates the exact requested target, retry
  validates the original Workspace/Content Project/CharacterProject/Entity identities, and the Character
  creation surface retains a localized explicit “retry missing step” action instead of starting another draft.
  Project, AppHost and Webview tests cover partial-prefix rejection, cross-authority/redirect rejection and the
  user-visible repair action, completing task 4.2.
- Chara now owns one exact product-handoff contract for Open Character, Open Studio and Start Interaction.
  Project exposes a host-neutral projection that first requires the exact Entity-to-Character association and
  then delegates handoff construction to Chara. Open Character and Open Studio carry only the associated
  CharacterProject identity; Start Interaction is absent until the caller supplies an exact CharacterVersion.
  Reserved selectors such as `latest`, `current` and `head`, copied Character payload and missing association
  are poison-tested. One invalid Entity lookup does not affect a valid sibling association. Repository-wide
  reachability checks find no remaining Entity-owned dialogue, Room or embody production contract/handler;
  remaining `character-dialogue` references are Chara/Agent-owned launch paths, completing task 4.3 without
  adding a generic Entity interaction fallback.
- Resource Browser now has one canonical `ResourceBrowserSource` contract carried as `source` through Domain,
  Node, Desktop and Webview. The replaced `facet` field/type, UI class and presentation snapshot property have
  no retained compatibility reader or dual path. The user-visible filters are Project Files, Shared Media,
  Installed Assets and Project Elements; these remain presentation selectors over their original Content,
  Media connection, Asset and Entity owners. Existing exact operations, per-source selection, loaded container
  state, diagnostics and fail-local behavior remain covered by Assets Domain (145), Assets Node (79), Assets
  Webview (62) and focused Desktop (80) passing tests, completing task 5.1. The source values remain compact
  internal selectors and do not convert owner identities or create a cross-owner catalog.
- Project now owns a read-only Entity/Character resource projection built from the exact Content Project
  composition plus the matching project-local Chara catalog. Resources merges that projection into the existing
  Entity item, so a linked pair remains one visible card while preserving `entityId`, `characterProjectId`,
  project-local placement, record-local availability and Chara-declared Open Character/Open Studio handoffs.
  Character display-name search resolves to that same item. Invalid or missing Character records become
  `needs-attention` on only the affected association; valid siblings remain usable. Published version count is
  presentation-only: the projection never chooses a CharacterVersion, never emits Start Interaction, and strict
  codecs poison-test copied Character facts, generic mutations, cross-Entity association and `latest` selectors.
  Desktop supplies the production reader from the authorized Workspace, exact Project composition and matching
  project-local Chara repository. Project (40), Assets Domain (147), Assets Node (80), Assets Webview (64)
  and Desktop production-reader/delegation (26) tests plus all affected typechecks pass, completing task 5.2.
  Clickable Chara navigation, exact version choice,
  standalone/external placement and visible Electron evidence remain tasks 8.2/8.3.

## 2026-08-12 focused quality and UI disposition

- Package typechecks/tests and Desktop focused tests listed in the delivery summary pass; application-boundary
  audit and strict OpenSpec validation pass.
- The project-local creation and exact Chara handoff increments pass Project typecheck plus 36 tests, Chara
  typecheck plus 188 tests, Entity domain typecheck plus 72 tests, Entity Node typecheck plus 30 tests, Agent
  Webview build plus 6 focused creation tests, Desktop typecheck
  and the exact AppHost delegation/retry test. The full
  Desktop suite is not green: three existing `desktop-agent-resource-display-projector.test.ts` expectations
  still assert `renderUri` while the current projection returns `previewDescriptor`; that separate dirty-worktree
  mismatch was not hidden or rewritten as part of Character creation. A full-suite run during the Resources
  source switch also timed out one Resource Browser test under aggregate load; the exact eight affected Desktop
  files pass independently with 80 tests, including that test.
- `pnpm check:legacy-debt` passes with zero blocking production classifications.
- `pnpm check:application-boundaries` passes across 1,680 files. Strict OpenSpec validation and
  `git diff --check` pass.
- `pnpm check:unused` is blocked by pre-existing unused declarations in `packages/agent/webview/package.json`
  (`@neko/generation`) and `apps/neko-desktop/package.json` (`@earendil-works/pi-ai`); this change did not add
  either declaration.
- The internal-versioning audit is blocked by broad pre-existing allowance/baseline drift in the current dirty
  worktree. The focused output contains no occurrence in the new linked-resource projection; no allowance
  registry or baseline was rewritten as part of this change.
- UI validation is applicable to Entity Inspector, Resources source filters and the Character target creation
  repair state.
  Browser-owned component tests prove candidate confirmation, blockers, the absence of Facts, Provenance,
  Publish, Dialogue, Room and Embody controls, and a visible localized retry action after a typed partial
  Project-local Character creation result. Project contract tests and the focused Desktop AppHost test prove
  that retry keeps the original Workspace, Content Project, CharacterProject and Entity identities. Assets
  Webview tests prove the four revised source labels, source switching and independent retained selection. The
  linked-card test additionally covers one combined Entity/Character item, exact identities, project-local
  placement, Chara handoff labels, explicit version-selection messaging and a transition to needs-attention that
  removes usable handoffs. The new Resource creation tests cover destination/name confirmation, incomplete-state
  retention, exact retry and exclusion of already-associated Entity rows; focused Desktop tests prove exact
  Content/Entity authority forwarding, no Asset-row bypass, and Studio opening only after complete composition.
  A fresh darwin-arm64 Desktop package succeeds. The isolated visible Electron
  `resource-browser-invalid-entity-document` and `resource-browser-entity-management` scenarios now pass. The
  latter uses the same Files helper without its independently covered Cut workflow, and fixes the shared CDP
  input helper so its declared replacement behavior sends Chrome's trusted `selectAll` edit command before
  Backspace; the focused runner contract passes 14 tests. Its report at
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-12T17-14-25.095Z-resource-browser-entity-management-development/report.json`
  records no console error, warning or runtime exception. All ten screenshots were opened and inspected
  directly: full and narrow Files menus fit; candidate, confirmed and missing-binding states are readable; the
  confirmation dialog exposes the exact source and Workspace destination; and Character Studio opens one
  `MIO Companion` project with the exact project-local association visible. No clipping, overlap or unreadable
  state was observed. The two separately projected reference-owner blockers currently repeat the same English
  sentence in the Chinese Inspector; that is a non-blocking copy refinement rather than a boundary or lifecycle
  failure. Together with the owner/delegation/lifecycle, seed, exact-handoff, missing-resource and stale-usage
  package tests above, this completes task 8.3.
- Quality review classifies this increment as L4 because it changes a core creative workflow, public Project
  and Resources contracts, typed Desktop IPC and visible UI. No blocking finding was identified in the focused owner,
  producer/consumer, fail-local repair and removed-path checks. The repair receipt is retained by the currently
  mounted creation surface rather than a durable Project record; once a partial result is displayed, cancellation
  is removed so the exact retry remains visible while the surface stays mounted. Unmounting still loses the
  convenience action but does not delete, redirect or rewrite any successfully committed Character, membership,
  Entity or association fact.

## 2026-08-13 Project Content completion evidence

- `@neko/project` now owns the strict, read-only Project Content contract and composition service. Its projection
  has four disjoint groups: associated Characters, real WorldProjects, unassociated confirmed Entity elements
  and Entity candidates. Contract and service tests reject copied domain payload, scope mismatch, generic
  mutation data and unknown fields. Projection tests prove a linked Character appears exactly once, a
  scene/location Entity is not promoted into a World, and displaying a candidate does not confirm it.
- Resources now has one canonical three-source contract: Files, Media and Assets. Entity source, intent, handler,
  reader, inspector, association UI and Desktop adapter were removed together. The obsolete Assets-owned
  `resource-browser-entity-management` and `resource-browser-invalid-entity-document` Electron scenarios were
  deleted; their still-valid Files creation coverage remains as the renamed
  `desktop-workspace-file-creation.mjs` scenario. Repository scans find no retained scenario ID, Entity Inspector
  selector or old functional filename below Assets Webview and Desktop functional registration.
- Project Content uses the existing sender-bound `projectAuthoring` bridge. Preload parses the canonical request
  and result, AppHost validates exact window, renderer session, Workspace grant and registered Content Project,
  and Main injects only Project composition, Character catalog, World catalog and Entity projection readers.
  Aggregation policy stays in `ProjectContentService`; reading the view does not trigger Entity discovery or
  mutation. The default Project Main View is `project-content`; Canvas remains an explicit view.
- Focused verification passed: Project 49 tests, Project Webview 8, Assets Domain 138, Assets Node 79, Assets
  Webview 60, Host 312, Desktop 178, all affected typechecks, package/application/product-status boundaries,
  legacy-debt, strict OpenSpec validation and `git diff --check`. A fresh darwin-arm64 Desktop package completed.
  `check:unused`, `check:no-internal-versioning` and `smoke:webview` retain the unrelated or upstream failures
  recorded in `tasks.md`; they are not reported as successful gates.
- UI validation is applicable and passed for the implemented empty Project Content path. The authoritative
  visible Electron scenario report is
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-13T01-46-32.082Z-project-content-development/report.json`.
  It traverses the production preload/Main/renderer path, verifies four ordered groups and three Resources
  sources, checks `1440x900` and the supported minimum `960x640` without document or root overflow, then
  navigates to All Projects and proves the Project Content Root is unmounted. Both PNG artifacts were opened and
  inspected directly: hierarchy, spacing, labels and empty states are readable with no overlap or clipping. The
  report records no console error, warning, runtime exception or poisoned resource request. Dense rows and
  record-local diagnostics remain component-test evidence rather than visible Electron screenshot evidence.
- Quality review classifies the Project Content increment as L2: it changes a shared Project contract and
  renderer/preload/Main messaging, but introduces no new persistence owner or domain mutation. Responsibility,
  dependency direction, interface shape, extension ports and package/IPC/Electron coverage align with the local
  Desktop architecture. The remaining OpenSpec task is the explicitly authorized real provider-backed Character
  flow; it was not run without provider, model and cost authorization. Asset cloud and complete World
  authoring/runtime are outside this change.

## 2026-08-13 visible Character provider acceptance

- Evaluation disposition is `update` for the existing
  `skill.character-creator/reviewable-character-proposal` case. The canonical path is visible Electron, the
  ordinary composer, Desktop-owned complete Session runtime, exact builtin Character Creator activation and the
  configured real provider. Forbidden paths are a mock provider, direct turn runner, hidden UI, inferred model,
  copied Skill metadata, `chara.character.fillDraft` mutation and fallback provider/source.
- The canonical `~/.neko/config.toml` parser selected enabled `nekoapi-chat / gpt-5.6-luna`; provider, model and
  cost were explicitly authorized for each real invocation. No secret was read, copied or recorded. Key-free
  validation passed 45 files / 308 tests and all 26 suites / 76 cases dry-run before the final invocation; these
  remain infrastructure evidence rather than behavior acceptance.
- Real execution first exposed three fail-visible observability/UI defects. Initial Turn facts completed in the
  Conversation authority before the visible Session projector existed, so the later connection could not read
  the Turn identity. A connection-neutral store now owns the exact record while each projector retains its own
  connection/disposal projection; unit and Desktop integration tests prove the later Session sees the initial
  Turn, the current connection identity is projected, disposal does not mutate the shared record and a sibling
  Conversation does not match. Explicit Skill execution previously produced no receipt because only a later
  model-selected `read_skill` Tool result was observed. Pi now emits `skill.activated` only after the exact
  snapshot activation succeeds; stale activation emits nothing, Timeline ignores this non-visual fact and the
  facts projector records the exact source/fingerprint. MessageList also disabled TanStack Virtualizer's internal
  lifecycle `flushSync`; React now schedules measurement updates while the existing viewport/scroll behavior is
  retained and component-tested.
- The final visible provider-backed run passed at
  `reports/agent-eval/character-creator-visible-final-2026-08-13/skill.character-creator/reviewable-character-proposal/focused-1-msrcky3q-r1/result.json`.
  Requested and effective model identities are both `nekoapi-chat / gpt-5.6-luna`; the Skill receipt matches
  builtin fingerprint `sha256:5013de13b4bc6bbff342615e875b7d471022a7a7fc994cb8583513a21feaf6a8`;
  assistant binding, terminal completed state, non-empty reviewable answer and no
  `chara.character.fillDraft` all pass. Usage is 6,581 input tokens, 1,301 output tokens, zero retries and
  provider-reported USD 0. The adjacent Desktop report is
  `reports/agent-eval/character-creator-visible-final-2026-08-13/focused-1-msrcky3q-r1/desktop-functional.json`;
  it records successful composer submit, exact terminal Turn identity, zero console errors, zero warnings, zero
  exceptions and no poisoned resource request.
- Agent foundational-matrix disposition for this focused change: initial Conversation submit/terminal completion,
  initial-Turn-to-Session handoff and sibling Conversation fact isolation are directly covered; ordinary later
  Turn projection remains covered by the existing Desktop composition tests. Context compaction continuation,
  full owner/application reopen, restored generation records and multi-Conversation UI switching were not rerun
  with a real provider because this change does not alter their persistence, queue or navigation owners. Their
  existing deterministic coverage remains, with real-provider rerun retained as release-level residual risk.
- UI validation is applicable. Functional and adjacent-regression checks passed for normal composer submit,
  thinking/streaming MessageList updates and final response presentation; the authoritative visible Desktop report
  proves the complete path and no runtime diagnostic. MessageList's 26 component tests protect virtual measurement
  configuration, viewport restoration, follow-tail/detached scrolling and adjacent transcript presentation. The
  Evaluation report contains no screenshot artifact, so the new Character transcript pixel-level visual check is
  blocked rather than inferred from DOM/runtime success; typography and responsive layout are not newly claimed by
  this acceptance. The earlier Project Content screenshot review remains the visual evidence for the
  resource/entity grouping surfaces.
- Local Asset provider-backed checks were not selected and remain unavailable residual risk. Asset cloud and
  complete World authoring/runtime are outside this change. Task 9.3 is complete without substituting mock or
  hidden execution for those unexecuted areas.
