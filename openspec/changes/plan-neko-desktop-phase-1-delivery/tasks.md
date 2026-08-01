## 0. P1.0 Program Governance And Rebaseline

- [x] 0.1 Audit current application identity, Host ports, Agent, Assets, Canvas, Cut, Preview,
      Generation/Quality, Chara/Entity, Tools and media reuse maturity
- [x] 0.2 Define Phase 1 ownership, dependency order, data disposition, reference platform and
      end-to-end completion gate
- [x] 0.3 Define the child OpenSpec boundaries; this program change does not implement runtime code
- [x] 0.4 Re-audit the Desktop-only implementation, active child progress and accepted architecture;
      reject the old VS Code/TUI product-root and Linux release assumptions
- [x] 0.5 Freeze `ContentLocator` as durable public content identity, transfer Renderer media
      transport to the HTTP resource-gateway successor and reject parallel custom-scheme ownership
- [x] 0.6 Map every remaining Phase 1 gate to one focused owner, identify missing P1.6/P1.7 changes
      and keep Proposed package-topology changes outside the product gate until accepted
- [x] 0.7 Separate CI build/unit/headless-functional evidence from explicit local real-API Agent
      Evaluation and local graphical Electron UI acceptance
- [x] 0.8 Validate the rebased program and synchronized child artifacts with strict OpenSpec,
      current-fact searches, formatting/link checks and `git diff --check`

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
- [ ] 3.4 Close `integrate-desktop-agent-home`, `fix-desktop-agent-shell-regressions` and
      `clarify-desktop-capability-catalog`: run deterministic producer/consumer checks, explicit
      local real-provider Evaluation where Agent behavior/routing changes, and isolated local
      graphical Electron conversation/plugin scenarios; treat key-free harness runs as
      infrastructure validation only

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
      acceptance waiver and retain real Electron Canvas runtime validation as residual risk
- [x] 4.5 Refine the Desktop creative workbench to a collapsible primary icon rail, transparent
      traffic-light drag region with no global Header or unified workspace Tab row, owner-local
      Agent/creative/Timeline tabs, Agent-only dock presentation, Chat + Main display presets,
      controlled Canvas/Timeline/Model Main compositions without separate move-left/right buttons,
      independent Files/Media/Entity resource facets and package-owned bottom horizontal
      Canvas/Model toolbars; preserve all owner identities and command paths
- [ ] 4.6 Close `integrate-desktop-assets-canvas` final UI/node scenario, then let the OpenNeko
      resource Canvas slice replace ordinary audio/video transport and prove package-owned
      probe, poster, playback, isolation and cleanup in a local graphical Electron fixture

## 5. P1.5 Cut, Preview And Media

- [x] 5.1 Record `integrate-desktop-cut-preview-media` as the implemented Cut/Preview composition
      baseline and transfer its superseded `neko-media:`/HTTP transport to the OpenNeko resource successor
- [ ] 5.2 Close retained Cut edit/save/preview/export and P1 productivity work through
      `redefine-openneko-lightweight-editing`; keep OTIO/Cut command/ExportJob authority and poison
      demo, active-editor and retired-host success paths
- [ ] 5.3 Close package-owned Preview lifecycle and format readiness through the OpenNeko resource
      Preview slice plus `fix-epub-preview-resource-readiness`, including temporary/pinned/side View
      identity, documents and model resource sets
- [ ] 5.4 After `retire-resource-ref-contract`, implement the single Main-owned OpenNeko handler and
      exact-resource registry with scoped sender/origin/generation, Range/CORS/cancel/backpressure,
      Cut PCM and native Canvas/Preview/Agent media; delete loopback HTTP, private scheme and proxy success
- [ ] 5.5 Run focused producer/consumer and Node/FFmpeg checks, then isolated local graphical
      Electron Cut/Canvas/Preview/EPUB scenarios proving the resource handler and owning Roots were reached
      while retired transports/hosts remained unavailable

## 6. P1.6 Supporting Creative Domains

- [ ] 6.1 Read the approved zero-consumer dispositions and current package consumers, then create
      `integrate-desktop-creative-support-domains` only for retained Generation/Quality,
      Chara/Entity and Tools/Diagnostics projections and commands
- [ ] 6.2 Integrate GenerationJob and Quality Gate without a Desktop Task authority; project progress
      to Agent/Canvas/Activity and preserve candidate/evidence ownership
- [ ] 6.3 Integrate only current Chara Dialogue/Embody/evidence/profile and Entity binding through
      Agent/Context Dock; include Entity-authority-backed Agent mention search with stable Entity
      identity and optional representation ContentLocator; keep CharacterProject/Version and World
      unavailable
- [ ] 6.4 Separate Tools browser presenters from host effects and integrate Desktop media comparison,
      metadata, logs and fail-visible diagnostics without leaking paths or runtime consoles
- [ ] 6.5 Run domain tests and UI adapter checks, explicit local real-provider Evaluation only where
      routing/Agent behavior changes, and local graphical Desktop acceptance for visible domain
      surfaces; keep unavailable capability diagnostics fail-visible

## 7. P1.7 Qualification And Handoff

- [ ] 7.1 Create `qualify-neko-desktop-phase-1` with frozen synthetic workspace/media fixtures and
      the authoritative end-to-end scenario
- [ ] 7.2 Verify launch → Content Project → Agent → Media Library → Canvas candidate/accept →
      Preview → Cut → Export → Activity/result → close/reopen/restart
- [ ] 7.3 Assert canonical-path counters/poisoning for Pi conversation runtime, Pi Session, Product
      Turn Bridge, package adapters, owning Jobs, `@neko/media` and the OpenNeko resource handler;
      prove loopback HTTP/private media scheme/upstream proxy and legacy/demo routes did not participate
- [ ] 7.4 Verify `darwin-arm64` package/install/startup, dependency closure, IME/keyboard/DPI/
      accessibility, renderer crash, app quit and resource release
- [ ] 7.5 Run all applicable package tests, `pnpm build`, `pnpm test`, `pnpm check`,
      `pnpm check:quality`, OpenSpec validation and CI headless functional tests; separately run
      applicable real-provider Evaluation and the local graphical Desktop Electron suite
- [ ] 7.6 Update current-capability documentation without claiming Phase 2 cross-platform or Phase 3
      MCP/plugin/professional-tool support, then archive the Phase 1 program
