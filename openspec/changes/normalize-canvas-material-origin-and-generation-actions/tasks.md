## 1. Shared contracts and strict validation

- [x] 1.1 Audit `ContentLocator`, Canvas Media/File/Job nodes, `JobRef`, Generation snapshots and current NKC codecs; record the canonical producer/consumer list and poison targets before changing contracts.
- [x] 1.2 Add the minimal portable generation-evidence contract based on `JobRef<'generation'>` plus immutable creator-facing summary, without adding a duplicated persisted origin field.
- [x] 1.3 Define strict Canvas material authoring requests for direct locator reference, external import, global-library link/copy and owner-committed generated output; require explicit project and Canvas instance identity.
- [x] 1.4 Define the owner-contributed Canvas material action descriptor and typed dispatch intent, including media kinds, derived origin, selection cardinality and effect semantics.
- [x] 1.5 Update Canvas codecs/validators so source-backed Media/File nodes require a valid ContentLocator, generated classification accepts only `generated-output`, and runtime URLs, absolute paths, callbacks, credentials and temporary/cache values fail visibly.
- [x] 1.6 Add producer/consumer and serialization regression tests for referenced, generated, Entity-representation and Job nodes, including rejection of conflicting or legacy heuristic-only payloads.

## 2. Legacy document inspection and migration

- [x] 2.1 Add an explicit inspection result for legacy nodes whose generated status is inferable only from paths, old ResourceRefs or provenance strings; normal authoring must not silently classify them.
- [x] 2.2 Implement the bounded NKC migration for nodes that already contain enough canonical locator/Job evidence, preserving node identity, layout, lineage and user files.
- [x] 2.3 Add migration fixtures covering valid referenced nodes, valid generated-output nodes, ambiguous legacy nodes and invalid runtime values.
- [x] 2.4 Poison the old path/provenance generated classifier in normal runtime tests and assert that only the migration/inspection entry may observe legacy evidence.

## 3. Host-owned material entry transactions

- [x] 3.1 Refactor Canvas content authoring to resolve all supported `workspace-file`, `document-entry`, `package-resource` and `generated-output` locators through one strict descriptor path instead of the current workspace-file-only branch.
- [x] 3.2 Implement direct authoring for authorized workspace files and `neko/assets/<libraryName>/` entries, retaining the exact workspace-relative locator without copying bytes or creating per-file links.
- [x] 3.3 Implement explicit global Media Library “link library” and “copy file into project” authoring decisions; create no Canvas node until a project-authorized locator exists.
- [x] 3.4 Implement atomic external import into `neko/imports/<kind>/` with bounded read, content fingerprint, visible conflict policy, safe filename handling and cleanup of incomplete temporary writes.
- [x] 3.5 Ensure external import, library link/copy and locator validation failures produce visible diagnostics and leave no empty node, absolute-path reference or partial document mutation.
- [x] 3.6 Add path-level tests proving each of the four entry requests invokes its canonical Host/Media Library handler and no AssetLibrary/import fallback participates.

## 4. Generation draft, Job and result projection

- [x] 4.1 Replace empty image/audio/video/document/model Media/File creation with a Generation-owned draft and submitted Job projection; retain legal empty Markdown and Group authoring.
- [x] 4.2 Project Generation snapshot revisions into instance-scoped Job Canvas nodes without making Canvas the mutable Job status owner.
- [x] 4.3 On successful Generation commit, create a new Media/File node from the exact generated-output locator, attach immutable generation evidence and record Job/input `derived-from` lineage.
- [x] 4.4 Keep failed and cancelled Generation Jobs visible with diagnostics while proving no source-less result node is created.
- [x] 4.5 Separate retry of a recoverable failed Job from regenerate/edit-and-generate of a successful result; regeneration must submit a new Job and produce a new output identity/revision without overwriting history.
- [x] 4.6 Add tests for missing/expired generation recipe authority: preview and historical summary remain available, regenerate is omitted, and no summary-to-recipe fallback occurs.

## 5. Entity representation and non-destructive derivation

- [x] 5.1 Add Entity-to-Canvas authoring through the Entity owner’s confirmed active representation locator, retaining the stable Entity ref separately from content identity.
- [x] 5.2 Ensure an Entity representation change does not silently rewrite existing Canvas nodes; expose only an explicit refresh/replace operation.
- [x] 5.3 Implement the common derived-output commit path so crop, erase, redraw, denoise, separation, interpolation, transcoding and AI transformations create new output nodes with lineage and preserve the source locator/bytes.
- [x] 5.4 Add regression tests proving referenced nodes never acquire generation evidence, generated origin or overwritten locators after ordinary or AI-derived actions.

## 6. Owner capability catalog and Canvas UI

- [x] 6.1 Implement the runtime action catalog and Host router that combine active project authority, Canvas instance, locator authorization, media type, derived origin and owner availability.
- [x] 6.2 Register existing Preview, Cut, media/image/audio/model and Generation actions through owner adapters without importing or reimplementing viewer/editor/provider internals in Canvas.
- [x] 6.3 Replace the generic quick-generate and extension/path-based toolbar branches with descriptor projection for the current single or multi-selection.
- [x] 6.4 Render referenced nodes with only applicable base/read/derive/copy/handoff actions and no generation history or regenerate controls.
- [x] 6.5 Render generated nodes with applicable base actions, immutable generation summary and regenerate/edit-and-generate only when the Generation reference resolves.
- [x] 6.6 Ensure mixed or multi-selection exposes only actions whose declared selection contract is valid for every selected node; unavailable owners must omit the action rather than render a no-op.
- [x] 6.7 Add focused component/domain tests for image, audio, video, document, model, Entity representation, generated result and mixed selection action surfaces.

## 7. Media Library destinations and AssetLibrary retirement

- [x] 7.1 Replace the ambiguous save-to-asset request with separate typed operations for copying to a selected project-linked Media Library and copying to a selected global Media Library.
- [x] 7.2 Route both operations through the owning Media Library services with explicit destination identity, conflict policy and authorization; keep the source Canvas identity unchanged.
- [x] 7.3 Remove or poison `saveCanvasMaterialToAssetLibrary`, `AssetLibrary.importFile`, Asset promotion messages/adapters/handlers and legacy test fixtures from normal Canvas/Desktop authoring.
- [x] 7.4 Add tests proving old messages fail with migration-required diagnostics, while explicit project/global copies use only Media Library handlers and create no Asset membership.
- [x] 7.5 Verify library unlink deletes only the project link and derived/copy operations never implicitly mutate the external linked target.

## 8. Desktop composition and lifecycle

- [x] 8.1 Compose the canonical authoring transaction, locator resolver, action catalog, Generation projector, Media Library services and Preview/Cut/model adapters in Desktop AppHost with explicit ownership and disposal.
- [x] 8.2 Keep per-project, per-Canvas and per-Job mutable state instance-scoped; reject missing, stale or mismatched identities rather than falling back to the active project/Canvas.
- [x] 8.3 Verify Desktop reopen restores locators, Job references, summaries and lineage, while runtime URLs, previews and action descriptors are rebuilt and never persisted.
- [x] 8.4 Add Desktop integration tests using an isolated copy/fixture based on `~/Git/neko-test` for direct add, linked library, global link/copy, external import, generation success/failure, derived output and restart recovery.

## 9. Evaluation, quality gates and documentation

- [x] 9.1 Use `neko-agent-evaluation` to add a key-free scripted case covering Generation routing, retry/regenerate distinction and result projection; assert the canonical Job and capability paths.
- [x] 9.2 Run the authorized real provider/model generation case when provider, model and cost approval are available; otherwise record the exact authorization blocker and residual risk without claiming real generation acceptance.
- [x] 9.3 Run focused tests and typechecks for `neko-types`, Canvas domain/Webview/Host adapters, Assets/Media Library, Generation and Desktop, plus `pnpm check:agent-boundaries`.
- [x] 9.4 Run Desktop Electron production packaging and a focused runtime acceptance pass; inspect UI errors, authorization diagnostics, media preview, action dispatch and resource disposal.
- [x] 9.5 Run applicable repository gates including `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, `pnpm check:unused` and `git diff --check`, or document any command that is inapplicable/blocked with evidence.
- [x] 9.6 Update Canvas, Media Library, Generation and Desktop architecture/usage documentation to describe the locator authority, four entry paths, non-destructive derivation, Job-based regeneration and retired AssetLibrary paths.
- [x] 9.7 Perform `neko-quality-review`, verify every requirement scenario has implementation/path evidence, and record remaining migration, codec/provider and user-data risks before marking the change complete.
