## 1. Host Contract And Route Coverage

- [x] 1.1 Rename the canonical Agent wire unions, parsers, builders and consumers from
      Extension-specific names to `AgentWebviewToHostMessage` / `AgentHostToWebviewMessage`; remove
      old aliases and add a legacy-name debt guard
- [x] 1.2 Replace partial route coverage with an exhaustive per-Host record and add all 52 Electron
      classifications, future-slice ownership and typed unsupported/inapplicable diagnostics
- [x] 1.3 Migrate path-bearing Agent routes and projections to existing DocumentLocator,
      ContentLocator, ResourceRef or opaque Host content identity; poison absolute/resolved path
      authority in Desktop messages
- [x] 1.4 Add producer/consumer tests for valid/invalid wire payloads, new-route compile coverage,
      unsupported routes, host-inapplicable emission policy and unknown schema/type rejection

## 2. Shared Agent Host Controller

- [x] 2.1 Define the connection identity, typed post/subscription boundary and small
      conversation/config/skill/content/projection effect ports in `@neko/agent`
- [x] 2.2 Move conversation, turn, queue, Tool confirmation and Mermaid feedback routing from
      Extension into the shared controller without moving Pi or projection ownership
- [x] 2.3 Move config/settings and Skill/context/slash routing into the shared controller with
      immutable per-turn configuration and explicit conversation identity
- [x] 2.4 Move content search/reveal/write, external URL and projection attachment routing into the
      shared controller while keeping Host effects injected
- [x] 2.5 Migrate VS Code `ChatViewProvider` to the shared controller, retain only VS Code UI/command/
      URI/keyboard/drag effects, and delete or poison the replaced router path
- [x] 2.6 Add shared-controller and VS Code producer/consumer tests proving route identity,
      responsibility isolation, no active-object fallback and no duplicate router

## 3. Electron Agent Composition

- [x] 3.1 Add Desktop Agent AppHost composition over the existing Node Pi conversation authority,
      user-level catalog/lease, Pi Session root, Product Turn Bridge, Tool/Skill and projection owners
- [x] 3.2 Implement CredentialStore persistence and interaction through HostSecretPort plus protected
      Host UI effects; prove secrets never enter renderer, logs, SQLite metadata or Pi transcript
- [x] 3.3 Implement Desktop workspace content/search/reveal/write and external-open effects using
      sender-bound workspace grants and stable content identities
- [x] 3.4 Add the fixed versioned preload `agent` namespace, Main IPC handlers and Electron
      `AgentHostRuntimeAdapter`; reject raw channels, forged owner identity and stale renderer/View epochs
- [x] 3.5 Add AppHost startup coverage validation and keep the Agent capability unavailable when any
      required runtime/effect is missing
- [x] 3.6 Advertise the complete conversation/skill effect composition, and lazily reattach restored
      Host-owned workspace locators before creating an Agent connection; reject identity drift

## 4. Agent Root, Home And Projection

- [x] 4.1 Evolve the Desktop domain capability projection to `ready | unavailable` and activate only
      Agent while preserving explicit P1.4-P1.6 diagnostics
- [x] 4.2 Mount the package-owned `AgentWebviewRoot` in Content Project with View-scoped recoverable
      presentation state and no renderer-owned Conversation/Run/Tool/Job facts
- [x] 4.3 Add the owner-derived Desktop Agent Home projection for conversation summaries, navigation
      identity, Activity and Attention without copying Timeline or Job state
- [x] 4.4 Integrate Tool Call/Approval, Skill, Conversation/Tab and existing GenerationJob link/status
      projection; keep concrete GenerationJob commands unavailable until P1.6
- [x] 4.5 Add React and projection tests for conversation create/activate/delete, Tool confirmation,
      Home navigation, stale patches and unavailable future-domain actions
- [x] 4.6 Apply the shared light theme by default and localize Desktop-owned Shell, Agent loading,
      tooltip, accessibility and date presentation through complete `en` / `zh-cn` bundles; prove the
      embedded Agent Root receives the same locale and light theme
- [x] 4.7 Redesign Home and Content Project with creator-first navigation and shared Workbench
      primitives: focused Home start/recent state plus Content activity rail, Agent sidebar, central
      domain workspace and resource/Context dock, while future-domain slots remain fail-visible
- [x] 4.8 Refine Home and Content Project UX without weakening core capabilities: add owner-derived
      recent-work navigation, improve hierarchy and minimum-window density, preserve real Project/Tab/
      Agent/projection actions, and remove simulated controls from unavailable Agent/Canvas/Assets slots
- [x] 4.9 Route Home conversation selection through explicit Project, View and Conversation identity;
      reopen a closed catalog Project from its Host-owned Workspace locator, hydrate catalog and Tab
      state before target activation and never fall back to an active conversation
- [x] 4.10 Make the primary sidebar, controlled Agent/resource docks and bottom Timeline resizable with
      shared Workbench primitives; update live layout during drag, commit the final owner size once to
      Host state, persist limits from the canonical contract and cover preset position/visibility behavior
- [x] 4.11 Make Desktop the configuration presentation owner, suppress Agent onboarding/account
      entries in the embedded Root, remove the extra Desktop Agent wrapper chrome and global
      Header/unified workspace Tab row, and keep the full Conversation/Tool/Skill/composer path and
      Conversation tabs in the Chat dock
- [x] 4.12 Refine the existing Home Agent composer as one responsive input/handoff panel using shared
      theme/UI primitives; collapse the duplicate open/select affordances into one Project control,
      make the creation-intent textarea content-sized without a manual resize affordance, preserve the
      Project handoff path and prove model, Skill, version and attachment controls were not added

## 5. Lifecycle, Recovery And Isolation

- [x] 5.1 Implement renderer reload and View epoch detach/reattach with snapshot-first recovery and
      no Pi runtime restart or renderer-state hydration
- [x] 5.2 Implement Project Tab/Window close, explicit cancel and AppHost quit ownership rules,
      including checkpoint flush diagnostics, lease release and disposable cleanup
- [x] 5.3 Add multi-conversation and multi-window tests for isolated mutable state, fenced writer
      takeover, stale response rejection and no active-conversation fallback
- [x] 5.4 Add crash/restart tests proving Conversation/Pi Session recovery, no duplicate turn, and
      no duplicate Tool or owning Job submission
- [x] 5.5 Make repeated Agent bootstrap idempotent for the exact owner and renderer/View epoch while
      preserving replacement for advanced epochs; cover the StrictMode unknown-connection failure
      with a canonical bridge-runtime regression test
- [x] 5.6 Read context token count for durable closed conversations from the Pi authority without
      creating a model runtime or execution lease; cover the startup not-open failure with a
      canonical AppHost composition regression test
- [x] 5.7 Publish canonical Tab state before active Conversation snapshots for all Host-owned Tab
      mutations; cover the transient timestamp-Tab projection race with controller composition and
      real Electron new-conversation validation
- [x] 5.8 Preserve the preload event cursor when idempotent bootstrap returns the same Agent
      connection; reset it only for a replacement connection identity and cover the observed
      `N does not follow 0` runtime failure with a regression test

## 6. Evaluation And Quality Gates

- [ ] 6.1 Add a focused key-free Agent evaluation scenario and facts for shared-controller, Pi
      conversation, Tool confirmation, projection, unsupported route and legacy-fallback evidence
- [x] 6.2 Run focused real Agent evaluation with explicit provider/model/cost authorization when
      available; otherwise record the exact external blocker and residual behavior risk
- [x] 6.3 Run Agent types/runtime/Extension/Webview and Desktop tests/typechecks/builds plus
      `pnpm test:agent:eval`, architecture, legacy-debt, unused-code and strict OpenSpec gates
- [ ] 6.4 Validate the existing VS Code Agent path in Extension Development Host with an isolated
      fixture and record no-regression/no-old-router evidence
- [ ] 6.5 Validate the Electron Content Project → Conversation create/restore → Pi turn → Tool
      approval → Activity → renderer reload scenario, including canonical-path counters and resource
      cleanup
- [x] 6.6 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:quality` and `git diff --check`;
      update Agent/Desktop current-capability docs and record all unexecuted gates and residual risks
