## Canonical boundary reconciliation

This change consumes the following existing canonical owners and does not introduce parallel handlers:

| Responsibility             | Canonical owner and contract                                                                  | Canonical producer/handler                                                          | This change                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Directory authority        | `@neko/host` `DesktopWorkspaceGrantAuthority` and sender-bound Workspace grant contracts      | Desktop Host adapter resolves one exact authorized root                             | Consumes the grant; adds no raw-path or Chara grant contract                                |
| Workspace authoring target | Agent/Project Authoring binding with `{ kind: 'character-project', characterProjectId }`      | canonical Workspace target selection and exact binding validation                   | Contributes only `CharacterAuthoringSurface` for the selected target                        |
| Character Creator          | Agent-owned builtin `character-creator` plus operation-level destination chooser              | standard Agent Entry/Composer, `CharacterRoleSkillPrimitivePorts` and Tool approval | Adds a management navigation handoff; does not add a provider, Composer or mutation handler |
| Character draft mutation   | `@neko/chara/application` `CharacterAuthoringService`                                         | exact fresh `CharacterProject` repository operation                                 | Reuses the same service and file repository                                                 |
| Character launch           | Chara exact `CharacterVersion` launch validation plus canonical Agent Conversation/Turn owner | Character Conversation launch service and Agent launch/session services             | Adds lineage presentation and exact selection only                                          |

Adjacent task reconciliation:

- `unify-domain-authoring-workspaces` remains the owner of Workspace grant, AuthoringTarget, target switching and file-backed domain authoring.
- `separate-companion-and-narrative-character-conversations` remains the owner of exact Character runtime binding and `character-creator`. Its completed task 5.15 owns global/project-local destination selection; pending task 5.11 owns only secondary validation/improvement helpers and is not duplicated here.
- `unify-skill-creator-authoring-targets` remains the owner of generic Skill package creation in the exact Agent Workspace and supplies no Character-specific route.
- This change owns Character management-to-Agent navigation, Character version lineage, portable package, read-only management detail and the Chara surface contributed to Workspace Authoring.

## Existing record inventory and user-data qualification

Current canonical file authoring records are:

```text
neko/characters/<characterProjectId>/project.json
neko/characters/<characterProjectId>/versions/<characterVersionId>.json
neko/characters/<characterProjectId>/authoring-tests/<authoringTestSnapshotId>.json
```

The file repository currently has no lineage record. Therefore, before this change writes lineage, every valid existing CharacterVersion is classified as an unlinked version and the per-root `missingLineageVersionCount` equals the number of valid versions read from that exact authorized root. Invalid sibling records remain in place and are reported separately. No user root or Character payload was inspected while preparing this evidence because the CLI process has no sender-bound Workspace authorization.

Before rollout against user data, the owning repository must run a read-only, per-authorized-root qualification that records counts only:

- valid CharacterProjects, CharacterVersions and authoring-test snapshots;
- invalid record counts grouped by record kind without payload logging;
- CharacterVersions with no declared lineage relation;
- duplicate CharacterVersion identities across CharacterProject directories;
- exact inbound reference counts grouped by owning domain.

Qualification must not infer parents, rewrite immutable versions, move files, clear invalid records or enumerate outside registered roots. A corrupt future `lineage.json` is a record-local diagnostic, while a missing file is the canonical fresh state with all existing versions visible and unlinked.

Exact version consumers currently include Character Conversation launch/binding, Room participants, CharacterStorylineVersion, Companion memory provenance and Project external dependency refs. They continue to consume one immutable `characterVersionId`; lineage never resolves a replacement head for them.

## Frozen public names and layouts

Public domain names for this change are:

- `CharacterVersionRelation`, `CharacterVersionLineage`, `CharacterVersionLineageRepository`;
- `draftBasisCharacterVersionId` as a stable optional CharacterProject domain fact;
- `CharacterVersionGraph`, `CharacterVersionComparison`, `CharacterVersionReferenceInventory`;
- `CharacterManagementDetailSurface`, `CharacterAuthoringSurface`;
- `CharacterPortablePackageManifest`, `CharacterPortablePackagePreview`;
- management quick-create intent targeting the existing `character-creator` activation.

No independent Character Studio controller, Workspace kind, contract generation or schema/format version is introduced.

Canonical live layout:

```text
neko/characters/<characterProjectId>/
  project.json
  lineage.json
  versions/<characterVersionId>.json
  storylines/<characterStorylineId>/storyline.json
  storylines/<characterStorylineId>/draft.json
  storylines/<characterStorylineId>/versions/<characterStorylineVersionId>.json
  authoring-tests/<authoringTestSnapshotId>.json
  assets/... # explicitly localized Character-owned copies only
```

Canonical transport layout:

```text
manifest.json
character/project.json
character/lineage.json
character/versions/...
character/storylines/...
character/authoring-tests/...
assets/... # manifest-declared embedded entries only
```

The portable manifest inventories records, embedded assets and external dependencies; it does not duplicate Character definitions and never becomes a live repository or runtime authority.

## Batch 1 quality evidence

Risk classification: L2. This batch changes public Chara contracts and the Node Workspace file boundary, but does not change Renderer, preload, Desktop composition or visible UI.

Implemented:

- strict CharacterVersion lineage/relation codecs with first-phase multi-parent rejection;
- stable optional `draftBasisCharacterVersionId` semantics and exact historical-version draft continuation with explicit replacement;
- reconstructable lineage graph and grouped immutable version comparison projections;
- one canonical `lineage.json` file repository path with atomic writes and no-follow regular-file reads;
- strict portable package manifest/inventory codecs for records, embedded assets and external dependencies.

Verification:

- `pnpm --filter @neko/chara typecheck` — passed;
- `pnpm --filter @neko/chara test` — 35 files, 177 tests passed;
- `pnpm --filter @neko/chara-node typecheck` — passed;
- `pnpm --filter @neko/chara-node test` — 5 files, 24 tests passed;
- `pnpm check:application-boundaries` — passed, 1,673 files checked;
- `openspec validate refine-character-management-authoring-and-version-graph --strict --no-interactive` — passed;
- `git diff --check` — passed.

Repository-wide `pnpm check:no-internal-versioning` and `pnpm check:unused` remain red because the shared dirty worktree contains unrelated stale allowance hashes/new occurrences and unrelated unused Agent Webview/Desktop dependencies. The focused audit introduced no internal schema/format generation and the new CharacterVersion identifiers are user-managed domain version facts. These unrelated failures were not modified or hidden.

Residual risk for the next batch:

- publication is not yet atomically followed by lineage relation persistence/partial diagnostic;
- the graph service has not yet implemented edge-local recovery for a cyclic persisted aggregate, so task 4.1 remains open;
- ZIP bytes are not yet read or written; only the strict manifest boundary exists;
- no user-visible UI changed, so UI validation is not applicable to this batch.

## Batch 2 portable ZIP evidence

Implemented a byte-oriented `@neko/chara-node` transport adapter using `@zip.js/zip.js`. It accepts only explicitly supplied canonical records, embedded asset bytes and external dependency declarations; it has no Workspace discovery, raw-path or runtime API.

Writer invariants:

- strict manifest is derived from selected inputs with SHA-256 integrity and byte lengths;
- records are decoded through their canonical Chara codecs before archive completion;
- safe relative paths are unique and entries are emitted in deterministic lexical order;
- entry count, individual bytes, total expanded bytes and final archive bytes are bounded.

Reader invariants:

- rejects unsafe/absolute/backslash paths, duplicate names, directories, symlinks, encrypted entries, excessive entry/expanded/archive sizes and suspicious compression ratios before installation;
- requires one strict `manifest.json`, rejects undeclared or missing entries and verifies exact byte length/digest;
- decodes every declared Character record with its canonical codec and checks record and CharacterProject identities;
- returns validated bytes only and never writes a Workspace, starts a runtime or resolves an external dependency.

Focused verification after implementation:

- `pnpm --filter @neko/chara-node typecheck` — passed;
- `pnpm --filter @neko/chara-node test` — 6 files, 28 tests passed, including self-contained Live2D, external voice, traversal, undeclared-entry, digest, resource-limit and symlink cases.

## Batch 3 usable-version lineage evidence

The existing `CharacterAuthoringService.publish` operation is now the single lineage-aware usable-version producer. It validates the exact draft basis before publication, reads and validates the candidate lineage before storing the version, stores the immutable CharacterVersion first and then writes only the zero-or-one-parent relation derived from that exact basis. A missing lineage repository fails before version storage; there is no retained lineage-free successful publication route.

If the second write fails, the service returns `lineage-write-pending` with the exact version and relation. The immutable version remains readable and appears as an unlinked graph node; no deletion, forged relation or automatic retry occurs. `retryLineage` is an explicit idempotent operation and does not create the CharacterVersion again.

The graph projection now exposes root-to-parent ancestor identities and diagnoses/excludes each cyclic child relation while retaining the involved versions as unlinked nodes and rendering valid sibling branches. Strict lineage persistence still rejects cyclic aggregates before a write.

Additional Node evidence covers identical lineage layout across standalone/project-local authorities, missing and corrupt records, sibling isolation, no-follow reads, failed atomic replacement cleanup and the absence of chronological/file-order inference.

Focused verification:

- `pnpm --filter @neko/chara typecheck` — passed;
- `pnpm --filter @neko/chara test` — 35 files, 181 tests passed;
- `pnpm --filter @neko/chara-node typecheck` — passed;
- `pnpm --filter @neko/chara-node test` — 6 files, 30 tests passed.
- `pnpm --filter @neko/app-desktop typecheck` — passed;
- `pnpm check:application-boundaries` — passed, 1,674 files checked;
- `openspec validate refine-character-management-authoring-and-version-graph --strict --no-interactive` — passed;
- `git diff --check` — passed.

Desktop Foundation and Workspace Character authoring composition inject the exact file repository as both publication and lineage authority. Legacy SQLite runtime fixtures use a test-local lineage port only to construct exact runtime records; no SQLite lineage production path was added.

Residual integration risk: the current Host contract does not yet project the typed partial-commit diagnostic and retry operation into Renderer UI. The application operation and exact retry behavior are implemented, but tasks 7.4 and 5.5 remain responsible for the typed Desktop wiring and visible recovery action.

Full Desktop Vitest ran 102 files: 101 files and 670 tests passed; three failures in `desktop-agent-resource-display-projector.test.ts` expect the prior `renderUri` projection while the shared dirty worktree currently produces `previewDescriptor`. That adjacent Agent/Preview assertion drift is unrelated to the two Character repository injections and was not modified or hidden.

`pnpm check:no-internal-versioning` self-tests passed, while the repository audit remains red from the shared dirty worktree's stale allowance hashes and 213 new occurrences across Agent/Desktop/Character continuity work. The occurrences in this batch use user-managed CharacterVersion domain identities inside the Chara owner; no schema, format, contract generation or dispatch field was added.

## Batch 4 directory Storyline and localized-asset evidence

The canonical `CharacterAuthoringFileRepository` now implements the existing `CharacterStorylineRepository` and a narrow `CharacterLocalizedAssetRepository`. Both standalone-library and Content Project authorities use the same owner-qualified relative records under `neko/characters/<characterProjectId>/...`; no SQLite, active-root or package-backed authoring route was added.

Storyline reads and writes validate the exact CharacterProject, CharacterStoryline, CharacterStorylineVersion and referenced CharacterVersion ownership. Immutable StorylineVersion and localized-asset conflicts are idempotent for equal bytes/facts and fail visibly for different content. Localized assets accept only safe relative paths, use no-follow bounded reads and atomic writes, and require an existing exact CharacterProject. The Character definition continues to retain its opaque `asset:` representation ref; localizing bytes does not rewrite it.

Focused verification:

- `pnpm --filter @neko/chara typecheck` — passed;
- `pnpm --filter @neko/chara test` — 35 files, 181 tests passed;
- `pnpm --filter @neko/chara-node typecheck` — passed;
- `pnpm --filter @neko/chara-node test -- character-authoring-file-repository.test.ts` — 6 files, 31 tests passed;
- the placement matrix verifies identical standalone/project-local paths for project, usable version, authoring test, Storyline metadata/draft/version and localized Live2D bytes;
- traversal, symlink, byte-limit and immutable overwrite rejection are covered;
- `git diff --check` — passed before recording this evidence.

This task extends the live directory repository only. ZIP-to-Workspace preview/commit remains task 3.5, and Desktop wiring remains task 7.4; neither is represented as an alternate repository or runtime authority.

## Batch 5 Character authoring surface evidence

`CharacterAuthoringSurface` now consumes one target-bound `CharacterAuthoringSnapshot` instead of reconstructing a partial Foundation/runtime snapshot. The canonical snapshot carries the exact CharacterProject, local usable CharacterVersions, CharacterStoryline metadata/drafts/publications and immutable authoring-test snapshots. Its command contract permits only Character definition/review/finalization, Storyline authoring and authoring-test capture for the exact target; memory, relationship and runtime commands are absent.

`CharacterAuthoringHostService` composes `CharacterAuthoringService` and `CharacterStorylineService` over the same exact project-local directory repository. Snapshot reads and commands carrying a CharacterProject identity are rejected before storage access when they target another project, and Storyline commands without a duplicated project field are checked against the target snapshot before execution. The Webview no longer uses an `authoringOnly` rendering flag: definition, representation/voice, Storyline, test and local usable-version controls are mounted directly, while continuity, relationship-memory and runtime inventory sections were removed from the authoring surface. Storyline deletion now requires an explicit second confirmation before the command is sent.

Focused contract/service tests cover target-bound Storyline and authoring-test operations, cross-target rejection and canonical snapshot projection. Webview tests cover Storyline/test visibility, absence of runtime and memory review, test-snapshot capture and lifecycle unmounting.

## Batch 5 portable application workflow evidence

`CharacterPortablePackageService` is a host-neutral Chara application workflow over one exact authorized `CharacterPortableWorkspaceRepository` and one bounded archive port. Export always reads the exact CharacterProject plus all of its immutable CharacterVersions and exact lineage, then adds only explicitly selected Storylines, authoring tests and localized asset files. Opaque representation refs remain in Character facts; representations without selected bytes are projected as external dependencies.

Import decodes the already bounded archive result, validates cross-record ownership and closed CharacterVersion/Storyline references, checks the exact repository placement, and returns a strict `CharacterPortablePackagePreview` with branch heads, unlinked versions, Storylines, embedded assets, external dependencies and exact identity conflicts. Commit revalidates the archive and preview, rejects any different existing fact, installs only through the canonical directory repository and returns an exact CharacterProject identity. It does not overwrite, merge, remap, infer another Workspace or create a runtime.

The Node archive port opens and closes the ZIP reader within each call. Preview and commit retain no package identity, raw path, reader, mount, watcher or synchronization state. Interrupted canonical writes return `CharacterPortableImportWriteError` with the exact records already installed; the same package and destination can be retried idempotently without rollback or forged success.

Focused verification:

- `pnpm --filter @neko/chara typecheck` — passed;
- `pnpm --filter @neko/chara test` — 35 files, 183 tests passed;
- `pnpm --filter @neko/chara-node typecheck` — passed;
- `pnpm --filter @neko/chara-node test` — 7 files, 35 tests passed;
- real file-repository plus real ZIP tests cover multi-branch export/import, StorylineVersion refs, embedded Live2D bytes, external voice inventory, exact mutable identity conflict, destination-scope mismatch and interrupted-install retry.

Desktop sender-bound source/destination file selection remains task 7.4. The application service accepts only the exact repository capability and archive bytes supplied by that future Host adapter; no Renderer raw-path contract was added.

## Batch 6 quality correction: localized asset binding remains open

The L3 post-implementation review found that storing embedded bytes under `assets/` is insufficient by itself: after the one-shot ZIP reader closes, no canonical live record currently associates the exact opaque `resourceRef` and representation with the imported entry file/tree. Treating file presence or the released ZIP manifest as that association would create an implicit fallback or a transport-backed runtime authority.

Tasks 3.2 and 3.5 are therefore reopened. The next implementation batch must add one Chara-owned `localized-assets.json` binding aggregate, validate exact representation/resource ownership, make export consume those bindings, and commit imported files before the binding. Unbound partial bytes remain locally diagnosable but unavailable; retry may finish the exact binding without overwriting different facts. Existing Storyline persistence, ZIP containment, preview/conflict logic and tests remain valid groundwork, but the package cannot yet be described as self-contained after installation.

Quality commands at this correction point:

- `pnpm check:application-boundaries` — passed, 1,676 files checked;
- `pnpm check:storage-authorities` — passed, 1,680 sources checked;
- `pnpm check:legacy-debt` — passed with zero blocking production debt;
- `pnpm check:no-internal-versioning` — self-tests passed, repository audit remained red because the shared dirty worktree has stale allowances and 246 new occurrences across unrelated Agent/Desktop/continuity work; no internal schema/format generation was added by the portable package code;
- `pnpm check:unused` — red only for unrelated existing `@neko/generation` and `@earendil-works/pi-ai` manifest entries.

## Batch 7 Character Creator management handoff evidence

The missing runtime capability was not Character draft mutation: `@neko/chara` already owns
`chara.character.fillDraft`, and the Agent turn snapshot correctly exposes it only after an exact
CharacterProject authoring receipt exists. The missing link was a typed Character Management handoff
to one fresh canonical Agent Draft and its exact builtin Character Creator catalog entry.

Implemented canonical path:

```text
Character Management Quick generate
  -> Host open-agent-entry transition and exact returned draftId
  -> CharacterCreationHandoffIntent (exact builtin source + management return identity)
  -> existing Agent Entry authoring destination chooser
  -> exact fresh CharacterProject receipt
  -> existing chara.character.fillDraft Tool and standard Tool approval
  -> Chara-owned open-character/open-character-studio result handoffs
```

The handoff contract rejects same-named personal/project Skills and unknown return targets. Agent
Webview resolves the builtin through the authoritative launch catalog and submits its exact
`catalogEntryId`, `skillName` and `activationId`; Skill metadata or prompt text grants no Tool access.
Desktop stores the intent against the Host-returned draft identity and injects it only into that
Draft. Cancellation returns to Assistant and creates no Character or Project fact.

`character-creator/SKILL.md` remains method/output guidance only. Chara capability prompt and Tool
schema retain authoring lifecycle, exact-target availability, mutation and diagnostics. A missing
target now reports that the current Conversation has no writable Character draft target and does not
misstate CharacterVersion publication as a capability that may appear later.

Successful `fillDraft` results project exact `View character` and `Open Studio` product handoffs.
`View character` uses the canonical Creative Management transition followed by exact detail
selection. `Open Studio` remains visible but disabled because Host does not yet expose one canonical
CharacterProject-to-directory-authorized Workspace Authoring transition; guessing a current/recent
Workspace would violate the target authority contract. Tasks 6.3, 7.1 and 7.2 therefore remain open.

Task 6.2 also remains open. The implementation preserves prompt and authorized reference receipts
and reuses the only existing operation-level fresh-target chooser, but that chooser is currently the
Agent Entry `authoring` mode. The task text says not to change Entry mode. A second Character-specific
chooser path was not added to hide this artifact conflict.

Focused verification:

- `@neko/agent-contracts`: 45 files, 281 tests passed; typecheck passed;
- `@neko/chara`: 37 files, 195 tests passed; typecheck passed;
- `@neko/chara-webview`: 4 files, 16 tests passed; typecheck passed;
- `@neko/agent-webview`: 102 files, 778 tests passed; build passed;
- focused Desktop renderer tests: 3 files, 106 tests passed; Desktop typecheck passed;
- `pnpm test:agent:eval`: 45 files, 307 tests passed; all-suite dry-run selected 26 suites / 76 cases;
- Character Creator Evaluation fingerprint coverage: 2 tests passed;
- `pnpm package:desktop`: passed for darwin-arm64;
- strict OpenSpec validation and `git diff --check`: passed.

Agent Evaluation disposition is recorded in `evaluation.md`. The ordinary proposal case was updated
to the current Host fingerprint. A real quick-create positive case is infrastructure-blocked because
the external Evaluation workflow has no product-neutral Character Management transition or exact
Character authoring target creation/binding operation. Key-free harness success is not real Agent
behavior evidence.

UI validation is advisory `blocked`. The visible development scenario could not acquire the checkout
Vite bundle because an existing user-owned Desktop process holds it. A freshly built packaged fixture
and a manual isolated packaged launch both remained before renderer/CDP readiness, so no trustworthy
wide/narrow screenshot was produced or visually judged. Component and Desktop path tests remain
functional evidence only, not visual acceptance. The result accessory success state also cannot yet
be reached through the provider-free scenario.

The full Desktop package test has three unrelated failures in
`desktop-agent-resource-display-projector.test.ts`: the shared dirty worktree now projects
`previewDescriptor` while those existing assertions still expect `renderUri`. They were not changed
or treated as passing evidence.

## Batch 8 correction: builtin identity, transactional handoff and real UI evidence

Visible Computer Use exposed a contract mismatch hidden by the earlier fixture: Character Management
encoded the logical builtin identity with `sourceId: "character-creator"`, while the authoritative
Agent launch catalog uses `sourceId` for the current Skill package fingerprint. The ordinary
`$skill-creator` path succeeded because it consumed the catalog entry directly; Character quick
generation failed before target selection because it compared the fingerprint with a logical name.

The canonical handoff contract now carries only the stable logical identity
`{ name: "character-creator", source: { kind: "builtin" } }`. After the Draft is configured for
authoring, Agent Webview resolves that logical identity against the authoritative catalog and locks
the exact current `catalogEntryId`, fingerprint-backed source receipt and activation id. Same-named
personal/project Skills remain ineligible. Catalog fingerprints no longer leak into the management
intent, and the contract rejects a `sourceId` field as unsupported.

Handoff consumption is now transactional. The intent is reported consumed only after authoring
configuration succeeds and the exact builtin entry is present and executable. A pending intent is
deduplicated across Renderer rerenders; stale async completion is ignored after Draft/intent change;
configuration failure leaves the Shell handoff unconsumed and creates no target. Prompt and
authorized references are applied only after the successful configuration boundary.

User-visible Character Creator availability/executability diagnostics, the global Agent error title,
and invalid Character Tool-result handoff diagnostics now use the existing English/Chinese locale
catalogs. Skill prompt content remains one canonical portable `SKILL.md`; locale-specific product
labels and diagnostics stay in presentation catalogs, while a Skill follows the user's requested
language at execution time. Duplicated language-specific Skill packages were not introduced.

Agent Evaluation change selection now recognizes canonical builtin content under
`packages/skills/skills/<name>/`, current Pi Skill runtime files, the Character handoff contract and
the Agent Webview handoff consumer. These paths select `skill.<name>`,
`agent-runtime.skill-runtime` and `agent-runtime.launch-binding` instead of failing with
`unmapped-coverage`.

Focused verification after the correction:

- `@neko/agent-webview` `ConversationController.test.tsx`: 63 tests passed; full package 102 files / 783 tests passed; build passed;
- `@neko/agent-contracts` Character handoff tests: 5 passed; typecheck passed;
- Desktop `DesktopAgentSurface.test.tsx` + `DesktopShell.test.tsx`: 53 passed; typecheck passed;
- Agent Evaluation change selector: 7 tests passed;
- `pnpm test:agent:eval`: 45 files / 309 tests passed; all-suite dry-run selected 26 suites / 76 cases;
- `pnpm check:agent-boundaries`, `pnpm check:application-boundaries` and `pnpm check:openspec`: passed;
- `git diff --check`: passed.

Visible Electron Computer Use acceptance:

- Character Management `快速生成` opened the canonical Agent Entry in 创作 mode with
  `$character-creator` prefilled and the fresh Character destination chooser visible; the previous
  English builtin-unavailable error did not recur.
- After the standard `chara.character.fillDraft` approval, `UI Quick Cartographer`
  (`character-project:2acebbd4-b02f-4bb7-a7ca-3536f0b3d10d`) was written and appeared in Character
  Management as `草稿 · 0 个版本`.
- The ordinary `$skill-creator` path created personal Skill `ui-test-i18n-character-summary`
  (fingerprint prefix/suffix `7a6a47c7...5acd19`), and the Extensions catalog displayed it as
  `个人`.

Two adjacent findings remain outside this correction. Opening the fresh Character authoring target
projects a Content Project panel diagnostic for a nonexistent `ProjectComposition`; the Character
Tool write still succeeds, but the Workspace composition needs its owning follow-up. The Computer
Use accessibility tree was authoritative and stable, while captured screenshots intermittently
showed the prior GPU surface, so functional UI evidence is accepted and pixel-level visual review
remains blocked rather than being reported as passed. `pnpm check:no-internal-versioning` is also
blocked by existing dirty-worktree Character contract findings around `revision`, `version` and
`compatibility`; none are introduced by the handoff, localization or Evaluation selector changes.

## Batch 9: owner-qualified reference inventory and management detail projection

`@neko/chara/contracts` now owns the strict `CharacterVersionReferenceInventory` and the rebuildable
Character management detail projection. `@neko/chara/application` batches the fixed Chara, Agent and
Project owner readers once per management read, validates exact owner/version identities and keeps
successful sibling owners visible when one reader fails. Chara projects Storyline draft/version,
Character run, Room template/run participant, relationship memory and Companion memory provenance;
Agent reads exact persisted Conversation Character bindings; Project reads exact dependency
occurrences from complete per-project dependency snapshots. Desktop only maps owner DTOs and injects
the readers.

The read-only management surface now shows standalone/project-local placement, draft/finalization
state, Storyline count, bounded roots/heads/unlinked lineage, per-version exact references and owner
diagnostics. Missing lineage remains the canonical unlinked fresh state; a corrupt lineage is shown
as unavailable and is not replaced by a fabricated graph. Quick Generate, Manual Create, Import,
Open Authoring, Export and Start Interaction remain explicit lifecycle actions, with unavailable Host
workflows disabled rather than routed through current/recent Workspace fallback.

Verification:

- `@neko/chara`: 40 files / 206 tests passed; typecheck passed;
- `@neko/agent-runtime`: 126 files / 1182 tests passed; typecheck passed;
- `@neko/project`: 4 files / 15 tests passed; typecheck passed;
- `@neko/chara-webview`: 4 files / 16 tests passed; typecheck passed;
- Desktop typecheck passed.
- application/package/Webview boundary checks, strict OpenSpec validation, focused ESLint, Prettier
  and `git diff --check` passed.

Agent Evaluation is excluded for this batch: the Agent addition is a read-only catalog query and does
not change prompt, Skill/capability routing, provider/model choice, Conversation mutation, queue or
turn behavior. Deterministic owner-reader and Desktop composition checks are the authoritative lane.

Advisory visible Electron validation remains blocked. The latest `domain-management-workbench`
development run initialized Main, Host ports, Agent providers and IPC, but the renderer completed
with an empty `body`; no management screenshot can be treated as visual evidence. Report:
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-13T15-34-59.944Z-domain-management-workbench-development/report.json`.

`pnpm check:no-internal-versioning` remains red on the shared dirty worktree (stale allowances and
hundreds of pre-existing/newly-unbaselined occurrences across current Character/Project work). The
new contracts add no internal schema/format generation; their `CharacterVersion` identities are
user-managed domain versions, but the global audit baseline is not clean enough to accept this batch
as a standalone pass.

## Batch 10: responsive Character cards and consolidated management detail

Character Management now uses an actual responsive card grid rather than rendering the same
horizontal list row in grid mode. Cards retain a two-line summary, visible lifecycle/version
metadata and exact selection state. Container queries, rather than viewport media queries, adapt the
header, toolbar and catalog to the real Main-slot width; a split non-fullscreen window therefore
keeps two usable columns where space permits and converges to one column without horizontal
overflow.

The read-only Character detail is one continuous Secondary Main surface without an additional outer
card border or radius. Identity, lifecycle, lineage, exact references and actions are separated by
internal rules and spacing instead of independent elevated cards. The four metrics form one
continuous statistics band; version and reference inventories use flat rows. Only lifecycle actions
retain card affordance because they are discrete interactive choices. The detail article is also a
non-shrinking flex item with visible overflow, so the owning Secondary Main scroller exposes its full
top and bottom instead of clipping content at short window heights.

Project Content now treats Characters as the primary full-width group. Character facts render as
consistent cards with local status/diagnostic presentation, while Worlds, other Elements and
Candidates form a compact responsive overview below. The previous four equal quadrants, nested row
list and large unused grid area are removed. No owner, identity, navigation or mutation contract was
changed by this presentation batch.

Focused verification:

- `@neko/chara-webview`: typecheck passed; 4 files / 16 tests passed;
- `@neko/project-webview`: typecheck passed; 1 file / 8 tests passed;
- Desktop renderer style/application regression: 2 files / 80 tests passed; Desktop typecheck passed;
- focused ESLint, Prettier and `git diff --check`: passed.

Advisory UI validation is partially blocked. The isolated `project-content` development scenario
could not acquire a Desktop CDP target before timeout, so the authoritative isolated runtime is not
reported as passed. A read-only Computer Use review of the already-running OpenNeko development
window provided supporting pixel evidence for Project Content, Character catalog, split detail and
the 1040×700 non-fullscreen state. That review found no horizontal overflow, clipping or overlap;
the Character catalog remained a two-column card grid, the detail remained one continuous surface,
and Project Content preserved the primary/supporting hierarchy. The screenshots are stored under
the current CUA temporary directory with timestamps `23.43.45`, `23.43.52`, `23.44.00` and
`23.44.11` on 2026-08-13. Because the isolated runtime remained unavailable, the overall advisory
result stays `blocked`, not `passed`.

After removing the redundant detail boundary, an additional 1040×560 Computer Use check exercised
the real Secondary Main scroll surface from the initial identity section through the final action
note. Two downward scrolls reached all six actions and the bottom padding, proving the previous
flex-shrink plus `overflow: hidden` clipping path was removed.

## Batch 11: reference-aware CharacterVersion deletion

`@neko/chara/application` now owns the destructive decision for one exact CharacterVersion. The
service verifies exact project/version ownership, consumes the fixed Chara/Agent/Project reference
inventory, preserves owner-qualified diagnostics and blocks the target when any reader is
incomplete or any durable reference exists. Chara-owned working-draft basis and lineage-child
relationships are explicit inbound references, so deletion cannot leave a dangling draft basis or
silently rewrite a derived branch.

For an unreferenced version, deletion removes only the lineage relation whose child is that exact
version and the exact immutable publication file. Sibling versions, sibling relations and the
working CharacterProject remain unchanged. The Node repository validates the containing project,
record owner, authorized relative path and regular-file boundary before unlinking; wrong-owner and
symlink cases preserve their bytes and fail visibly. No consumer is rebound to a head, latest or
sibling version.

Verification:

- `@neko/chara`: full 41 files / 212 tests passed; typecheck passed;
- deletion/reference/authoring focus: 3 files / 25 tests passed;
- `@neko/chara-node` file repository: 1 file / 15 tests passed; typecheck passed;
- `@neko/chara-webview` typecheck passed;
- Desktop typecheck passed.

The application coverage includes declared branching and multiple heads, exact historical continue,
explicit working-draft replacement, immutable comparison, owner-reader failure, delete isolation,
and unchanged Storyline/Conversation/memory references after a new branch appears. This batch does
not change Agent prompts, capability routing, provider/model choice, queues or turn behavior, so
Agent Evaluation is not applicable.

## Batch 12: Workspace CharacterVersion graph, comparison and guarded operations

The canonical Chara authoring snapshot now projects the exact CharacterVersion lineage and one
owner-qualified reference inventory per visible version. The existing Workspace-contributed
`CharacterAuthoringSurface` renders these facts as graph/list views with selected-node detail,
branch/root/unlinked/head state, immutable field-group comparison and localized Chara/Agent/Project
reference labels. The graph remains a read-only projection; no second controller, graph mutation
contract, hidden branch draft or VCS-style operation was introduced.

Historical continuation and deletion reuse the same Chara Host command boundary. Continue requires
an explicit confirmation and clearly distinguishes replacement of an unsaved working draft. Delete
is disabled whenever owner coverage is incomplete or any exact reference exists, and otherwise uses
the reference-aware deletion service's second confirmation. Project-local Storyline catalogs are
included through a narrow Chara-owned reader and de-duplicated against durable Chara catalog facts.
Malformed or duplicate per-version inventories and wrong project ownership are rejected at the Host
contract boundary instead of selecting a latest/current sibling.

The workspace is responsive to its actual container: graph and detail columns collapse to one
column in a narrow Secondary/Main slot, the version selector becomes bounded and scrollable, exact
reference rows and comparison panes collapse without horizontal clipping, and internal sections use
rules within one continuous workspace band rather than a collection of elevated cards.

Verification:

- `@neko/chara`: 41 files / 215 tests passed; typecheck passed;
- `@neko/chara-webview`: 4 files / 18 tests passed; typecheck passed;
- focused ESLint, strict OpenSpec validation, application/Webview boundary checks, storage-authority
  audit and `git diff --check`: passed;
- earlier same-batch Desktop Host/preload/Shell focus: 3 files / 104 tests passed; Desktop typecheck
  passed.

The global `pnpm check:no-internal-versioning` gate remains red on the shared dirty worktree because
its allowances are stale and it reports 316 newly unbaselined occurrences across concurrent
Character/Project changes. The focused poison scan found no `schemaVersion`, `contractVersion` or
`formatVersion` in this batch; its CharacterVersion references are user-managed domain identities,
not an internal contract generation.

Authoritative visible UI validation remains blocked, not passed. The isolated
`domain-management-workbench` run could not acquire the Desktop CDP target because an existing
development process owns the checkout Vite bundle. Read-only Computer Use reached the current
Characters scene but the renderer then became blank, matching the existing runtime blocker. Report:
`reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-13T16-05-42.525Z-domain-management-workbench-development/report.json`.

## Batch 13: canonical localized asset bindings and package installation order

The Chara directory repository now owns one strict
`neko/characters/<characterProjectId>/localized-assets.json` aggregate. Each binding identifies the
exact opaque non-file resource ref, representation identity/kind, one entry relative asset path and
the complete media-type/byte-length file inventory. The repository accepts a binding only when the
exact representation exists in the CharacterProject or one of its immutable CharacterVersions and
every declared file exists with the exact byte length. Reading revalidates those facts, so missing or
changed bytes make only that binding catalog fail visibly; unbound partial bytes never become a
runtime realization through path or file-presence inference.

Binding writes are atomic and additive/idempotent. An existing representation binding cannot be
removed or replaced by a later aggregate save, while a new exact binding can be appended. The same
repository and relative layout are exercised for standalone-library and Content Project scopes.
No ZIP identity, archive path, mount, watcher or synchronization fact is retained in the live
record.

Portable export now selects embedded representations by exact identity and consumes only their
complete canonical bindings. The manifest carries the resource ref, every declared file and exactly
one entry-file marker per representation; all other exact representations remain explicit external
dependencies. Import validates that the embedded/external inventory covers and matches every exact
Character representation, installs bytes first and commits the merged live binding aggregate last.
An interruption at that final step leaves diagnosable unbound bytes, and retry completes the same
binding without overwriting different facts.

Verification:

- `@neko/chara`: 42 files / 220 tests passed; typecheck passed;
- `@neko/chara-node`: 8 files / 44 tests passed; typecheck passed;
- real file/ZIP coverage includes a two-file Live2D tree, unique entry file, opaque resource binding,
  unbound-selection rejection, embedded/external inventory, binding-last interruption and exact
  idempotent retry;
- strict OpenSpec validation, focused ESLint, application-boundary and storage-authority gates and
  `git diff --check`: passed.

Task 3.5 remains open because Desktop has not yet supplied sender-bound source/destination file
grants or the one-shot Host adapter that releases selected archive bytes after preview, commit or
cancellation. The host-neutral application and Node archive paths are ready, but that missing trust
boundary is not represented as completed UI or workflow evidence.

## Batch 14: portable export scope and import preview surfaces

`@neko/chara-webview` now exports reusable Chara-owned package surfaces for the future Desktop
sender-bound workflow. Export scope shows exact usable-version, branch-head and unlinked counts,
selectable Storylines, opt-in authoring-test snapshots and a representation-level asset policy.
Only representations whose canonical live bindings are complete can be selected for embedding;
file count and aggregate byte size are visible, while unbound representations remain explicitly
external. The copy consistently describes the result as a one-time portable snapshot and states
that it is not publication, sharing or synchronization.

Import preview shows the exact destination placement, versions, branches, Storylines, embedded
representation count/size, self-contained versus external dependency state, unlinked historical
versions and owner-qualified identity conflicts. Any conflict disables install and states that
overwrite, merge and automatic rename will not occur. The presentation receives only bounded Chara
projections: raw source/destination paths, archive readers and ZIP bytes are absent from its props and
rendered output.

Both surfaces are one continuous responsive document with internal rules rather than nested card
stacks. Four facts collapse to a 2×2 band, policy sections collapse from two columns to one and
actions/rows become vertical at narrow container widths. They do not own Scene, Workspace,
controller or Host file-selection lifecycle.

Verification:

- `@neko/chara-webview`: 5 files / 21 tests passed; typecheck passed;
- UI tests cover exact export selection, disabled unbound dependency, absence of raw-path text,
  branch/unlinked/dependency preview, conflict-disabled install and conflict-free self-contained
  install;
- focused ESLint, application/Webview boundary gates, strict OpenSpec validation and
  `git diff --check`: passed.

Task 5.6 is complete at the Chara presentation boundary. Desktop composition and sender-bound file
authorization remain tasks 7.2/7.4, and therefore no management action is falsely enabled yet.

## Batch 15: Chara Webview separation and layout acceptance inventory

The Chara Webview suite now covers the complete section-5 separation inventory. Management detail
and creation entry contain no form, input, textarea or authoring section; the exact project-local
authoring surface owns the mutable definition, Storyline and test controls and unmounts cleanly.
Standalone/project-local badges, bounded lineage, exact references, graph/list switching, immutable
comparison, unlinked versions, explicit unsaved-draft replacement and two-step deletion are asserted
through user-visible controls.

Portable coverage now includes empty, dense, conflict-invalid and self-contained states. A 32-item
asset policy keeps every checkbox addressable by accessible name, conflict preview exposes an alert
and a focusable cancellation path, and install remains disabled. Source-boundary poison checks prove
that management/version/package presentations contain no Desktop global, archive bytes,
Workspace-grant identity, raw local path or independent controller identity. Responsive acceptance
is guarded by the version 760/520 and package 620/420 container breakpoints, matching the actual slot
width instead of the outer window viewport.

Verification: `@neko/chara-webview` typecheck passed; 5 files / 23 tests passed.

## Batch 16: portable archive adversarial and authority acceptance

The bounded ZIP tests now exercise entry-count and aggregate-expanded-byte limits in addition to
per-entry size, digest, path traversal, duplicate-entry and symlink rejection. The application/Node
inventory already covers a complete two-file Live2D tree, explicit external VRM and voice refs,
multi-branch lineage, exact Storyline refs, immutable identity conflicts, binding-last interrupted
writes with exact retry, and invalid-package sibling isolation.

The portable authority poison suite proves that the archive adapter exposes only one-shot `read`
and `write` transport operations and introduces no durable package, path, mount, watcher, recent
binding or synchronization identity. A real archive round trip now also asserts the closed manifest
shape and exact byte inventory: only the selected Character authoring record and selected localized
asset are present. Conversation, Room, memory/runtime, provider/model selection, Skill/Tool grant,
approval, credential, cache and presentation-snapshot records are absent from the manifest and
production portable sources.

Verification: focused Chara Node portable suite passed (3 files / 15 tests), Chara Node typecheck
passed, focused ESLint passed and `git diff --check` passed. This completes tasks 3.6 and 3.7; task
3.5 remains open until the sender-bound Desktop source/destination grant lifecycle is wired.

## Batch 17: role-card selection with one exact CharacterVersion

Character Dialogue Entry now models one card per CharacterProject rather than one card per
CharacterVersion. A Character with exactly one usable version can be selected directly; a Character
with multiple versions presents one explicit version control and has no default selection. Changing
that control replaces the same Character's exact version instead of adding a second Room
participant. Selecting one Character therefore launches the single-character path, while selecting
multiple distinct Characters selects the Room path. Agent and Chara contracts reject two exact
versions of one Character as separate participants before runtime owners are created.

The Chara launch catalog now includes a bounded lineage projection for every exact version: declared
root/linked/unlinked state, head state and the root-to-selected label path. A corrupt lineage reader
is isolated to that Character's lineage presentation and does not erase sibling Character cards or
invent a latest/head fallback. The Agent adapter passes only this compact projection; full Character
definition facts remain outside Agent Entry.

Verification:

- Chara launch/foundation focus: 2 files / 14 tests passed; Chara typecheck passed;
- Agent contracts: 1 file / 12 tests passed; typecheck passed;
- Agent Webview selector plus ConversationController: 2 files / 68 tests passed; build/typecheck
  passed;
- Desktop launch adapter/preload bridge: 2 files / 16 tests passed; Desktop typecheck passed;
- `pnpm test:agent:eval`: 45 files / 310 tests and all-suite dry-run 26 suites / 77 cases passed as
  key-free harness readiness only, not real Agent behavior evidence.

The exact visible Character selector flow remains `infrastructure-blocked` in Agent Evaluation and
authoritative Electron UI validation remains blocked by the existing Desktop runtime/CDP issue.
Task 8.1 is complete at the contract/application/Webview path; no preferred/latest version path was
added.

## Batch 18: exact runtime reference retention and graph separation

The exact-reference branch regression now includes CharacterStorylineVersion, Agent Conversation,
Room participant, Companion memory provenance and Project dependency owners. Creating a sibling
CharacterVersion branch leaves every original reference unchanged and keeps both lineage nodes; the
destructive path remains blocked by the original owner-qualified inventory instead of rebinding a
consumer to the new branch.

The persistent Agent Conversation context test binds an original CharacterVersion and a newer
sibling-branch CharacterVersion to two exact Conversations, closes the metadata owner, reopens the
database and recovers both original identities independently. Pi compaction receives the original
CharacterVersion as an explicit retained product reference, and the compaction summary prompt
preserves it. CharacterVersion selection remains in the durable Conversation context authority;
Pi transcript compaction has no version/head resolver and therefore cannot replace it with the new
branch.

A source-level poison test now guards the three independent projections: Chara
CharacterVersionGraph, Chara Storyline authoring, and Pi Conversation branches. Their application,
Webview and runtime sources neither import each other's graph authorities nor declare a unified
graph/timeline or cross-graph mutation path.

Verification:

- Agent lifecycle reopen plus Pi compaction: 2 files / 23 tests passed; Agent Runtime typecheck
  passed;
- Chara exact-reference regression: 1 file / 5 tests passed;
- Chara architecture graph-separation poison suite: 1 file / 10 tests passed;
- focused formatting and ESLint passed.

Tasks 8.3 and 8.4 are complete. This is deterministic persistence/architecture evidence; the real
packaged reopen flow remains part of the still-unexecuted provider-authorized acceptance task 9.8.

## Batch 19: Assistant-preserving Character Management handoff

Character Management quick generation now keeps the canonical Agent Entry in Assistant mode. The
existing authoring target selector is projected only while the exact Character creation lock is
active, so standalone/project-local placement still produces the ordinary fresh authoring target
receipt without adding another chooser, changing Entry mode or inferring a current/recent
Workspace. Ordinary user-selected Authoring mode retains its existing behavior.

The deterministic interaction path proves that the exact builtin Character Creator wins over a
same-name project Skill, the complete prompt and authorized reference receipt survive the handoff,
and the exact fresh CharacterProject receipt is submitted through the standard Skill path. The
failure path leaves the handoff unconsumed, while cancellation before creation clears the prepared
draft and target binding without creating a target or submitting a turn.

Verification:

- Agent Webview `ConversationController`: 1 file / 63 tests passed;
- Agent Webview build/typecheck passed;
- `pnpm test:agent:eval`: 45 files / 310 tests and all-suite dry-run 26 suites / 77 cases passed as
  key-free harness readiness only, not real Agent behavior evidence.

Task 6.2 is complete. The visible provider-authorized Evaluation scenario remains
`infrastructure-blocked`, and exact result actions/tool-failure coverage remain tasks 6.3 and 6.5.

## Batch 20: quick-creation producer/consumer and single-path guards

The Character authoring capability test now covers a write failure after an exact fresh
CharacterProject target has already been authorized. The failure result names the write diagnostic,
retains the exact target identity at the fill boundary and emits no successful product handoffs.
The Desktop Agent accessory independently proves that a failed Tool result projects no Character
result actions and invokes no navigation callback.

The existing deterministic inventory already covers the strict management handoff contract, exact
builtin Skill selection over a same-name project Skill, complete prompt/reference preservation,
standalone and project-local destination choices, cancellation before target creation, standard
confirmation-gated Tool metadata, successful exact handoff production and consumer rendering. A new
repository poison test closes the architecture requirement: production code mounts exactly one
`ComposerWorkspaceProvider`, the Agent Webview does not import Chara application/provider code, and
the single Chara capability provider implementation is composed only by Desktop Main.

Verification:

- Chara capability plus architecture suites: 2 files / 14 tests passed; Chara typecheck passed;
- Desktop Agent result accessory: 1 file / 18 tests passed; Desktop typecheck passed;
- focused ESLint completed with no errors (five pre-existing ConversationController Hook warnings);
- `git diff --check` passed.

Task 6.5 is complete. Task 6.3 remains open because `Open Studio` is still deliberately disabled
until Desktop can transition to the exact authorized standalone/project-local Workspace authority.

## Batch 21: standalone and project-local Workspace authoring authorities

Character authoring no longer models every target as a Content Project. Its canonical Host binding
now carries an explicit authority union: standalone Character library or exact Content Project.
The same Chara authoring contract, application service, file repository, command path and Webview
surface consume either authority. Project-local requests continue to require the registered Project
and its sender-bound Workspace grant; standalone requests require the configured Character library
grant and reject a different directory even when the Renderer supplies a syntactically valid
Workspace identity.

The Host Workbench now permits a missing `projectId` only for domain authoring Views. All ordinary
content, Canvas, Preview, Cut and text-editor Views still require a Project. A new exact
`open-character-authoring` transition validates the grant and Character snapshot before committing,
then mounts one Character authoring View under the existing Workspace Agent scene and Workbench.
The standalone transition registers no Content Project or Project tab, creates no Chara-specific
Scene/Workbench/controller and exposes no path to Renderer. Project-local Views retain their exact
Content Project authority. The Desktop Chara surface receives only Workspace/grant, explicit
authority and CharacterProject identities.

Verification:

- Chara contract/application/capability/architecture: 4 files / 26 tests passed; typecheck passed;
- Chara Webview exact binding surface: 1 file / 15 tests passed; typecheck passed;
- Host Scene/Workbench/Shell: 3 files / 83 tests passed; Host typecheck passed;
- Desktop AppHost/preload/Shell/Agent accessory: 4 files / 123 tests passed; Desktop typecheck
  passed;
- tests cover standalone success, zero fake Project facts, project-local authority, invalid library
  grant rejection, exact snapshot prevalidation and sibling behavior after rejected inputs.

Task 7.1 is complete. Task 7.2 remains open because portable file-picker delegation and the
quick-generation result's exact `Open Studio` authority handoff are not yet fully wired.

## Batch 22: manual Character creation through authorized Workspace authoring

Character Management manual creation now acquires the configured standalone Character-library
grant before it creates any fact. After authorization it creates one fresh empty CharacterProject
through the Character Foundation owner and invokes the exact `open-character-authoring` transition.
Cancelling authorization therefore creates no Character, Project or runtime fact; a transition
failure after creation remains visible and leaves the new durable draft recoverable in management.

Project-local manual creation remains on the existing Project Resource Browser path: its exact
Content Project Workspace authority creates the CharacterProject plus membership/association and
opens the same Chara-owned authoring surface. A source-level producer/consumer test proves that the
management manual path is grant-first, does not call the Character Creator handoff and contains no
portable/import operation. Portable import remains the separate owner-qualified Chara workflow and
does not share quick/manual handlers.

Verification:

- Desktop management/manual plus project-local resource entry: 2 files / 39 tests passed;
- Desktop typecheck passed;
- exact standalone Host transition and Chara snapshot prevalidation remain covered by Batch 21.

Task 6.4 is complete. Portable Host file selection/commit is still task 3.5/7.2 and is not implied by
this manual-authoring result.

## Batch 23: exact Character result actions and authoring authority

The canonical Agent authoring binding now carries an explicit authority: exact Content Project or
standalone Character/World library. Contract parsing rejects mismatched Content Project identities,
wrong standalone libraries and omitted authority. Desktop target validation resolves only that
authority; it no longer discovers an arbitrary Project registered for the same Workspace.

Successful Character Creator results retain the exact Character authoring authority in their
`Open Studio` handoff. `View Character` remains a management selection, while `Open Studio` obtains
the corresponding sender-bound grant and invokes the exact `open-character-authoring` transition.
Both actions remain inert until the user clicks them. A failed Tool result and cancellation before
target creation still project no result actions and create no Character, Project or runtime fact.

Verification:

- Agent contracts/runtime/Webview focused suites: 10 files / 188 tests passed; contracts/runtime
  typechecks and Agent Webview build passed;
- Chara handoff/capability plus Project projection: 3 files / 13 tests passed;
- Desktop entry-target, Agent result surface and Shell: 3 files / 39 tests passed; Desktop typecheck
  passed;
- the Agent Webview DOM suite was run from its package-owned Vitest configuration: 2 files / 68
  tests passed. A root-level attempt lacked that package's jsdom configuration and is not counted as
  product failure evidence.

Task 6.3 is complete. Authoritative visible Electron UI and provider-backed Agent Evaluation remain
blocked/unexecuted and are still tracked by tasks 9.7 and 9.8.

## Batch 24: management composition lifecycle and package verification

The Character management detail remains a read-only Secondary Main surface and now has explicit
source-level lifecycle guards: management and Workspace authoring are mutually composed, the portal
deck mounts only its visible target, and no hidden Character editor, Studio Scene, Workbench or
controller survives a scene switch. The detail owns vertical scrolling while its outer presentation
surface has no rounded card frame, border or clipping overflow. This keeps the management page
complete at narrow/non-fullscreen sizes without reintroducing independently retained card roots.

The Chinese Chara domain documentation now records the management, quick-create, Workspace
authoring and interaction ownership split, including standalone/project-local authorities, local
usable versions and exact-version runtime selection.

Verification:

- Chara: typecheck passed; 42 files / 226 tests passed;
- Chara Node: typecheck passed; 8 files / 45 tests passed;
- Chara Webview: typecheck passed; 5 files / 23 tests passed;
- Agent contracts: typecheck passed; 45 files / 282 tests passed;
- Agent Webview: build passed; 102 files / 785 tests passed;
- Agent Runtime: typecheck passed; 125 files / 1182 tests passed with one unrelated existing
  `plugin-runtime.test.ts` timeout in the changed-child-runtime case;
- Project: typecheck passed; 4 files / 15 tests passed;
- Host: 38 files / 313 tests passed (the package has no typecheck script);
- Desktop: typecheck passed; 104 files / 684 tests passed;
- `pnpm check:openspec` passed (92 checks), and `git diff --check` passed.

Tasks 7.3, 9.1, 9.3 and 9.4 are complete. Task 9.2 remains open because the exact requested
Prettier scope still reports twelve unrelated dirty files outside this change; they were preserved
rather than reformatted as collateral edits.

## Batch 25: repository gates and Agent Evaluation readiness

Repository boundary and dependency checks were executed against the complete dirty worktree rather
than replaced by focused package success. Application, Agent, Webview and storage-authority gates
passed, as did `check:unused` and the composed `pnpm check` dependency analysis. The internal
versioning audit's own 11 self-tests passed, but its repository scan remains red because the shared
worktree contains stale allowances and 323 unbaselined occurrences across unrelated domains. No
allowance file was rewritten as part of this Character change.

The existing Character Creator Evaluation inventory covers management handoff, exact destination
and approval, absence of implicit usable-version/runtime creation and exact branch selection.
`pnpm test:agent:eval` passed 45 files / 310 tests plus the all-suite dry-run of 26 suites / 77 cases.
This is key-free harness readiness only and is not provider-backed Agent behavior evidence.

Task 9.6 is complete. Task 9.5 remains open because `check:no-internal-versioning` is red on the
shared worktree; task 9.8 remains unexecuted without explicit provider/model/cost authorization.

## Batch 26: finalize and exact Character Dialogue handoff

Workspace Character authoring now exposes an explicitly labelled “Finalize and start
Conversation” command only when Desktop supplies the launch handoff. The command first invokes the
canonical `character-version-publish` operation with a newly generated exact user-domain
CharacterVersion identity. Only after that durable operation succeeds does Desktop leave authoring,
open one fresh unbound Agent Draft and hand the exact CharacterProject/CharacterVersion pair to the
existing Character Dialogue Entry target transaction. No latest, first, active or recent version is
selected.

Stage-two failure is projected back as an authoring diagnostic. It does not compensate, delete or
rewrite the already-created immutable usable version; the emptied version-label field provides a
second observable indication that finalization completed. The Agent handoff is draft-bound and
consumed only after the exact Companion target receipt is configured.

Verification:

- Agent handoff contract: 1 file / 2 tests passed;
- Agent Webview ConversationController: 1 file / 64 tests passed;
- Chara Webview authoring Root: 1 file / 16 tests passed;
- Desktop Shell composition: 1 file / 41 tests passed;
- Agent contracts/Webview, Chara Webview and Desktop typechecks passed.

Task 8.2 is complete. Provider-backed Conversation execution remains task 9.8 and has not been
claimed by this deterministic launch-transaction evidence.

## Batch 27: bounded portable package composition and quality review

Character Management now exposes package import from the catalog and import/export from the
read-only detail actions. The workflow is rendered as one continuous Chara-owned surface without
an extra rounded card frame; its Desktop overlay is bounded by the current viewport and scrolls
internally, so narrow and non-fullscreen windows do not clip the top or bottom actions. Successful
installation explicitly reloads the Character Management projection.

The canonical path is now:

1. `@neko/chara-webview` owns export-scope and import-preview presentation;
2. `@neko/chara/contracts` owns the strict exact-authority request, scope, receipt and result shape;
3. Desktop preload/IPC/AppHost validate renderer session, sender Window, directory grant and exact
   standalone/content-project authority, while Electron alone selects and reads/writes the file;
4. `CharacterPortablePackageService` owns export scope, lineage heads, localized-asset eligibility,
   archive inventory, conflict policy and import commit;
5. the exact Chara directory repository and bounded Chara Node archive adapter own canonical records,
   installed bytes and ZIP encoding/decoding.

Desktop Renderer receives no raw path or ZIP identity, Desktop Main performs no ZIP parsing,
lineage projection or Character mutation decision, and no fake Project/latest/active/recent fallback
was added. Import preview bytes are held only behind an opaque
sender/Window/renderer-session/destination-bound receipt; commit, cancel and Window resource detach
consume the receipt. A failed wrong-destination
commit does not consume or mutate the valid destination, while a completed commit/cancel cannot be
replayed. Existing canonical records are never overwritten or silently remapped; conflicts remain
visible before commit, partial installation remains fail-visible, and unrelated catalog/authoring
operations remain available.

Quality review found one product-path defect before completion: deriving export scope only from the
authoring snapshot made every representation appear external even when an exact localized binding
existed. The scope projection was moved into the Chara application owner. Its contract now reports
exact owned file count and bytes; the tested Live2D tree is selectable for embedding while unbound
VRM/voice resources remain explicit external dependencies. No unresolved P0-P2 finding remains in
the reviewed Character package path.

Verification:

- Chara: typecheck passed; 43 files / 229 tests passed;
- Chara Node: typecheck passed; 8 files / 45 tests passed, including localized Live2D export scope,
  external dependencies, archive validation, conflict and interrupted-write coverage;
- Chara Webview: typecheck passed; 5 files / 24 tests passed;
- Desktop: typecheck passed; 105 files / 691 tests passed; focused AppHost/IPC/Shell verification
  passed 4 files / 114 tests;
- application, Webview, storage-authority, package and Agent boundary gates passed;
- `pnpm check:unused`, composed `pnpm check`, `pnpm check:openspec` (93 items) and
  `git diff --check` passed.

Tasks 3.5, 7.2, 7.4, 7.5 and 9.9 are complete. The exact broad Prettier scope and internal-versioning
repository scan remain red on unrelated shared-worktree files as recorded in Batches 24-25, so tasks
9.2 and 9.5 remain open. Authoritative visible Electron acceptance is still blocked by the existing
blank renderer/CDP fixture, and provider-backed/package repetition lacks explicit cost authorization;
tasks 9.7 and 9.8 therefore remain open and are not replaced by deterministic tests.
