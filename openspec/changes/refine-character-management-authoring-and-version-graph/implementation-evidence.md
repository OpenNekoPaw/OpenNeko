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
