## 1. Contract And Runtime Inventory

- [x] 1.1 Inventory every producer/consumer of Window Workbench catalogs, Agent Surface catalogs, `DesktopSurfaceLifecyclePolicy`, retained decks, Workspace runtime maps and Conversation runtime maps; record the canonical owner and exact removal boundary in this change.
- [x] 1.2 Add focused failing Host/Renderer contract tests proving one current composition, at most one explicit split, no persisted renderer lifecycle field and no duplicate owner/interaction source.
- [x] 1.3 Add focused failing Agent application tests proving invisible running/queued/approval Conversations remain protected while inactive idle Conversations and Workspaces become releasable without changing durable catalogs.

## 2. Package-Owned Recoverable State

- [x] 2.1 Define the minimal Agent presentation snapshot for one Window entry draft and any user-valuable composer/scroll state; keep transcript, queue, approval and configuration facts outside the snapshot.
- [x] 2.2 Audit Canvas, Cut, Preview and Workspace Main Roots and add only the missing package-owned View snapshots needed to reconstruct viewport, selection, playhead and layout after unmount.
- [x] 2.3 Audit Assets, Extensions, Projects and Settings; retain only owner-valued filter/selection/section state and prove pages reconstructable from domain facts create no empty snapshot/cache record.
- [x] 2.4 Add producer tests for each new snapshot contract and renderer consumer tests proving reconstruction does not require a hidden sibling Root, raw path or retained process/media handle.

## 3. Agent Runtime Residency And Concurrency

- [x] 3.1 Extend `@neko/agent-runtime/application` with explicit Conversation and Workspace release eligibility owned by visible binding plus running/queued/approval protection facts.
- [x] 3.2 Implement Conversation runtime stop/detach and Workspace runtime detach so leases, projections, Tools, subscriptions and models release exactly once while Pi transcript/SQLite metadata remain unchanged.
- [x] 3.3 Implement the Agent application scheduler with one active provider turn per Conversation and two active provider turns per application; keep excess work in conversation-owned queues and admit it independently from active UI selection.
- [x] 3.4 Add concurrency, fairness, cancellation, approval-yield, background continuation, reopen and application-disposal tests for producer and Desktop consumer paths.

## 4. Host Contract Simplification

- [x] 4.1 Define the canonical Host Window/Scene/current-Workbench shape without renderer lifecycle policy, management open-instance catalogs, duplicate owner/interaction payloads or persisted hidden Agent Surface state.
- [x] 4.2 Atomically update Host producers, Desktop preload/renderer consumers, local metadata fixtures and typed IPC tests to the new shape.
- [x] 4.3 Delete `DesktopSurfaceLifecyclePolicy`, `DesktopWorkbenchViewLifecyclePolicy`, `resolveDesktopWorkbenchViewLifecycle()`, Agent Surface lifecycle fields, put/handoff/close synchronization code made unnecessary by the canonical current identity and all production exports/imports/tests for the replaced path.
- [x] 4.4 Delete the replaced codec/retained path, its registration, fixtures and tests before wiring the canonical path; use only development-time search and uncommitted probes to verify removal, and retain no poison helper, historical fixture or replaced-path-only test.
- [x] 4.5 Prove a stored UI presentation record that violates the current canonical contract is rejected and isolated without conversion, historical-shape recognition or changes to separate Conversation, Project, Asset, Room or document authorities.

## 5. Bounded Renderer Composition

- [x] 5.1 Replace all-Workbench portal target/runtime mapping with one current Workbench composition and an optional explicit secondary Surface.
- [x] 5.2 Replace the all-Agent retained deck with the current or explicitly split Agent Root; bind background projections to Agent application runtime rather than hidden React connections.
- [x] 5.3 Remove durable retained Workbench instances for Create, Assets, Extensions, Projects and Settings and reconstruct their package Roots from current scene plus owner facts/snapshots.
- [x] 5.4 Remove retained page/detail/inspector Roots used only as transient-state storage after the owning package snapshots exist; keep local error boundaries and exact cleanup identity.
- [x] 5.5 Add Renderer tests asserting mounted Root bounds, unmount cleanup, split behavior, draft/editor restoration and local failure isolation without inspecting or preserving the replaced retained DOM path.

## 6. Scene Projection And Transition

- [x] 6.1 Make the committed Host projection event the canonical successful scene transition update and remove Renderer’s unconditional success-path `getSnapshot()` refresh.
- [x] 6.2 Preserve full snapshot recovery only for initial attach, renderer-session replacement, event sequence gaps and failed mutation recovery, with focused sequence and stale-identity tests.
- [x] 6.3 Add instrumentation assertions proving normal navigation performs one projection update and inactive released Roots no longer receive subscriptions, hooks or portal construction.

## 7. Validation And Cleanup

- [x] 7.1 Run focused package tests for `@neko/host`, `@neko/agent-runtime`, affected Webviews and `apps/neko-desktop`, followed by `pnpm typecheck`, `pnpm build` and `pnpm test`.
- [x] 7.2 Run cleanup and architecture gates: `pnpm check:legacy-debt`, `pnpm check:unused`, `pnpm check:no-internal-versioning`, `pnpm check:application-boundaries`, `pnpm check:agent-boundaries`, `pnpm check:webview-boundaries` and `pnpm check:openspec`.
- [ ] 7.3 Run `pnpm test:agent:eval` for harness readiness, then the applicable real-provider hidden full-Desktop session matrix proving background turn/queue/approval and reopen isolation; keep evaluation outside CI.
- [x] 7.4 Run visible real Electron acceptance through `pnpm test:local:ui` for Create, two Workspaces, multiple Conversations, Assets, Extensions, Projects, Settings, explicit split, editor restoration and a background Agent completion; capture screenshots, DOM/runtime evidence and console diagnostics.
- [x] 7.5 Capture before/after Electron memory, mounted Root, subscription and ordinary navigation projection counts with the same fixture; record reopen latency and do not add an idle runtime cache unless the evidence creates a separate approved requirement.
- [x] 7.6 Run `pnpm check:ci`, review the final diff for removed lifecycle/retained/fallback residue and document remaining provider, platform, performance or unexecuted UI risks before marking the change complete.
