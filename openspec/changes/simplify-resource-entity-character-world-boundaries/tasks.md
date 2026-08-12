## 1. Architecture and active-change reconciliation

- [x] 1.1 Update stable Chinese architecture/domain documentation and navigation with the Resources,
      Project Entity, Character and World ownership model, canonical creation flows and usage/reference split.
- [x] 1.2 Add a dated status gap inventory that distinguishes implemented canonical foundations,
      superseded-but-reachable paths, missing contracts, user-data qualification and unavailable product
      capabilities.
- [x] 1.3 Reconcile `manage-project-entities-as-publishable-assets`,
      `establish-manifest-backed-asset-library`, `refine-character-management-authoring-and-version-graph`,
      `define-world-topology-and-data-contracts` and downstream World changes; remove or explicitly supersede
      conflicting requirements/tasks without leaving two successful paths.

## 2. Existing data and reachability qualification

- [x] 2.1 Inventory real `ProjectEntityRecord.facts`, Entity Asset provenance/package bytes, legacy
      Character Registry and creative Entity composition records without logging user payloads; classify exact
      user-authored fields and required unsupported-state/repair presentation.
- [x] 2.2 Inventory public exports, production registrations, Desktop handlers, tests and stored references
      for Entity Asset and Entity-owned Character interaction; identify the atomic deletion boundary and prove
      whether any non-test consumer exists.
- [x] 2.3 Add qualification tests that preserve unsupported user bytes, isolate record-local diagnostics and
      prohibit normal migration, compatibility, fallback, automatic association and latest-version repair.

## 3. Minimal Project Entity and association contracts

- [x] 3.1 Replace unrestricted Entity semantic payload/provenance with the minimal project identity,
      lifecycle and representation contract in one canonical shape; update every producer, consumer, fixture
      and codec test atomically.
- [x] 3.2 Add Project-owned exact Entity-to-Character association and cardinality contracts beside canonical
      local Character membership/external dependency facts without adding `entityId` to CharacterProject.
- [x] 3.3 Add producer, Project consumer/delegation, invalid-association, standalone/project-local and
      sibling-isolation tests; poison-test name matching, active/current Project inference and copied Character
      payload.

## 4. Canonical Character creation and interaction composition

- [x] 4.1 Route manual input, prompt, file evidence, exact Asset representation and confirmed Entity context
      into the same fresh CharacterProject creation contract/repository while preserving the separate bounded
      `.neko-character` import workflow.
- [x] 4.2 Compose project-local creation across fresh CharacterProject, Project membership, Entity
      create-or-select and exact association with a fail-visible partial receipt/retry that never redirects or
      rolls back valid user data.
- [x] 4.3 Remove Entity-owned dialogue/Room/embody contracts and handlers; project exact Chara-owned Open
      Character/Open Studio/Start Interaction handoffs only for a valid association and exact required
      CharacterVersion.
- [x] 4.4 Add Character Creator, Chara, Entity, Project, Agent launch and Webview tests proving one creation
      path, exact destination/approval, no automatic version/runtime and no generic Entity interaction fallback.

## 5. Resource presentation and usage projections

- [x] 5.1 Replace mandatory peer resource facets with one owner-preserving Resources presentation and
      source filters while retaining exact File, Media connection, Asset and Project Element operations,
      selection state and fail-local diagnostics.
- [x] 5.2 Add a read-only aggregated resource/search projection that can compose explicitly associated
      Entity/Character presentation without copying identities or supplying generic mutations.
- [x] 5.3 Implement owner-qualified occurrence, usage, recent-use, dependency-summary and availability
      projections in Search/local metadata with bounded reconciliation and no authoritative domain payload.
- [x] 5.4 Require current typed reference readers for merge/delete/uninstall/version removal and add tests
      proving stale or incomplete usage projections cannot authorize destructive operations.

## 6. Retired Entity and publication paths

- [x] 6.1 Remove legacy `character-registry`, creative Entity asset-composition and replaced representation
      exports/registrations/readers after canonical consumer switch; preserve existing bytes and add reachability
      poison tests.
- [x] 6.2 Remove Entity Asset instantiate/publish/provenance/diff/apply operations from public contracts,
      Resource Browser capabilities, Desktop wiring and production registration, then delete implementation
      whose reachability audit finds no valid consumer.
- [x] 6.3 Add Assets/Entity/Chara package and Desktop delegation tests proving ordinary resources use the
      local Asset lifecycle, Character portability uses Chara and no hidden Entity Asset success path remains.

## 8. Desktop and UI acceptance

- [x] 8.1 Keep Desktop Main/preload/renderer limited to sender/window authorization, native adapters, typed
      IPC and visible package Root composition while moving all association, creation, reference and projection
      policy into owning packages.
- [x] 8.2 Update user terminology to Resources, Entity semantics, Characters and Project Elements; ensure one linked
      Entity/Character card, visible standalone/project-local/external placement and explicit unavailable or
      needs-attention states.
- [x] 8.3 Add package Webview and Desktop delegation/lifecycle tests plus visible Electron scenarios for
      resource source filtering, candidate-to-Character creation, file/Asset seed creation, exact interaction
      launch, missing resource and stale usage.

## 9. Quality gates and completion evidence

- [x] 9.1 Run focused formatting, strict OpenSpec validation, affected package typechecks/tests and
      architecture/no-versioning/unused/storage-authority gates; record actual commands, results and unrelated
      failures.
- [x] 9.2 Run `neko-ui-validation` for changed resource, Entity and Character surfaces and
      `neko-quality-review` for canonical owner/producer/consumer/repository/handler evidence, removed-path
      poison proof, user-data preservation and residual risks.
- [ ] 9.3 Run the relevant real visible Electron and provider-backed Character flows only with explicit
      provider/model/cost authorization; list unexecuted local Asset checks as unavailable residual risk rather
      than substituting mocks or hidden success paths. Asset cloud and World validation are outside this change.

## Current validation evidence (2026-08-12)

- Passed strict OpenSpec validation; affected Entity, Search, local metadata, Assets, Chara, Project,
  Agent, Webview and Desktop typechecks/tests; package/application boundary and storage-authority gates;
  focused formatting; `git diff --check`; and the full key-free Agent Evaluation harness (26 suites,
  76 cases). The retired generated-output Entity-binding Evaluation case was removed with its deleted
  Entity Tool path.
- The visible Electron `resource-browser-invalid-entity-document` scenario passed with direct screenshot
  review: invalid Entity records remain local diagnostics and valid Files remain usable. The visible
  `resource-browser-entity-management` scenario also passed after isolating its unrelated Cut coverage and
  correcting the shared CDP text-replacement command. Its ten screenshots were inspected directly and cover
  Files creation menus, narrow Resources layout, Entity candidate/confirmed states, explicit Character
  destination confirmation, the exact `MIO Companion` Character Studio handoff and missing-binding
  `needs-attention`; no clipping, overlap or unreadable state was observed. The report contains no console
  error, warning or runtime exception. Duplicate reference-owner blocker wording remains a non-blocking
  presentation refinement.
- `check:unused` no longer reports the removed Agent-to-Entity dependency; it remains red for unrelated
  `@neko/generation` / `@earendil-works/pi-ai` declarations. `check:no-internal-versioning` remains red on
  the dirty-worktree allowance ledger and existing Character domain-version/revision findings. These results
  are recorded quality findings rather than hidden successes; the new resource usage projection files add no
  internal-versioning finding.
- Added Search-owned owner-qualified usage projection contracts, bounded complete-source reconciliation,
  local-metadata SQLite persistence with row-local diagnostics, and a Project composition producer. Full
  Search Domain (85), Search local metadata (12), local metadata (90), Project (41) and Entity Domain (57)
  test suites passed with all five affected typechecks. Strict OpenSpec validation, package/application
  boundaries, storage authorities, legacy-debt, focused Prettier and `git diff --check` passed. Entity
  destructive-operation poison tests prove the usage projection is not queried; incomplete authoritative
  reference participants keep operations unavailable.
- Real provider-backed Character evaluation was not run because no provider/model/cost authorization was
  supplied. Local manifest-backed Asset representation creation remains explicitly unavailable and
  fail-visible; Asset cloud and World remain outside this change.
