## 1. Contract and owner composition

- [x] 1.1 Define purpose-scoped Home management contracts for project asset queries and sanitized
      Skill/extension capability projections.
- [x] 1.2 Compose those contracts from the existing Assets Resource Browser source, Pi SkillHost and
      Shell project/domain authorities; keep absolute paths and Skill locators in Main.
- [x] 1.3 Add producer/consumer, sender identity, project identity and source-reuse tests.

## 2. Agent start handoff

- [x] 2.1 Add a one-shot initial input prop to the package-owned Agent Root and prove it fills the
      tabless composer without sending or creating a parallel conversation runtime.
- [x] 2.2 Implement Home project selection/open plus initial-input handoff and duplicate-open focus.

## 3. Home surfaces

- [x] 3.1 Replace Home navigation with Start Creating, Asset Center, Plugins and All Creations using
      the shared Desktop sidebar style and icon controls.
- [x] 3.2 Implement Asset Center project/facet/search presentation and real project Resource Dock
      navigation.
- [x] 3.3 Implement Plugins Skill/Extensions presentation and explicit external Plugin Host
      unavailability.
- [x] 3.4 Implement All Creations over full Project and Agent conversation projections.
- [x] 3.5 Update English/Simplified Chinese bundles and focused renderer accessibility/route tests.

## 4. Validation

- [x] 4.1 Run Desktop/Agent/Assets focused tests, typecheck, agent boundaries, strict OpenSpec
      validation and diff checks.
- [x] 4.2 Run the packaged Electron Home scenarios without VS Code Extension testing and record
      remaining external Plugin Host and real provider validation blockers.

## 5. Home startup and Agent Home correction

- [x] 5.1 Add regression coverage for the version 1 restore-default migration, version 2 explicit
      restore preference, and Shell Home activation without deleting restored Project tabs.
- [x] 5.2 Replace the oversized Home brand Hero and accent glow with the compact Agent Home
      composition while retaining the project-scoped one-shot handoff and real shortcuts.
- [x] 5.3 Run focused Desktop tests, typecheck, production package build, strict OpenSpec validation,
      diff checks and packaged Electron startup/visual acceptance.

## 6. Agent Home task-launch correction

- [x] 6.1 Add a red-capable renderer regression that rejects the old heading/composer/three-button
      skeleton and requires the task-launch composition, shared composer prefills and non-canvas Home
      surface.
- [x] 6.2 Recompose Start Creating as a Codex-inspired Desktop task launchpad with real common-intent
      and quick-template prefills while preserving the existing Project Agent handoff.
- [x] 6.3 Re-run focused Desktop tests, typecheck, strict OpenSpec validation, production package
      build and real Electron visual acceptance.

## 7. Shared primary-sidebar frame correction

- [x] 7.1 Add a red-capable renderer regression requiring Home and Project to use the same sidebar
      frame contract and current expanded geometry.
- [x] 7.2 Move inset/frame geometry out of the two host layouts into one shared sidebar frame and
      use one Workbench-owned width/visibility projection while preserving navigation semantics.
- [x] 7.3 Re-run focused Desktop tests, typecheck, strict OpenSpec validation, production package
      build and real Electron Home/Project visual acceptance.

## 8. Flush compact rail and hover reveal

- [x] 8.1 Add red-capable renderer regressions for the flush frame marker, compact hover-reveal
      contract and complete compact-sidebar projection.
- [x] 8.2 Remove card frame/inset styling from the application sidebar, keep Workbench-only panel
      gaps, and implement non-persistent hover/focus overlay reveal for the compact rail.
- [x] 8.3 Verify fixed-expanded, compact and hover-expanded states in the real Desktop Electron host,
      then re-run Desktop tests, typecheck, package build, strict OpenSpec validation and diff checks.

## 9. Continuous hover hit region

- [x] 9.1 Add a red-capable style regression proving hover reveal does not animate the sidebar hit
      width.
- [x] 9.2 Make the complete persisted expanded width immediately pointer-active while keeping
      non-geometric overlay feedback.
- [x] 9.3 Re-run the fast lateral pointer repro in the real Desktop Electron host, then run Desktop
      tests, typecheck, package build, strict OpenSpec validation and diff checks.

## 10. Home primary-sidebar mutation authority

- [x] 10.1 Add red-capable Shell service coverage proving Home may persist a primary-sidebar-only
      mutation without an active Content Project and rejects other Workbench mutations.
- [x] 10.2 Allow only that Window-owned presentation mutation on Home while preserving Project/View
      identity validation for the complete Workbench path.
- [x] 10.3 Re-run the Home collapse action in the real Desktop Electron host, then run Desktop tests,
      typecheck, package build, strict OpenSpec validation and diff checks.

## Validation evidence

- Packaged the production Electron application with `pnpm --filter @neko/app-desktop package`.
- Opened `/Users/feng/Git/neko-test` in an isolated packaged application instance and verified:
  Start Creating prefills the existing Agent composer without sending, Directory search resolves
  `test.glb`, the configured Media Library remains honestly empty, Assets resolves the confirmed
  `全班` / `小橘` / `猫妈妈` entities, Plugins shows real Pi Skills and built-in capability status,
  and All Creations reuses the real project/conversation projections.
- External Plugin Host installation/execution remains a Phase 3 blocker by design.
- Real provider login/model invocation remains blocked on the existing provider/model/cost
  authorization gate and was not exercised by this Home presentation change.
- Migrated the existing local v1 Desktop settings projection from the inherited `restore` default to
  `home` without deleting the two restored recent Projects. The same runtime preserved an explicit
  v2 restore preference in repository coverage.
- Restarted the real Electron Main process and verified through macOS accessibility plus screenshot
  evidence that OpenNeko opens on the compact Start Creating Agent Home with the Project selector and
  real shortcuts; no oversized N Hero, accent glow, Project workbench, or VS Code host was present.
- Re-ran the real Electron application after the task-launch correction and verified that Home uses
  the shared collapsible `ApplicationPrimarySidebar`, renders a plain application surface instead of
  the Canvas dot grid, exposes common creation intents and quick-start templates, and prefills the
  existing project-scoped Agent composer from a template without creating a second Agent runtime.
- Verified Home and Project in the real Desktop Electron host use the same flush primary-sidebar
  geometry. Fixed-expanded and compact states preserve one Workbench-owned width/visibility
  projection; hovering or focusing the compact rail temporarily reveals the full sidebar over the
  main surface without changing the persisted state or shifting the workspace layout. Only
  Workbench content components retain the eight-pixel panel gap.
- Reproduced the hover race in the real Electron host by moving once from `x=20` on the compact rail
  to `x=250` inside the intended overlay: the animated hit width collapsed before the pointer
  arrived. After removing the geometric transition, the same fast lateral movement retained the
  complete overlay on both Home and Project, while moving to Main still restored the compact rail.
- Added a red-capable renderer style regression that failed on `width 150ms ease` before the fix and
  passes only when the expanded hit width is immediate.
- Re-ran `pnpm --filter @neko/app-desktop test` (45 files / 214 tests),
  `pnpm --filter @neko/app-desktop typecheck`,
  `pnpm --filter @neko/app-desktop package`,
  `pnpm exec openspec validate refine-desktop-home-management-surfaces --strict`, and
  `git diff --check`.
- Added a red-capable Shell service regression for the real restored-project shape: an active
  Project is returned to Home, the Renderer epoch advances, and Home persists only the application
  primary-sidebar slice while a Resource Dock mutation still fails visibly.
- Restarted the real Desktop Electron Main process and verified Home can expand and collapse the
  shared primary sidebar without an active Content Project or an error diagnostic; moving the
  pointer back to Main restores the compact rail.
- Re-ran `pnpm --filter @neko/app-desktop test` (45 files / 215 tests),
  `pnpm --filter @neko/app-desktop typecheck`,
  `pnpm --filter @neko/app-desktop package`,
  `pnpm exec openspec validate refine-desktop-home-management-surfaces --strict`, and
  `git diff --check`.
