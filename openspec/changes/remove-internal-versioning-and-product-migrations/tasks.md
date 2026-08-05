## 1. Governance and inventory

- [x] 1.1 Add an exact repository audit for internal version fields, versioned identifiers/paths, migration code, and version-like data-generation aliases, with focused self-tests and no broad directory exclusions.
- [ ] 1.2 Add machine-readable third-party, user-managed domain, and verified correctness allowance registries recording each exact occurrence, owner, normative/business requirement or correctness invariant, concrete consumer/workflow, field scope, and isolation/removal rule.
- [x] 1.3 Wire the audit into `check:quality` and record the initial owner-grouped violation inventory without allowing new internal debt.
- [ ] 1.4 Update stable architecture documents and conflicting active OpenSpec artifacts so they no longer require internal versioning, product migration, poison handlers, or automatic repair.
- [x] 1.5 Extend development governance and the repository debt audit to cover explicit and hidden internal multi-path markers, adapter/provider fallback, projection authority drift, implicit owner selection, and path-level canonical-route evidence without changing product runtime code.

## 2. Component presentation and local failure

- [x] 2.1 Remove Agent Tab render-state schema and legacy write-back, remove epoch-dependent storage keys, and test per-draft rejection with valid sibling drafts and surfaces still available.
- [x] 2.2 Remove Preview model staging schema and internal 3D Reference protocol versions, replace stale-generation routing with exact request/session ownership, and test panel-local failure in Webview and Desktop consumers.
- [x] 2.3 Remove Resource Browser and Asset Center contract versions across domain, Node, Webview, preload, and Main producers/consumers; retain same-source Vite wiring and prove one invalid request or entry cannot disable sibling facets or workspaces.
- [x] 2.4 Remove versioned UI storage keys and component state from shared resizable and adjacent Webview presentation utilities, preserving stable optional-field semantics and local diagnostics.

## 3. Host and Desktop contracts

- [x] 3.1 Remove Desktop Workbench, Scene, sidebar, Shell, application settings, grant, bridge, and application contract versions across `@neko/host` and Desktop adapters with producer/consumer tests.
- [x] 3.2 Delete Shell v1-v7, Workbench v1-v4, Scene, and application-settings migration branches; parse stable records independently so one invalid window or component does not block valid projects and windows.
- [x] 3.3 Remove Desktop Agent, automation, launch, extension, Assistant resource, Preview, Canvas, and Cut bridge versions while preserving sender-bound validation and request-local failure.
- [x] 3.4 Remove versioned Desktop state and secret filenames and internal application-release projection; retain Electron release metadata only at the required build/About boundary.
- [x] 3.5 Run Host and Desktop producer/consumer tests, architecture boundary tests, typechecks, and real Electron startup/switching scenarios proving invalid local state remains local.
- [x] 3.6 Reuse the shared UI ErrorBoundary at the Desktop renderer root and exact Workbench instance/slot boundaries; prove one Preview, Resource, Asset, Extension, Project, or Settings render failure cannot unmount the sidebar, Workbench, sibling surfaces, or retained instances.

## 4. Product migration retirement

- [x] 4.1 Remove Desktop startup migration wiring, retired JSON state adapter, downgrade export product command, and product reachability to legacy state readers.
- [x] 4.2 Remove the Local Metadata migration contract, schema registry table, namespace migration executor, versioned JSON state repository, desktop-state migration, and package public exports.
- [x] 4.3 Replace rebuildable cache/index namespace migrations with stable table initialization and ordinary source discovery that reports invalid rows individually without automatic repair.
- [x] 4.4 Delete Media, Search, Entity projection, Resource Cache, generated-output, and generated-asset product migration modules and prove they are absent from imports, registries, startup, build output, and ordinary tests.
- [x] 4.5 Add reachability checks proving any future explicit offline repair tool remains outside product packages, public entries, build, startup, normal tests, and CI.
- [x] 4.6 Add an explicit Project Entity offline repair tool outside the product graph that requires an exact file and Entity identity plus confirmation, preserves an immutable backup, atomically removes only that rejected record, and validates the written result.

## 5. Agent contracts and persistence

- [x] 5.1 Remove internal Agent Webview protocol, Home, Root presentation, launch, facts, effective configuration, conversation context, capability, profile, composite artifact, and creative workflow versions across producers and consumers.
- [x] 5.2 Delete Agent conversation-context, lifecycle snapshot, Pi database, provider/profile, Skill compatibility, and legacy storage migration paths from product runtime.
- [x] 5.3 Replace projection/message queue versions and renderer/connection epochs with instance-owned request identity or live non-persisted event ordering, without aliases that determine data validity.
- [x] 5.4 Add Agent producer, Webview consumer, persistence rejection, session switching, restart, and unaffected-conversation tests, including canonical-path and removed-import assertions.
- [x] 5.5 Run applicable `neko-agent-evaluation` visible Electron and hidden full-session real-API coverage and record any unavailable matrix lanes as residual risk.

## 6. Creative domain contracts and files

- [x] 6.1 Remove Canvas NKC, authoring, playback, Workspace Board, storyboard, cut-draft, ledger, and Host contract versions; delete NKC and Canvas material/storyboard product migrators.
- [x] 6.2 Remove Cut Host/media descriptor and export Job versions and migrations; redesign preview generations and document revisions with exact request/session ownership and owner serialization.
- [x] 6.3 Remove internal Media descriptors and `neko-pcm-f32le-v1` versioning while retaining externally required codec and FFmpeg data only at the media adapter boundary.
- [x] 6.4 Remove Preview session, staging, preset-ID version suffixes, and internal protocol versions while retaining glTF, GLSL, Three.js, and other required external format values at adapters.
- [x] 6.5 Remove Project Entity document/binding/graph schema and concurrency versions plus all Entity migration inventory, archive, restore, and projection migration paths; retain exact managed Asset revision refs and keep invalid entities local to exact records.
- [x] 6.6 Remove Generation operation, lifecycle, output projection, Quality, Search index, Character memory/transcript format, and Content project-file versions and product migrations while retaining immutable CharacterVersion identity.
- [x] 6.7 Run each owning package's producer/consumer tests and typechecks plus focused Node/FFmpeg and Webview runtime tests, with invalid-record sibling-path assertions.

## 7. Runtime version-alias redesign

- [ ] 7.1 Audit every remaining `revision`, `epoch`, `generation`, numeric version suffix, versioned route/table/key, and version-named helper; classify third-party versions, user-managed business versions, and verified correctness tokens separately from meaningless technical versioning.
- [ ] 7.2 Replace unnecessary internal CAS/version checks with owner serialization, exact request identity, instance isolation, or boundary-local content fingerprint checks; retain only tokens with an exact consumer, invariant, no-version design analysis, and removal condition.
- [ ] 7.3 Replace asynchronous generation counters with cancellation scopes and request identities, and verify late completions cannot mutate another instance.
- [x] 7.4 Delete versioned private workspace package metadata where the toolchain does not require it; retain only verified build, dependency, and release manifest values.
- [ ] 7.5 Run the repository audit with zero unapproved occurrences and validate every external, user-managed domain, or correctness allowance against its exact source, requirement/invariant, and isolation test.

## 8. Completion and quality gates

- [ ] 8.1 Run focused package tests and typechecks after each owner slice, then run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:quality`, `pnpm check:legacy-debt`, `pnpm check:unused`, and `git diff --check`.
- [ ] 8.2 Run required real Electron Desktop scenarios for startup, workspace switching, Resource Browser, Agent, Preview, Canvas, Cut, CSP, IPC, focus, and media lifecycle.
- [ ] 8.3 Validate this change and all modified active changes with strict OpenSpec validation and record canonical-path, removed-path, external-allowance, local-failure, and user-data evidence.
- [ ] 8.4 Complete `neko-quality-review`, document actual commands and residual risks, and keep the change open until the repository audit reports no internal version or product migration path.
