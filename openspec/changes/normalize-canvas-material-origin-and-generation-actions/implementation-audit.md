# Implementation Audit

## Stable ownership

| Responsibility | Canonical owner | Current producers | Current consumers |
| --- | --- | --- | --- |
| Portable content identity | `packages/neko-types/src/types/content-locator.ts` | Content IO, Generation result commits, Workspace Board delivery, Desktop Resource Browser | Canvas authoring, Preview, Cut, model/media adapters, NKC validation |
| Canvas persisted material identity | `packages/neko-types/src/types/canvas.ts` and NKC codecs | Canvas domain authoring, Workspace Board projector, Desktop Canvas runtime | Canvas Webview, Preview boundary, Desktop reopen, Agent Canvas operations |
| Generation Job identity and lifecycle | `packages/neko-generation/src/job/contracts.ts` and coordinator/store | Generation coordinator and provider adapters | Generation projectors, Agent purpose port, Canvas Job/result projection |
| Entity representation identity | `packages/neko-types/src/types/entity-representation-binding.ts` | Entity owner and Desktop entity projection | Agent mentions, Resource Browser, Canvas representation authoring |
| Runtime content authorization | Host-owned ContentLocator resolvers | Desktop AppHost and VS Code Extension Host | Preview/Cut/model/media readers and Canvas runtime projections |
| Creator action availability | Owning capability adapters composed by the Host | Preview, Cut, media/image/audio/model and Generation owners | Canvas selection toolbar and Agent/Canvas dispatch |

## Canonical invariants

1. `ContentLocator` is the only persisted content identity. Runtime URLs, absolute paths,
   cache paths and temporary paths are projections and must never classify a Canvas node.
2. Only a `generated-output` locator plus a stable `JobRef<'generation'>` is generated
   material. Creator-facing prompt/model/parameter text is immutable evidence, not recipe
   authority.
3. `ResourceRef`, provenance labels, path prefixes and extension heuristics may assist a
   bounded migration inspection, but normal authoring and rendering must not use them to
   infer material origin.
4. Canvas owns layout and references. Generation owns Job state; Entity owns active
   representations; Media Library owns linked/global library membership; Preview/Cut/model
   packages own their viewer/editor operations.
5. Every authoring mutation carries explicit project and Canvas instance identity. The
   active UI selection is not an operation owner or fallback identity.

## Existing canonical paths to retain

- `validateContentLocator` and ContentLocator serialization.
- `GenerationJobRef`, Generation snapshots, result locator validation and local metadata
  store.
- Host-side ContentLocator resolution and authorization.
- Workspace Board delivery's migration-required diagnostic when a locator is absent.
- Entity representation bindings that keep Entity identity separate from content identity.
- Preview/Cut/model/media package adapters; Canvas projects their action descriptors and
  does not reimplement their viewers or editors.

## Poison and replacement targets

| Legacy or incomplete path | Replacement |
| --- | --- |
| Canvas Webview `materialPresentation` infers generated state from `generationContext`, `neko/generated`, old `ResourceRef` or provenance strings | Derive origin only from a validated locator and stable generation evidence |
| NKC accepts Media/File nodes with only `ResourceRef` or raw path | Require a valid `contentLocator`; ambiguous legacy payloads enter explicit migration inspection |
| `projectContentLocatorToCanvas` supports only `workspace-file` | One Host-owned descriptor/transaction path for all supported locator kinds |
| Empty image/audio/video/document/model nodes | Generation-owned draft and Job projection; only Markdown and Group remain legal empty authoring |
| Generic `selection:quick-generate` and extension/path toolbar branching | Owner-contributed typed action descriptors filtered by selection |
| `saveCanvasMaterialToAssetLibrary`, `AssetLibrary.importFile` and Asset promotion messages | Explicit project/global Media Library copy operations |
| Implicit import/copy fallback during drag/drop | Direct reference, explicit library link/copy, atomic external import, or generated-output commit |
| Generated result mutation in place | New Generation Job and new output locator/revision with `derived-from` lineage |

## Runtime boundaries requiring path-level tests

- Direct workspace or project-linked Media Library reference does not copy bytes.
- Unlinked global Media Library entries require an explicit link-library or copy-file
  decision before Canvas mutation.
- External paths are imported atomically under `neko/imports/<kind>/`.
- Generated results are committed only from a successful Generation snapshot with
  `generated-output` locators.
- Restart restores locators, Job references, summaries and lineage while rebuilding runtime
  URLs and action descriptors.

## Implemented path evidence

- Canvas Webview add actions keep Markdown and Table as direct empty authoring. Image,
  video, audio and model actions require a Host-projected import/reference source mode or
  Generation capability; unavailable owners are omitted.
- Generation snapshots project to instance-scoped Job nodes. Success commits the exact
  generated-output locator plus immutable Generation evidence and `derived-from` lineage;
  failure and cancellation retain the Job diagnostic without producing a result node.
- Retry and regenerate create distinct Job identities and lineage. Historical summaries
  remain readable when recipe authority is missing, but the regenerate action is omitted
  and summary text is never treated as a recipe.
- Resource Browser Entity authoring now carries the confirmed active representation
  locator together with `entityId`, `bindingId` and representation `role`. Canvas persists
  that Entity evidence separately from the locator and never assigns Generation evidence
  to the referenced representation.
- Entity representation changes use the explicit
  `entity-representation-replace` authoring transaction. The Host reauthorizes the new
  referenced locator, rejects stale binding evidence or a changed stable Entity identity,
  preserves the existing Canvas node identity/layout/connections, and never rewrites
  existing nodes merely because the Entity owner changed its active representation.
- Owner-produced derivatives use one `derived-output-commit` transaction. The transaction
  creates exactly one new node, records explicit source lineage, and leaves every source
  node, locator and byte identity unchanged for both ordinary and AI-generated outputs.
- Creator actions are owner-contributed descriptors filtered by project/Canvas authority,
  locator validity, media kind, material origin, owner availability and selection
  cardinality. The Webview projects the descriptors and does not infer capabilities from
  extensions or paths.
- Desktop composes Preview, Cut, media preview variants, model Preview, explicit project/global
  Media Library copy and Generation regeneration through public owner ports. Canvas imports
  none of their viewer/editor/provider internals, and unavailable owners omit actions.
- Desktop Generation uses one workspace-owned coordinator per stable workspace identity.
  A generated action requires a persisted succeeded Job whose exact result locator equals
  the selected node locator. Regenerate submits a new Job at the authoritative revision,
  observes it to a terminal snapshot, commits a new durable output and projects immutable
  summary/lineage; Canvas summary text never becomes a recipe fallback.
- A result-only Desktop Generation composition intentionally advertises no empty image,
  audio, video or model creation kinds. Draft/edit-and-generate remains hidden until a
  Generation/Agent-owned draft surface is composed.

## Requirement scenario evidence

The following matrix records deterministic result and path evidence for every delta-spec
scenario. A conditional UI scenario is covered by the owner-capability contract even when the
current Desktop composition intentionally omits that owner. Provider-backed behavior is called
out separately and is not inferred from key-free evidence.

### Canvas material origin and Generation actions

| Scenario | Implementation and path evidence |
| --- | --- |
| Add referenced and generated images | `canvas-content-authoring.test.ts` creates canonical referenced Media nodes; `canvas-generation-projection.test.ts` commits generated Media nodes from exact `generated-output` locators. |
| Add an Entity representation | `canvas-content-authoring.test.ts` and `desktop-canvas-material-authoring.test.ts` retain Entity/binding/role evidence separately from the active representation locator. |
| Add an ordinary workspace file | `desktop-canvas-material-authoring.test.ts` projects authorized `workspace-file`, `document-entry` and `package-resource` locators without Generation evidence. |
| Add a generated output | `canvas-generation-projection.test.ts` preserves output identity, revision, digest/path-bearing locator fields, immutable evidence and lineage. |
| Legacy node lacks canonical origin | `canvas-material-migration.test.ts`, `validator.test.ts` and `materialPresentation.test.ts` reject path, ResourceRef and provenance-only classification outside explicit inspection. |
| Add a workspace or linked-library file | `desktop-canvas-material-authoring.test.ts` preserves the exact authorized locator and asserts no import/copy handler participates. |
| Add content from an unlinked global Media Library | `desktop-canvas-material-authoring.test.ts` requires explicit link-or-copy before node commit. |
| Add an arbitrary external file | `desktop-canvas-material-authoring.test.ts` proves bounded atomic import, fingerprinting and visible rename policy under `neko/imports/<kind>/`. |
| External import fails | The same Desktop test poisons expired, conflicting and oversized requests and asserts no Canvas mutation or partial import. |
| Start Generation from the add-node surface | `canvas-host-runtime-session.test.ts`, `canvas-webview-host.test.ts` and `contract.test.ts` route create mode to an instance-scoped Generation draft/Job and never create source-less Media/File nodes. |
| Generation completes | `canvas-generation-projection.test.ts` commits only successful owner results and links exact output nodes to the Job/input lineage. |
| Generation fails or is cancelled | `canvas-generation-projection.test.ts` keeps failed/cancelled Job nodes and diagnostics while asserting empty output refs. |
| Crop a referenced image | `canvas-content-authoring.test.ts` and `desktop-canvas-material-authoring.test.ts` cover the common owner-produced derivative transaction: new node/lineage, unchanged source locator and bytes. |
| Apply AI redraw to a referenced image | `canvas-content-authoring.test.ts` commits an AI derivative with Generation evidence as a sibling without mutating the referenced source. |
| Owning capability is unavailable | `canvas-material-action-catalog.test.ts`, `desktop-canvas-material-actions.test.ts` and `CanvasAddActionPopover.test.tsx` omit unavailable actions instead of routing a no-op. |
| Regenerate a generated result | `coordinator.test.ts`, `desktop-canvas-generation-runtime.test.ts` and `canvas-generation-projection.test.ts` create a distinct Job/output with `regenerateOf` lineage and no overwrite. |
| Generate with edited parameters | `desktop-canvas-material-actions.test.ts` proves the action router invokes only an injected Generation/Agent owner and projects its returned new Job; the key-free `generation-regenerate-result-projection` Agent case asserts a second `SubmitGenerationJob` and forbids retry/overwrite. Real provider execution remains authorization-blocked. |
| Generated result lacks a resolvable recipe | `desktop-canvas-generation-runtime.test.ts`, `SelectionMaterialGenerationBar.test.tsx` and `materialPresentation.test.ts` retain historical summary/preview while omitting execution authority. |
| Select a referenced video | `canvas-material-action-catalog.test.ts` and `desktop-canvas-material-actions.test.ts` project only matching Preview/Cut/read/derive owners and no Generation history. |
| Select a generated audio result | `canvas-material-action-catalog.test.ts` and `materialPresentation.test.ts` preserve the audio renderer type while projecting Generation summary and owner-backed actions. |
| Select multiple mixed nodes | `canvas-material-action-catalog.test.ts` intersects descriptors across the exact selection and rejects single-selection actions. |
| Owner authority changes after projection | `canvas-host-runtime-session.test.ts` re-resolves the revision-bound descriptor and rejects stale identity or unavailable owners before effects. |
| Save and reopen generated nodes | `desktop-canvas-runtime.test.ts` restores locators, Job references, summaries and lineage and rebuilds runtime action descriptors after restart. |
| Runtime value enters persistent payload | `canvas-material-contracts.test.ts` and `validator.test.ts` reject absolute paths, runtime/cache/temp URLs, credentials, callbacks and live runtime values. |

### Legacy Asset catalog retirement

| Scenario | Implementation and path evidence |
| --- | --- |
| Verify the canonical path | Desktop authoring/copy/action tests assert ContentLocator and Media Library handlers; `check:legacy-debt` reports zero retired Asset catalog violations. |
| Canvas requests legacy promotion | `desktop-canvas-media-library-copy.test.ts` returns a migration-required diagnostic before any content read or mutation. |
| Canvas copies to an explicit media destination | Project/global copy tests assert the selected Media Library owner is invoked and no Asset membership is created. |
| Keep a migration archive | `entity-asset-projection-repository.test.ts` exercises the explicit `migrateLegacyAssetGraph` recovery path, verifies backup/archive retention and proves existing canonical projections are preserved; normal authoring has no migration call site. |

### Media Library resource entry

| Scenario | Implementation and path evidence |
| --- | --- |
| Browse a linked media file | `desktop-resource-browser-source.test.ts` projects linked media through exact portable locators without catalog membership. |
| Open a non-cataloged workspace file | `desktop-canvas-material-authoring.test.ts` directly authorizes and projects workspace content that has no catalog record. |
| Add a linked media file to Canvas | The exact-locator authoring test asserts no byte copy or per-file link creation. |
| Add a global library resource to a project Canvas | The global link/copy authoring test blocks Canvas mutation until one explicit project-authorized outcome exists. |
| Remove a Media Library | `desktop-global-media-library-files.test.ts` and `desktop-resource-browser-source.test.ts` remove only the managed link and preserve the target directory. |
| Copy a generated result into a project library | `desktop-canvas-media-library-copy.test.ts` invokes the selected project-linked destination and preserves the generated source identity. |
| Copy a Canvas material to a global library | The global copy test returns the global projection without persisting the physical root in Canvas. |
| Reject ambiguous save-to-asset action | `desktop-canvas-media-library-copy.test.ts` rejects the retired request with `migration-required`. |
| Reject implicit target mutation | `canvas-material-contracts.test.ts` requires destination scope, identity and conflict policy; Desktop copy handlers reject stale or missing ownership before reading bytes. |

## Focused implementation verification

- `pnpm --filter @neko/app-desktop test`: 55 files / 293 tests.
- `pnpm --filter @neko-canvas/domain test`: 5 files / 51 tests.
- `pnpm --filter @neko-canvas/webview test`: 63 files / 374 tests.
- `pnpm --filter @neko/generation test:run`: 5 files / 34 tests.
- `pnpm --filter neko-assets test`: 20 files / 119 tests.
- `pnpm --filter @neko/media test:run`: 8 files / 52 tests.
- `pnpm --filter neko-preview test -- --run`: 45 files / 285 tests.
- `pnpm --filter neko-cut test -- --run`: 25 files / 121 tests.

## Desktop production runtime acceptance

- `pnpm --filter @neko/app-desktop package` produced
  `apps/neko-desktop/out/OpenNeko-darwin-arm64/OpenNeko.app`.
- The packaged app was launched with an isolated Electron user-data directory and a
  synthetic, gitignored workspace derived from `~/Git/neko-test`. The fixture contained
  one canonical referenced image node and its `workspace-file` content.
- Canvas and the project Resource Browser loaded together. The Add menu projected Image,
  Video and Audio source actions; choosing Image exposed only `Import file` and
  `Reference project content`. Cancelling the source decision left the Canvas at one node,
  proving no source-less Media node was committed.
- The first production pass exposed an actual revision race: selecting the referenced
  image could query owner actions while the selection presentation mutation was still in
  flight, causing `Canvas material action revision is stale; expected 1`. A deterministic
  bridge-delay regression was added to `canvas-webview-host.test.ts`. The Webview Host now
  waits for its instance-scoped mutation tail before constructing the revision-bound
  action query; stale Host checks remain fail-visible.
- The rebuilt production app passed the original reproduction. Selecting the referenced
  image projected Preview, Reveal and Copy, with no Generation history or regenerate
  action. Dispatching Preview opened a `test.png image/png` Preview Main View and rendered
  the image.
- Electron stderr contained only normal runtime/Host/renderer initialization and the
  final `Desktop AppHost disposed` lifecycle message. No UI, IPC, authorization or media
  diagnostic remained, and no OpenNeko process survived application quit.
- Redacted evidence is stored under the gitignored
  `reports/desktop-functional/normalize-canvas-material-origin-and-generation-actions-2026-07-31/`
  directory (`01-canvas-and-resource-dock.png`, `02-referenced-node-actions.png`,
  `03-preview-dispatch.png`). No credential or real provider call was used.

## Evaluation authorization blocker

The authorized real-provider generation acceptance case has not been run. It requires an
explicit provider and model choice, approval to use the configured credential, and cost
authorization for the selected image/audio/video/model request. Until those approvals are
provided, the remaining risk is that provider authentication, model-specific request
translation, billing limits and returned media codecs have only key-free contract and
projection coverage, not end-to-end provider evidence. This blocker must not be interpreted
as real Generation acceptance.

## Quality review

- Risk level: L4. The change affects the core Canvas authoring workflow, shared persisted
  contracts, Webview/Host messages, Generation Job routing, Media Library mutation and
  Desktop production packaging.
- Architecture review found no open blocking or suggestion-level finding. `ContentLocator`,
  `JobRef<'generation'>`, owning Media Library services and public Preview/Cut/Generation
  ports remain the canonical shared boundaries. Canvas owns only layout, references and
  action projection; it does not add a package-local path resolver, cache, file IO service,
  provider runtime or viewer/editor implementation.
- UI reuse review retained the existing Canvas add popover, selection toolbar, node
  renderers and shared UI primitives. Owner-specific behavior enters through descriptors
  and Host adapters instead of a second toolbar or package-local design system.
- The three delta specs contain 37 scenarios (24 Canvas material, 4 legacy Asset catalog,
  9 Media Library). Every scenario has deterministic implementation/path evidence in the
  matrices above, including poisoned legacy paths and no-fallback assertions.
- `check:quality` initially exposed two repository inventory violations: Desktop imported
  Preview's EPUB Vite plugin through a package-relative path, and `@neko-cut/node` was
  absent from test ownership. Preview now exports the plugin through its public package
  entry, Desktop consumes that entry, and the Cut node package is explicitly aggregated by
  the existing root `neko-cut` test owner. The focused checks and the complete quality gate
  pass after those corrections.

## Repository verification

- `pnpm build`: passed, 9/9 tasks; rebuilt
  `apps/neko-desktop/out/OpenNeko-darwin-arm64/OpenNeko.app`.
- `CI=1 pnpm test`: passed, 30/30 workspace test tasks.
- `pnpm check`: passed; this executed `pnpm check:unused` and dependency-cruiser reported
  no violations across 1,245 modules.
- `pnpm check:legacy-debt`: passed with zero blocking findings and zero retired Asset
  catalog violations.
- `pnpm check:quality`: passed, including 92/92 test-orchestration cases, boundary/strict
  checks and strict validation of all 92 OpenSpec items.
- `pnpm test:agent:eval`: passed, 40 files / 282 tests and 24 suites / 54 key-free dry-run
  cases. This is harness/path validation, not real provider acceptance.
- `openspec validate normalize-canvas-material-origin-and-generation-actions --strict`:
  passed.
- `git diff --check`: passed.

## Residual risks

- Provider/model/credential/cost authorization remains unavailable. No real provider-backed
  Generation case ran, so authentication, billed execution, model request translation and
  creator-facing quality remain unverified.
- Returned image/audio/video/model codec compatibility is covered by deterministic locator,
  Preview and dispatch tests, but not by real provider output. An authorized provider run
  must verify the selected model's actual container/codec against Desktop Preview and the
  applicable owner adapter.
- Legacy NKC fixtures cover canonical migration, ambiguous inspection and invalid runtime
  values, but no inventory of real prelaunch user documents was migrated in place. Ambiguous
  documents intentionally fail closed and may require explicit relinking. Migration and
  rollback must preserve original files, `neko/imports`, generated outputs and the recovery
  archive.
- The legacy-debt ledger validator passes but warns that
  `packages/neko-types/src/nkc/canvas-material-migration.ts` is a high-volume cleanup
  candidate without ledger path coverage. The code is intentionally migration-boundary
  logic; ledger classification remains a maintenance follow-up.
- One Desktop preload test timed out once at 10 seconds under concurrent full-repository
  load. Focused Desktop tests, the completed repository test run and subsequent production
  packaging passed; resource-contention flakiness remains observable but unreproduced.
