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
- [x] 9.3 Run the relevant real visible Electron and provider-backed Character flows only with explicit
      provider/model/cost authorization; list unexecuted local Asset checks as unavailable residual risk rather
      than substituting mocks or hidden success paths. Asset cloud and World validation are outside this change.

## 10. Project Content presentation

- [x] 10.1 Add a strict Project-owned read-only Project Content contract and service that composes exact
      CharacterProject associations, WorldProject records, unassociated confirmed Entity elements and
      Entity candidates without copying owner payloads or inferring Character/World from Entity kind.
- [x] 10.2 Remove Entity from the Resource Browser source contract and UI so Resources exposes only Files,
      Media and Assets; delete all Entity handlers, intents and tests from the Assets-owned path in the same switch.
- [x] 10.3 Add a Project Webview surface with Characters, Worlds, Other Elements and Candidates groups,
      owner-qualified identity/availability and explicit empty/diagnostic states.
- [x] 10.4 Wire sender-bound Desktop Project Content IPC and navigation while keeping composition in
      `@neko/project`; add producer, codec, delegation, Webview and lifecycle tests.
- [x] 10.5 Update stable architecture/status documentation and run focused quality/UI validation, including
      proof that associated Characters appear once and no Entity kind is promoted into a World.

## Current validation evidence (2026-08-13)

- Project Content is the default Project Main View and Resources exposes only Files, Media and Assets. The
  Project contract/service tests prove associated Characters are emitted once, their Entity is absent from
  Other Elements, scene/location Entity kinds do not create Worlds, candidates remain unconfirmed and no
  Character/World/Entity payload is copied into the projection.
- Passed Project typecheck and 49 tests, Project Webview typecheck and 8 tests, Assets Domain typecheck and 138
  tests, Assets Node typecheck and 79 tests, Assets Webview typecheck and 60 tests, Host 312 tests, Desktop
  typecheck and 178 focused Main/preload/renderer tests. Strict OpenSpec validation, package/application
  boundaries, product-status reachability, legacy-debt and `git diff --check` pass. A fresh darwin-arm64 Desktop
  package also succeeds.
- The visible Electron `project-content` scenario passed through the production preload/Main bridge at
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-13T01-46-32.082Z-project-content-development/report.json`.
  It verifies the four ordered groups and empty states, the three Resources sources, no horizontal overflow at
  `1440x900` and the supported minimum `960x640`, and Project Content Root unmount after navigation. Both
  screenshots were inspected directly; no overlap, clipping or unreadable state was observed, and the report
  contains no console error, warning or runtime exception. The retired Assets-owned Entity scenarios and
  selectors were deleted rather than retained as alternate product paths.
- `pnpm smoke:webview` remains blocked before reaching the affected package because `@neko/agent-webview`'s
  build command does not create the `dist` directory expected by the shared smoke script. `check:unused` remains
  red for unrelated `@neko/generation` and `@earendil-works/pi-ai` declarations. The internal-versioning audit
  remains red on the current dirty-worktree allowance ledger and existing Character continuity/relationship
  work; this increment adds no Project Content contract version or version-dispatch path.
- The explicitly authorized visible Electron Character Creator case passed with requested and effective
  `nekoapi-chat / gpt-5.6-luna` at
  `reports/agent-eval/character-creator-visible-final-2026-08-13/skill.character-creator/reviewable-character-proposal/focused-1-msrcky3q-r1/result.json`.
  Hard gates prove the exact builtin Character Creator fingerprint, assistant binding, terminal completed Turn,
  non-empty reviewable answer and absence of `chara.character.fillDraft`; usage records 6,581 input and 1,301
  output tokens with no retry. The visible Desktop report records no console error, warning, runtime exception or
  poisoned resource request.
- The first real attempts failed visibly and were not counted as acceptance: initial Turn facts were unavailable
  to the later Session connection, explicit Skill activation had no receipt, and React Virtualizer attempted
  `flushSync` during the MessageList lifecycle. One connection-neutral facts store now hands the exact initial
  Turn record to the later Session projector without copying facts; Pi emits the exact validated Skill activation
  receipt; MessageList lets React schedule virtual measurement updates. Runtime, Desktop and Webview regression
  tests cover exact identity, sibling Conversation isolation, disposal, stale activation rejection and scrolling.
- Local Asset provider-backed checks were not part of the selected Character case and remain unavailable residual
  risk rather than a mock success. Asset cloud and complete World authoring/runtime remain outside this change.
<!-- SUCCESSOR: simplify-project-authoring-and-installed-libraries -->
> **Successor disposition (2026-08-14):** Completed standalone Character tasks are historical evidence. No new standalone mutable authoring behavior may be added here; installed-release semantics and recovery are successor-owned.
