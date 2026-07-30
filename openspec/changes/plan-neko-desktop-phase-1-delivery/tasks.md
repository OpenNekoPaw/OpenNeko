## 0. Program Proposal

- [x] 0.1 Audit current application identity, Host ports, Agent, Assets, Canvas, Cut, Preview,
      Generation/Quality, Chara/Entity, Tools and media reuse maturity
- [x] 0.2 Define Phase 1 ownership, dependency order, data disposition, reference platform and
      end-to-end completion gate
- [x] 0.3 Define the child OpenSpec boundaries; this program change does not implement runtime code

## 1. P1.1 Desktop Foundation

- [x] 1.1 Create `bootstrap-neko-desktop-foundation` with Electron/Forge dependency and supply-chain
      decision, main/preload/renderer boundaries, CSP/fuses/sender validation and packaging tasks
- [x] 1.2 Audit all `neko-home` storage categories, add `neko-desktop`, define migration/rejection,
      remove or poison legacy success paths, and update application-boundary guards
- [x] 1.3 Implement `ElectronNekoHostPorts`, AppHost lifecycle, fixed preload bridge, window registry,
      logs/diagnostics and isolated fixture bootstrap
- [x] 1.4 Verify foundation build/typecheck/test, Electron security tests, startup/reload/window
      close/app quit and absence of React in main or Node/Electron/VS Code in renderer

## 2. P1.2 Shell, Project And State

- [x] 2.1 Create `implement-desktop-shell-project-state` with Project/Workspace/Window/Tab/View
      contracts and protected user-local Project catalog
- [x] 2.2 Implement Home, Project Tabs, Content Project layout, Context Dock, Activity/Attention and
      unavailable Character/World profile diagnostics
- [x] 2.3 Extract the minimum host-neutral projection attachment primitive and implement
      snapshot/ack/sequence/revision/epoch recovery, WindowStore, ViewStore and CAS persistence
- [x] 2.4 Test duplicate Project open, multi-window owner subscription, rapid switch/close/reopen,
      StrictMode, autosave, stale response, renderer crash and app recovery
- [x] 2.5 Apply `refine-desktop-home-management-surfaces` to provide real Start Creating, federated
      Asset Center, Skill/built-in extension availability and All Creations pages without enabling
      the Phase 3 external Plugin Host

## 3. P1.3 Agent And Home

- [x] 3.1 Create `integrate-desktop-agent-home` and audit every Agent Webview-to-Host route as
      implemented, unsupported or host-inapplicable for Electron
- [x] 3.2 Move Host-neutral Agent orchestration out of VS Code effects, keep one controller, and
      implement the Electron runtime/storage/secret/content adapters
- [x] 3.3 Integrate `AgentWebviewRoot`, Conversation/Tab projections, Tool Call, Approval, Skill,
      existing GenerationJob link/status consumption and Home Conversation/Activity summaries;
      keep concrete GenerationJob Desktop composition in P1.6
- [ ] 3.4 Run producer/consumer tests, poisoned VS Code-route Desktop tests, Agent package checks,
      focused real Agent evaluation where behavior changes, and Electron Agent functional scenarios

## 4. P1.4 Assets, Content And Canvas

- [x] 4.1 Create `integrate-desktop-assets-canvas` and define an Assets-owned browser Root over
      ContentLocator, Media Library, Entity/Search and local metadata services; update the Shell to
      the primary-sidebar/Main/Agent-Dock/Resource-Dock controlled workbench contract
- [x] 4.2 Define and inject the canonical `CanvasHostAdapter` into the full Canvas Root; migrate
      direct VS Code transport and remove/poison replaced demo success paths
- [x] 4.3 Implement import/link, search, thumbnail/metadata, drag/drop, Canvas placement,
      candidate/accept and workspace Board delivery through owning contracts; support compact
      multi-Board switching, duplicate-open focus and at most two explicitly split Canvas views
- [x] 4.4 Test public-entry dependencies, workspace authorization, ContentLocator-only identity,
      Canvas persistence/reopen and candidate ownership; record the user-requested Desktop-only
      acceptance waiver and retain VS Code Canvas runtime validation as residual risk
- [x] 4.5 Refine the Desktop creative workbench to a collapsible primary icon rail, transparent
      traffic-light drag region with no global Header or unified workspace Tab row, owner-local
      Agent/creative/Timeline tabs, Agent-only dock presentation, Chat + Main display presets,
      controlled Canvas/Timeline/Model Main compositions without separate move-left/right buttons,
      independent Files/Media/Entity resource facets and package-owned bottom horizontal
      Canvas/Model toolbars; preserve all owner identities and command paths
- [ ] 4.6 Reopen the embedded Canvas Preview acceptance path: consume the P1.5 host-neutral media
      runtime from the Desktop Canvas adapter so audio/video nodes retain the package-owned probe,
      poster, playback and cleanup behavior of the canonical Canvas Root

## 5. P1.5 Cut, Preview And Media

- [x] 5.1 Create `integrate-desktop-cut-preview-media` with canonical Cut/Preview adapters and the
      Desktop secure custom media protocol contract
- [ ] 5.2 Inject the full Cut Root, preserve OTIO/Cut command/ExportJob authority, migrate direct
      VS Code transport, and remove/poison fixed demo timeline success; support multiple open Cut
      documents with one rendered Cut Stage/Timeline session in Phase 1
- [ ] 5.3 Build the package-owned Preview Root/descriptor lifecycle over existing document/media/3D
      renderers and Host-authorized ContentLocator projections; implement temporary, pinned and
      explicit side-by-side Preview Views while keeping Canvas/Cut-owned previews embedded
- [ ] 5.4 Implement and test GET/HEAD/closed Range/206/token/owner/session/cancel/backpressure,
      direct/remux/hardware-prepared file/PCM, native `<video src>`, SDR baseline, seek, export and
      resource cleanup; poison `MediaSource`, `SourceBuffer`, whole-video fetch and CPU fallback
- [ ] 5.5 Run Cut/Preview producer-consumer tests, Node/FFmpeg integration, Electron fixture media
      scenarios and existing VS Code Extension Development Host regressions

## 6. P1.6 Supporting Creative Domains

- [ ] 6.1 Create `integrate-desktop-creative-support-domains` for Generation/Quality,
      Chara/Entity and Tools/Diagnostics projections and commands
- [ ] 6.2 Integrate GenerationJob and Quality Gate without a Desktop Task authority; project progress
      to Agent/Canvas/Activity and preserve candidate/evidence ownership
- [ ] 6.3 Integrate only current Chara Dialogue/Embody/evidence/profile and Entity binding through
      Agent/Context Dock; include Entity-authority-backed Agent mention search with stable Entity
      identity and optional representation ContentLocator; keep CharacterProject/Version and World
      unavailable
- [ ] 6.4 Separate Tools browser presenters from VS Code effects and integrate media comparison,
      metadata, logs and fail-visible diagnostics without leaking paths or runtime consoles
- [ ] 6.5 Run domain tests, Agent evaluation where routing changes, UI adapter tests and unsupported
      capability diagnostics

## 7. P1.7 Qualification And Handoff

- [ ] 7.1 Create `qualify-neko-desktop-phase-1` with frozen synthetic workspace/media fixtures and
      the authoritative end-to-end scenario
- [ ] 7.2 Verify launch → Content Project → Agent → Media Library → Canvas candidate/accept →
      Preview → Cut → Export → Activity/result → close/reopen/restart
- [ ] 7.3 Assert canonical-path counters/poisoning for Pi conversation runtime, Pi Session, Product
      Turn Bridge, package adapters, owning Jobs, `@neko/media` and Desktop protocol; prove
      legacy/demo/VS Code routes did not participate
- [ ] 7.4 Verify `darwin-arm64` package/install/startup, dependency closure, IME/keyboard/DPI/
      accessibility, renderer crash, app quit and resource release
- [ ] 7.5 Run all applicable package tests, `pnpm build`, `pnpm test`, `pnpm check`,
      `pnpm check:quality`, OpenSpec validation and the Desktop Electron functional suite
- [ ] 7.6 Update current-capability documentation without claiming Phase 2 cross-platform or Phase 3
      MCP/plugin/professional-tool support, then archive the Phase 1 program
