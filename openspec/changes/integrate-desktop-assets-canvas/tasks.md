## 1. Contract And Reuse Audit

- [x] 1.1 Audit Desktop Shell, `@neko/ui` workbench, Assets Extension/Tree providers, Canvas Root/
      Custom Editor, Content/Entity/Search services and Workspace Board authoring; record each
      production path as reuse, extract, replace or poison
- [x] 1.2 Define versioned L0 workbench, Resource Browser and Canvas runtime contracts with explicit
      Project/Workspace/Window/View/document/session/epoch/revision identity
- [x] 1.3 Add parsers/builders and producer/consumer tests for valid payloads, unknown versions,
      stale identity, absolute-path rejection and exhaustive Host route coverage
- [x] 1.4 Add architecture/debt guards preventing Desktop renderer imports of Node/Electron/VS Code,
      Assets browser imports of VS Code and production Canvas Root global VS Code API fallback

## 2. Controlled Desktop Workbench

- [x] 2.1 Enhance the existing `@neko/ui` workbench primitive with primary sidebar, controlled
      Agent Dock, bounded Main split, Timeline slot and compact/overlay presentation without
      adding domain semantics
- [x] 2.2 Extend Window layout projection and revision/CAS persistence for sidebar visibility, dock
      positions/sizes, Agent main/dock presentation, Main Views/split and Timeline visibility/height
- [x] 2.3 Replace visual Project Tabs and narrow Activity Rail with the shared primary sidebar while
      preserving Host-owned ProjectTab/View attachment identity and exact Home/Project navigation
- [x] 2.4 Implement deterministic layout presets, dock show/hide, compact-window behavior and
      localized accessible controls
- [x] 2.5 Add shared UI and Desktop React tests for presets, minimum width, overlay, keyboard/focus,
      project switching and absence of duplicated domain state
- [x] 2.6 Collapse the primary sidebar to an icon rail, constrain layout choices to Chat + Main/
      only Chat/only Main plus controlled Canvas/Timeline/Model Main compositions while keeping
      Resource facets independent, remove separate move-left/right controls and the global
      Header/unified workspace Tab row in favor of owner-local tabs, and move the package-owned
      Canvas/Model viewport tools to bottom horizontal toolbars without changing their command owners

## 3. Assets Resource Browser

- [x] 3.1 Extract host-neutral linked-library, search, metadata/thumbnail and Entity presenter ports
      from VS Code-specific Assets services without creating a second catalog or cache
- [x] 3.2 Implement the package-owned Resource Browser controller/projection/Root with Files, Media
      and Entity facets, including Character Entity representation projection
- [x] 3.3 Migrate VS Code Tree providers/commands to consume the same services/presenter and poison
      duplicate identity/search rules
- [x] 3.4 Implement Desktop Main/preload fixed Assets namespace, sender-derived authorization,
      source picker, search, reveal and projected thumbnail/metadata effects
- [x] 3.5 Mount Resource Browser Root in its Workbench Main View and implement selection, search, refresh,
      preview intent and explicit add-to-Canvas target actions
- [x] 3.6 Test linked libraries, Entity bindings, locator containment, symlink escape, projection
      authorization, cancellation, unavailable Chara actions and no path leakage

## 4. Canvas Runtime And Root

- [x] 4.1 Define the Canvas host runtime provider over the existing `.nkc` domain/session,
      authoring, content projection, source picker, preview/reveal and presentation-state contracts
- [x] 4.2 Refactor `CanvasWebviewRoot`, hooks, stores, delegates and toolbars to consume the injected
      runtime; remove module-global VS Code API use from the production Root
- [x] 4.3 Migrate the VS Code Custom Editor adapter to the same runtime and retain save/dirty/undo/
      redo, preview, playback, source-add, drag/drop and authoring behavior
- [x] 4.4 Implement Desktop Canvas Main/preload bridge and AppHost composition with sender-bound
      document session, expected revision, command id, subscription and disposal
- [x] 4.5 Replace `CanvasHostAdapterSurface` in the Desktop ready path with the full Canvas Root and
      poison fixed/demo Canvas success
- [x] 4.6 Add Canvas runtime/Root/adapter producer-consumer tests for snapshot-first recovery,
      mutation, save, stale revision/epoch, unsupported effect and cleanup

## 5. Resource-To-Canvas And Multi-View

- [x] 5.1 Implement explicit Resource Browser drag/add intent to a selected Canvas document through
      stable ContentLocator/representation identity and owning Canvas authoring
- [x] 5.2 Integrate candidate/accept and Workspace Board delivery through existing owner operations
      without renderer-owned candidate or delivery state
- [x] 5.3 Implement compact Canvas View switcher, duplicate-document focus, close/save semantics and
      default single rendered Canvas
- [x] 5.4 Implement explicit side-open for at most two different Canvas documents with independent
      document sessions and View presentation state
- [x] 5.5 Pause/release hidden Canvas preview/media resources and recover allowed viewport/selection
      state without persisting document facts in the Window layout
- [x] 5.6 Test resource placement, cancellation, stale target, provenance, duplicate focus, dual
      Canvas isolation, close/reopen and no active/recent Canvas fallback

## 6. Recovery, Evaluation And Qualification

- [x] 6.1 Add renderer reload, Project close/reopen, app restart and multi-window tests proving
      Assets/Canvas owner recovery, fenced mutation and no duplicate import/delivery/acceptance
- [x] 6.2 Record the Agent evaluation disposition for Resource/Canvas routing; run focused evaluation
      if Tool/capability behavior changes, or document the exact external observability blocker
- [x] 6.3 Run Assets, Content, Entity, Canvas, shared UI and Desktop tests/typechecks/builds plus
      architecture, legacy-debt, unused-code and strict OpenSpec validation
- [x] 6.4 Record the explicit Desktop-only acceptance waiver: the user excluded VS Code plugin
      runtime testing, so no Extension Development Host evidence is claimed and that runtime remains
      a documented residual risk
- [x] 6.5 Validate the packaged Electron Project → Resource Browser Main View → Canvas add/undo → package-owned
      Preview scenario, and cover save/reopen plus dual-Canvas isolation through canonical-path tests
- [x] 6.6 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:quality` and `git diff --check`;
      update current-capability docs and mark Phase 1 program 4.x only when every gate passes
- [x] 6.7 Fix the Desktop Vite development renderer dependency closure, dynamic-style CSP nonce
      authorization, shared Canvas Root StrictMode lifetime and post-close sender identity cleanup
      so package Roots cannot fail or lose styles during development startup and window disposal
      cannot access destroyed Electron objects; add regression guards and revalidate the visible
      Desktop Canvas path
- [x] 6.8 Restore the package-owned Canvas icon stylesheet and make the package-owned Model Viewer
      renderer/source Host lifecycle safe under Desktop React StrictMode; verify real Canvas add,
      undo/redo and GLB Preview behavior without widening workspace authorization to the renderer
- [x] 6.9 Replace the Resource Browser drag path that still called the VS Code-only
      `project:addSource` route with a portable ContentLocator drag contract and the owning Canvas
      Host `project-content` intent at the actual drop position; cover payload privacy and path use

## 7. Superseded Resource Dock Migration

- [x] 7.1 Preserve the historical regression proving Agent and Resource owners never share a stacked
      Dock while migrating the Resource owner to a Main View.
- [x] 7.2 Remove the project Resource Dock renderer path and retain Agent as the only side Dock owner.
- [x] 7.3 Normalize restored legacy Resource Dock presentation to hidden and route Resource reveal to
      Main View open/focus.
- [x] 7.4 Run Desktop and shared UI tests/typecheck, strict OpenSpec validation, production Electron
      packaging and a real Desktop scenario with Agent Dock plus Resource Browser Main View.

## 8. Unified Primary Navigation

- [x] 8.1 Add failing Desktop Shell regressions for shared Home/Project navigation, absence of the
      Creative surfaces section and a non-duplicated footer.
- [x] 8.2 Reuse one primary sidebar structure and style contract for Home and Content Project,
      including brand/collapse, Start creating, Activity, Asset center and authoritative recents.
- [x] 8.3 Route Project Asset center to the independent Resource Browser Main View, preserve Project
      activation/close semantics, and reduce the footer to real attention/display/timeline/settings
      controls without simulated Plugin/Skill actions.
- [x] 8.4 Run Desktop tests/typecheck, strict OpenSpec validation, production package build and a
      real Electron Home/Project navigation scenario.

## 9. Desktop Canvas Media Preview Regression

- [x] 9.1 Add red producer/consumer coverage proving the Desktop Canvas delegate exposes the
      package-owned media probe/play/capture/stop protocol and rejects stale or escaping sources.
- [x] 9.2 Compose the existing `@neko/media` Node runtime behind the Desktop Canvas bridge with
      explicit Canvas session ownership, ContentLocator authorization and deterministic cleanup.
- [x] 9.3 Restore package-owned audio/video node preview and playback without adding a Desktop-local
      viewer, Canvas node renderer or fallback path.
- [x] 9.4 Re-run focused Canvas/Desktop tests and typechecks, package Electron, and verify the
      audio/video nodes from the isolated `neko-test` fixture workspace in the real Desktop
      application.

## 10. Canvas Selection Projection Regression

- [x] 10.1 Add a red Host/Webview regression that rapidly commits single- and multi-node selection
      and proves locally originated projection events cannot replay stale selection into the source
      Canvas Root.
- [x] 10.2 Add explicit command origin to the Canvas Host projection contract and preserve it across
      the domain session plus Desktop producer/consumer bridge.
- [x] 10.3 Suppress only the source Webview's local command echo while continuing to apply external
      Agent/Host presentation changes and initial recovery snapshots.
- [x] 10.4 Run focused Canvas domain/Webview/Desktop tests and typechecks, strict OpenSpec validation
      and a real Electron single-/multi-selection interaction.

## 11. Transient Hover Media Preview

- [x] 11.1 Add red Canvas Root tests proving audio/video pointer enter starts package-owned playback
      and pointer leave, View hiding or unmount stops and releases it without document mutation.
- [x] 11.2 Add red Resource Browser, Preview and Desktop producer/consumer tests for image/audio/video
      quick preview, exact-item authorization, request fencing and deterministic descriptor cleanup.
- [x] 11.3 Implement Canvas transient hover playback through the existing `@neko/media` runtime and
      implement Resource Browser hover state with the package-owned compact Preview surface.
- [x] 11.4 Run focused Canvas/Assets/Preview/Desktop tests and typechecks, strict OpenSpec validation,
      package Electron and verify hover playback from the isolated `neko-test` fixture workspace in
      the real Desktop app.

## 12. Authorized Canvas Playback Descriptor Regression

- [x] 12.1 Add a red Canvas consumer regression using the exact Desktop `authorized`
      `neko-media://desktop/...` video and PCM descriptors and assert the package-owned players mount.
- [x] 12.2 Move transport/URL validation to the owning `@neko/media` contract and make the Canvas
      Host decoder preserve both declared transports without a Desktop-local viewer or fallback.
- [x] 12.3 Run focused Media/Canvas/Desktop tests and typechecks, strict OpenSpec validation,
      production Electron packaging and verify playback in the isolated `neko-test` fixture
      workspace.

## 13. Canvas Content Drop Lifecycle Regression

- [x] 13.1 Add a red Canvas hook regression proving the drop overlay is released before an
      asynchronous ContentLocator projection settles and the projection is requested exactly once.
- [x] 13.2 Route ContentLocator drops through the shared drop lifecycle owner without duplicate
      Canvas mutation, timeout-based hiding or a Desktop-local fallback.
- [x] 13.3 Run focused Canvas tests and typecheck, strict OpenSpec validation, production Electron
      packaging and verify Resource Browser → Canvas drop in the isolated `neko-test` fixture
      workspace.

## 14. Shared Canvas Add-Node Catalog

- [x] 14.1 Add red package-owned tests for the ordered Text/Table/Image/Video/Audio/3D Director
      catalog, localized menu presentation, canonical Table content and model source intent.
- [x] 14.2 Replace the legacy grouped menu with the shared flat catalog, apply package-owned Canvas
      control density, route Text/Table to canonical Markdown nodes and add the real model source
      producer/consumer contract.
- [x] 14.3 Run focused Canvas/Desktop tests and typechecks, strict OpenSpec validation and verify
      the shared menu and node creation in the Desktop fixture.

## 15. Portal Theme And Real Node Path Regression

- [x] 15.1 Add red shared Popover and Canvas layout regressions proving Portal content receives an
      owner class and uses neutral global Neko surface, border, foreground, hover and shadow tokens.
- [x] 15.2 Prove every source-backed catalog item projects its typed ContentLocator to a supported
      canonical Canvas node, while Text and Table retain their real editable Markdown paths.
- [ ] 15.3 Run focused shared UI/Canvas tests and typechecks, strict OpenSpec validation, production
      Desktop packaging and a real add-menu/node-creation scenario in the isolated `neko-test`
      fixture workspace.

## 16. Global And Project Resource Navigation Separation

- [x] 16.1 Add red Desktop Shell regressions proving Asset center always dispatches the global Home
      destination, Project resources independently opens the exact Project/Workspace Resource Browser
      Main View, and their active states never alias.
- [x] 16.2 Add an owner-neutral context navigation slot to the shared Application sidebar composition,
      inject the Project resources destination from Project composition, and delete the Project
      override and Resource Browser-to-Asset-center active-state mapping.
- [x] 16.3 Run focused Desktop tests/typecheck, strict OpenSpec validation, production Electron
      packaging and an isolated real Desktop navigation scenario proving the two destinations,
      identities and lifecycles remain independent.

## 17. Global Library Development Contract And Style Regression

- [x] 17.1 Add red Desktop development-lifecycle coverage proving a completed Main watch build
      requests an Electron restart while a production build does not; preserve strict unsupported
      version rejection instead of adding a compatibility fallback.
- [x] 17.2 Implement the canonical Main restart hook and add renderer build/runtime assertions that
      the Assets-owned Global Library stylesheet reaches the lazy chunk without Desktop selector
      duplication.
- [x] 17.3 Run focused Desktop/Assets tests and typechecks, strict OpenSpec validation, production
      packaging and an isolated real Electron Asset center scenario proving Media Library search,
      computed package styles, layout dimensions and clean stderr.

## 18. Restore Project Resource Right Sidebar

- [x] 18.1 Add red Workbench/renderer regressions proving Project Resource Browser is absent from
      Main View kinds, Main tabs and primary navigation while its independent right Dock remains
      available with project-scoped identity.
- [x] 18.2 Upgrade the Workbench contract and migrate persisted v2 `resource-browser` Main Views
      into canonical visible right-Dock presentation; poison later Main View success and derive the
      Resource Browser runtime identity from the owning Project View.
- [x] 18.3 Restore the Assets-owned Resource Browser Root to the fixed right Dock with independent
      width/resize/scroll ownership, project-local reveal/close controls, narrow-window overlay and
      deterministic left Agent placement when both owners are visible.
- [x] 18.4 Run focused Desktop/Assets/shared UI tests and typechecks, strict OpenSpec validation,
      production packaging and an isolated real Electron scenario proving Canvas stays in Main,
      Project resources stays right and the global Asset center remains independent. Exercise
      Resource Dock reveal/navigation while Canvas is mounted and prove delayed Canvas startup
      snapshots cannot regress the authoritative revision or surface a stale material-action
      diagnostic.

## 19. Project Resource Facets And Media Library Setup

- [ ] 19.1 Add red Assets contract/controller/Root tests proving Files is the default, All and Entity
      are rejected, Materials uses Entity authority, the two media-library intents are revisioned and
      the legacy generic source intent cannot succeed.
- [ ] 19.2 Upgrade the Assets Resource Browser contract and Root to Files/Media/Materials, add the
      explicit media-library setup menu and preserve cancellation/stale-revision semantics without a
      duplicate catalog or inferred usage fallback.
- [ ] 19.3 Compose Desktop global-registry selection plus directory creation with workspace linking,
      rollback partial directory creation, keep absolute paths in Main and add producer/consumer path
      regressions.
- [ ] 19.4 Run focused Assets/Desktop tests and typechecks, architecture/debt gates, strict OpenSpec
      validation, production packaging and an isolated real Electron scenario covering the three
      facets and both media-library setup paths.
