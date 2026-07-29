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
- Re-ran `pnpm --filter @neko/app-desktop test` (44 files / 213 tests),
  `pnpm --filter @neko/app-desktop typecheck`,
  `pnpm --filter @neko/app-desktop package`,
  `pnpm exec openspec validate refine-desktop-home-management-surfaces --strict`, and
  `git diff --check`.
