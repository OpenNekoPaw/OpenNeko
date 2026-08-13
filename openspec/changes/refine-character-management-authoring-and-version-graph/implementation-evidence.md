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
