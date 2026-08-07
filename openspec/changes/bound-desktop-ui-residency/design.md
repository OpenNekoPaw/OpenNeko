## Context

`compose-desktop-workbench-scenes` correctly converged Desktop onto one window-level PrimarySidebar and one `ControlledWorkbenchShell`, but it also made every opened Workspace, Agent draft/session, management scene and nested page an independently retained UI instance. The resulting Host contract persists `owner`, `scene`, `activeAgentSurfaceId`, `agentSurfaces[].interaction` and renderer lifecycle policy, while the renderer mounts every Workbench and Agent Root and hides inactive descendants.

Agent application state has a second unbounded retention path. `AgentAppHost` retains every attached Workspace runtime, and each Workspace runtime retains every opened Conversation owner/projection until conversation deletion or application disposal. Durable conversation metadata and transcript already live in local authority, so runtime retention is not required for history recovery.

The product is a local single-user Electron application. It needs exact identity, local durability, background tasks, renderer isolation and explicit resource release; it does not need a remote session server, distributed cache, general page registry, universal LRU or cloud synchronization.

This change separates four lifecycles:

```text
durable record       Project / Workspace / Conversation / Room / document / Asset
visible presentation current route + current Surface + optional explicit split
background execution running / queued / approval-waiting task owner
recoverable snapshot package-owned layout / viewport / selection / draft / scroll
```

## Goals / Non-Goals

**Goals:**

- Keep one stable window Shell while mounting only current and explicitly split business Roots.
- Preserve unlimited durable user records without tying them to open UI or runtime counts.
- Allow Agent turns, queues and approvals to continue without a mounted React Root.
- Bound provider concurrency and expensive renderer/runtime residency with simple Phase 1 rules.
- Restore Workspace, editor and composer presentation from package-owned facts and minimal snapshots.
- Remove renderer lifecycle policy and redundant active/interaction facts from Host durable contracts.
- Preserve invalid durable records as visible, non-operable items at their smallest owner boundary.

**Non-Goals:**

- Cloud synchronization, multi-user or remote server session management.
- A generic LRU/cache manager, dynamic page registry or cross-domain View-state repository.
- A hard cap on Project, Workspace, Conversation, Room, Asset or document history.
- Keeping every previously visited Surface instantaneously resumeable without reconstruction.
- Migrating, dual-reading or silently accepting an old internal Shell shape.
- Implementing Character/Room product runtime that is still owner-qualified unavailable.

## Decisions

### 1. Window Shell is stable; business Roots are bounded

Each Window mounts exactly one `ApplicationPrimarySidebar` and one `ControlledWorkbenchShell`. The Shell projects one current scene composition. It does not maintain a renderer stack for every navigation destination.

Each visible Shell slot mounts at most the one package Root referenced by the current Scene composition. An explicit user split MAY add `Secondary Main`; it does not authorize retained Roots in any slot. Management + qualified Preview/Detail is one explicit split composition and follows the same Main-slot bound. A current Workspace MAY simultaneously require Agent Interaction, Main editor, Resources and Timeline Roots, but those Roots all belong to the one current composition and do not create historical residency. Hidden descendants are unmounted.

The stable tree becomes:

```text
Window
└─ ControlledWorkbenchShell
   ├─ ApplicationPrimarySidebar
   ├─ current Interaction or Main Root
   ├─ optional explicit Secondary Root
   ├─ current Manager/Timeline projection when the scene requires it
   └─ status
```

The rejected alternative is a retained stack for all Workbench and Surface identities. It gives fast switching only by making memory, subscriptions and render work proportional to history.

### 2. Navigation destination is not a durable Workbench instance

Create, Assets, Extensions, Projects and Settings are application routes/scenes. Assets MAY create an owner-scoped runtime session while active because selection and preview authorization have a real lifecycle, but that session is not a durable Window open-instance record. Extensions, Projects and Settings do not receive durable management-session identities solely for navigation.

Any new entry, page, tab, chat room, assistant or editor must first be classified as Window navigation, a domain durable record, a background task/runtime or a package-owned presentation snapshot. Its owner, exact identity, creation condition, release condition and recovery source must be explicit. A capability that only changes the visible selection remains a current Scene; without an independent business lifecycle it does not receive a Session/OpenInstance, cross-domain registry, retained Root or open-count model.

Workspace remains a durable resource/context identity. A Window keeps one current Workspace composition and recent Workspace metadata, not a persistent list of mounted Workspace Roots. Each Project tab may retain one minimal Host-owned layout snapshot containing only its reconstructable View refs and layout presentation. Switching Workspace captures that outgoing snapshot, unmounts its Roots and activates the target's exact snapshot or canonical default. The tab snapshot is not projected through the public Renderer tab contract and owns no runtime, subscription or domain fact.

Entry/Create keeps at most one lightweight unsent draft snapshot per Window. Activating Create does not allocate another retained Agent Root. Replacing a non-empty draft requires an explicit product action; ordinary scene navigation preserves the snapshot.

### 3. Durable catalogs are unlimited and metadata-oriented

Project, Conversation, Room, Asset and document catalogs do not have a product hard limit. Lists project lightweight metadata and diagnostics, load content on demand, and support paging/search/recent/archive where volume requires it.

An unavailable record remains in its catalog with owner-qualified diagnostic fields. It cannot open or trigger business operations, but it can be explicitly deleted, removed or relinked when the owning domain supports that operation. Runtime eviction never changes catalog membership.

### 4. Agent task runtime is independent from Agent UI

`@neko/agent-runtime` remains the owner of Workspace runtime, Conversation runtime, turn, queue, approval, lease, transcript projection and cancellation. Renderer selection is never consulted to determine whether a task may continue.

A Conversation runtime is protected from release when it is:

- backing the current or explicitly split Agent Surface;
- executing a turn;
- holding queued input that has not reached a durable terminal state; or
- waiting for an approval/question that requires user action.

An inactive Conversation with none of these conditions is stopped and removed from the in-memory runtime map. Reopening attaches a new runtime to the same local Conversation authority and rebuilds its current context/projection. A Workspace runtime is released when it has no visible Conversation/Workspace Surface and no protected Conversation runtime.

Phase 1 deliberately uses no recent-runtime LRU. If measured reopen latency later violates an explicit product budget, a separate change may add a small cache with evidence and a single owner.

The implementation uses two narrow `@neko/agent-runtime/application` ownership contracts rather than a
generic residency manager. A `AgentVisiblePresentationBinding`, keyed by the exact Desktop connection,
records the currently visible Workspace and optional Conversation. A
`AgentConversationRuntimeProtection`, keyed by an exact protection identity, records only queued,
approval or question work that remains outside a visible binding. Running state is read from the
Conversation owner itself. `AgentWorkspaceRuntimeResidency` is a read-only neutral fact for tests,
diagnostics and later measurement; it does not decide catalog visibility or persist state.

Releasing the last visible binding marks the Workspace for release. The application owner first stops
idle unprotected Conversation owners, disposes their projections and leases, and then removes and
disposes the Workspace runtime only when no visible binding, opening operation, active turn or explicit
protection remains. Workspace disposal clears package Tool and model registries exactly once. The
SQLite catalog and Pi Session authority are not rewritten; reopening attaches a new writer lease to the
same Conversation and Pi Session identities. A stale disposer closes only the binding object that
created it and cannot target a subsequently attached Workspace runtime.

The Desktop session bridge connection is a Renderer Root resource, not a Scene-transition resource.
Each successful bootstrap acquires one exact connection attachment and the Electron adapter releases
that attachment through one typed detach request after its local subscriptions unmount. Main validates
the stored connection identity against the sender-derived application and Window before releasing it;
it closes the connection event producer before disposing the final attachment, then publishes a
terminal marker on the same ordered event stream. Background turn completion may continue in the
Agent application owner, but it cannot publish another Renderer connection event after that marker.
Preload keeps the event cursor until that marker arrives, so already queued events remain valid without
reaching an unmounted listener even when the detach invoke result arrives first. React StrictMode may
acquire the same connection twice, so attachment counting exists only at this exact bridge boundary.
Scene transition, Workbench, Surface and Conversation catalog operations do not compete for connection
cleanup; Window teardown remains the outer fail-safe owner for renderer loss.

### 5. Provider execution has a simple application budget

Each Conversation runs at most one provider turn at a time; follow-up input remains in its conversation-owned queue. The application runs at most two provider turns concurrently in Phase 1. A central Agent application scheduler admits the next eligible conversation fairly and does not use the active Renderer/Workspace as priority or ownership.

Approval waiting does not consume a provider execution slot after the provider/tool operation has yielded, but its Conversation runtime remains protected. Media generation, export and other domain Jobs continue to use their own package budgets; they are not folded into the Agent provider semaphore.

The same Conversation application owner holds the executable pending-turn payload and its public message-queue projection. Read, promote, cancel and edit operations mutate that owner directly; Desktop does not retain a second display-only queue. Application disposal rejects turns that never started and cancels active provider streams before disposing the scheduler.

Two admitted turns can checkpoint concurrently across independent Workspaces while sharing the local SQLite catalog. Pi Session file writes therefore complete outside the short synchronous SQLite write transaction; the exact writer lease is revalidated immediately before the catalog commit, and a failed commit restores the prior Pi Session leaf. No SQLite transaction remains open across asynchronous file I/O.

The rejected alternatives are unlimited concurrency and a user-visible limit on total conversations. The first can exhaust provider, CPU and memory resources; the second destroys the distinction between durable history and execution cost.

### 6. Recoverable presentation state belongs to the package owner

Each package defines only the snapshot needed to reconstruct its Surface:

| Owner                  | Durable facts                                             | Recoverable presentation snapshot                            |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| Host Shell             | current route, current Workspace/View refs, Window layout | sidebar/split dimensions and one minimal layout snapshot per Project tab |
| Agent                  | conversation, transcript, turn, queue, approval           | one Window entry draft; composer/scroll state where required |
| Workspace/editor owner | documents, Canvas/Cut/Preview facts                       | active View, viewport, selection, playhead, panel layout     |
| Assets                 | Asset catalog and mutations                               | filter, selection and list presentation where useful         |
| Chara/Room             | character/room/timeline facts                             | active participant/panel selection after the owner exists    |

Snapshots contain no process handle, Electron object, raw path, provider stream or duplicated domain record. Packages may use existing local metadata or document shadow storage when state must survive renderer/application restart. A package must not retain a hidden Root merely because it lacks a snapshot contract.

The editor and Workspace audit resolved the concrete reconstruction owners as follows:

| Surface        | Existing durable/runtime owner                                                                                                                                  | Reconstruction decision                                                                                                                                                                                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace Main | `DesktopWorkbenchLayoutProjection` owns View refs, active groups, explicit split, Agent/Main placement, Resource Dock and Timeline presentation | Keep one current Window composition. Before an exact Project switch, copy only that layout projection into the owning stored Project tab; reconstruct the target composition from its tab snapshot or the canonical default. The snapshot is stripped from public tab projection and contains no React Root, runtime, subscription, raw path or domain fact. |
| Canvas         | `CanvasHostSnapshot.presentation` already defines viewport and selected node identities                                                                         | `@neko/canvas-domain` now owns an exact-identity `CanvasHostPresentationSnapshotStore`. A released `CanvasHostRuntimeSession` reconstructs from that store across renderer-session replacement; Window/application disposal clears it. The store contains neither `.nkc` facts nor paths, media handles or effects.                                      |
| Cut            | `CutHostRuntimeSnapshot.presentation` defines playhead, preview volume/mute, timeline scale, snapping and overview visibility                                   | `CutApplicationRuntime` keeps only that bounded presentation value after an inactive document session is reconciled. Reopening the same stable Cut identity reconstructs the value while OTIO facts, Preview controllers and media adapters are reopened independently. Playback state, gestures and derived representations are intentionally excluded. |
| Preview        | `PreviewViewerSnapshot` defines media position/rate/volume plus package viewer state                                                                            | `PreviewViewerSnapshotProvider` owns the descriptor-keyed store above individual Preview Roots. Unmount releases the media/viewer Root; remount restores through the same package provider. The stable Desktop renderer Root composes the provider without receiving viewer facts.                                                                       |

Canvas and Cut presentation identities intentionally exclude `rendererSessionId`, because renderer replacement is a reconstruction event, but include Project, Workspace, Window, View, View instance, document and session identities. A mismatched durable identity cannot receive another View's snapshot. No editor introduced an empty record, generic cache manager or hidden sibling Root.

The management Surface audit resolved the remaining reconstruction owners as follows:

| Surface                    | Owner-valued state                                                                                          | Reconstruction decision                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Asset Center               | active catalog filter, directory, sort, view mode and selected item identity                                | `@neko/assets-node` keeps only `AssetCenterPresentationSnapshot`. Session detach releases Preview authorization and the controller; reattach restores the filter, refreshes the current catalog and resolves the selected item through the current Assets authority before creating a new Preview authorization. Catalog entries, locator, absolute path, Preview descriptor and handle are excluded. |
| Workspace Resource Browser | query, active facet, list/grid mode, expanded resource identities, per-facet selection and active container | `@neko/assets-webview` owns a Window-lifetime provider keyed by exact Project + Workspace identity. The old module-global `displayStateByProject` map is deleted. A remounted Root reissues the current search and requalifies selection/container identities against its fresh projection. A default page writes no snapshot record.                                                                 |
| Extensions                 | none beyond current catalog facts                                                                           | Tab and query are transient singleton-page controls and reset on remount. Projection is re-read from `AgentExtensionManagementRuntime`; no management snapshot, open-instance or cache record is created.                                                                                                                                                                                             |
| Projects                   | selected Project identity                                                                                   | Selection remains in the Host scene/project projection. Query, sort and list/grid controls reset to canonical defaults on remount; no Project management snapshot or session cache is added.                                                                                                                                                                                                          |
| Settings                   | active settings section                                                                                     | `settingsSectionId` remains the single Host Scene input. Search, pending mutation and diagnostic state reset with the Root; no Settings snapshot or retained section Root is added.                                                                                                                                                                                                                   |

Resource Browser does not absorb `EntityInspector` edit fields. The current retained Entity detail Root remains inside the task 5.4 removal boundary; before deleting it, an unsent Entity edit must either move to an Entity-owned draft snapshot or receive an explicit discard interaction. It must not be copied into the Assets display snapshot or silently lost.

### 7. Host contracts contain identities and layout, not React residency

`@neko/host` removes `DesktopSurfaceLifecyclePolicy`, `DesktopWorkbenchViewLifecyclePolicy`, `resolveDesktopWorkbenchViewLifecycle()` and `DesktopAgentSurfaceProjection.lifecycle`. Scene and Workbench projections retain only identities required to compose the current visible state. `owner` and active interaction are derived from one canonical Scene/context source rather than stored in multiple synchronized forms.

The Window stores exactly one current `DesktopWindowCompositionProjection`. A stored Project tab may additionally contain its optional minimal `DesktopWorkbenchLayoutProjection` for exact reconstruction after another Project becomes current. This is a presentation snapshot, not another Workbench instance: it is not included in `DesktopProjectTabProjection`, does not authorize a mounted Root or runtime and is rejected locally when any Window, Project or Workspace identity is foreign.

The exact target shape is decided contract-first during implementation, but it must not contain renderer-specific lifecycle or a duplicate interaction payload. Producer and consumer switch atomically; the old codec/field/retained path is removed rather than adapted.

### 8. Projection events are the canonical successful mutation result

Host scene mutations commit local state and publish one canonical projection event. Renderer applies that event and does not issue an unconditional full `getSnapshot()` after successful transition. Snapshot reads remain for initial attachment, renderer-session replacement, sequence gaps and explicit recovery after a failed mutation.

This preserves fail-visible endpoint/sequence checks without doubling ordinary navigation work.

### 9. Local invalid data remains isolated without compatibility paths

This change does not convert persisted internal Shell records. A record rejected by the current canonical codec is preserved and projected as a diagnostic at the smallest independently readable owner. If an invalid UI-only Window presentation cannot be isolated further, Desktop creates canonical default presentation state while preserving the rejected bytes for explicit handling. The codec and its long-term tests know only the current contract and general invalid-input behavior; they do not identify historical fields or shapes.

Conversation transcripts, Projects, Assets, Rooms and creative documents belong to separate authorities and are not deleted or rewritten because Shell presentation is rejected. No old reader, legacy field alias, fallback success or migration test remains in the product path.

### 10. Ownership and canonical paths

| Responsibility              | Package/public role                         | Producer                     | Consumer                   | Replaced path                                   |
| --------------------------- | ------------------------------------------- | ---------------------------- | -------------------------- | ----------------------------------------------- |
| current Window scene/layout | `@neko/host` Shell contract/service         | Host-neutral Shell owner     | Desktop preload/renderer   | durable retained Workbench/Surface catalog      |
| Conversation/task lifecycle | `@neko/agent-runtime/application`           | Agent application owner      | Desktop Agent adapter/Root | renderer-selected or permanently open runtime   |
| provider concurrency        | `@neko/agent-runtime/application` scheduler | Agent application owner      | Conversation turn owners   | unlimited workspace-local operations            |
| Agent presentation          | `@neko/agent-webview` Root/snapshot         | Agent package                | Desktop current slot       | all Agent Roots mounted in retained deck        |
| editor presentation         | package-owned Root/View model               | Canvas/Cut/Preview owner     | Desktop current slot       | hidden editor/inspector Root as state storage   |
| management presentation     | Assets/Agent/Host package public Roots      | owning application service   | Desktop current slots      | durable management Workbench instances          |
| React composition           | `@neko/ui/workbench`                        | UI primitive                 | Desktop renderer           | lifecycle-aware retained deck for product Roots |
| Electron boundary           | `apps/neko-desktop`                         | sender/window/native adapter | package public ports       | app-owned business lifetime policy              |

Logic retained in `apps/neko-desktop` requires Electron Window/sender identity, typed IPC, portal placement or native resource cleanup. Runtime admission, recovery eligibility, catalog visibility and snapshot semantics are host-neutral business behavior and must remain in their owning packages.

### 11. Retained-path inventory and removal boundary

The replacement boundary is the complete successful path below. Files listed as consumers must switch in the same contract change; they are not compatibility consumers.

| Current responsibility                                                                    | Current producer/consumer                                                                                                                                                                                                                                                                      | Canonical owner after this change                                                                     | Exact removal or convergence boundary                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Window Workbench catalog, active instance, duplicate owner and invalid-instance retention | `packages/host/src/desktop-workbench-instance-contract.ts`; composed by `desktop-shell-contract.ts`, `desktop-shell-state.ts` and `desktop-shell-service.ts`                                                                                                                                   | `@neko/host` current Window composition plus minimal stored Project-tab layout snapshots               | Replace `DesktopWindowWorkbenchCatalogProjection` with one current composition; delete open/focus/activate/close catalog operations, owner indexing and invalid catalog-member retention. Store only reconstructable layout refs on each exact Project tab, strip them from public tab projection and isolate invalid snapshots at the Window presentation owner. |
| Persisted Agent Surface catalog and lifecycle                                             | `DesktopAgentSurfaceProjection`, `activeAgentSurfaceId`, `agentSurfaces`, `DesktopSurfaceLifecyclePolicy`, `putDesktopAgentSurface`, `handoffDesktopAgentSurface` and `closeDesktopAgentSurface` in `desktop-workbench-instance-contract.ts`; synchronized again in `desktop-shell-service.ts` | Scene interaction ref in `@neko/host`; Conversation/task state in `@neko/agent-runtime`               | Add the exact current `agentSurfaceId` to the Scene interaction ref, then delete the parallel Surface collection, lifecycle field and synchronization functions. Draft-to-session binding replaces the current composition atomically instead of moving a retained Surface between catalogs.  |
| Host Main View renderer lifecycle resolver                                                | `DesktopWorkbenchViewLifecyclePolicy`, `resolveDesktopWorkbenchViewLifecycle()` and lifecycle-only tests in `desktop-workbench-contract.ts`                                                                                                                                                    | Current renderer composition plus package-owned snapshot contracts                                    | Delete the Host lifecycle type, resolver, export and lifecycle-only tests. Canvas, Preview and Cut reconstruction is proven through their owning snapshot producer/consumer paths rather than a Host `suspendable` label.                                                                     |
| Durable management navigation instances                                                   | management owners/session IDs created and reopened by `desktop-shell-service.ts`, projected through `desktop-scene-contract.ts` and `desktop-workbench-instance-contract.ts`                                                                                                                   | Current Host scene; an Assets-owned runtime only while Assets is active or owns a protected operation | Remove management Workbench catalog entries. Extensions, Projects and Settings use current scene identity only. Assets runtime identity must not become Window history or a hidden Root owner.                                                                                                |
| Desktop Main lookups into retained catalogs                                               | `apps/neko-desktop/src/main/app-host.ts`, `desktop-canvas-runtime.ts`, `desktop-cut-runtime.ts`, `desktop-preview-runtime.ts` and `desktop-resource-browser-runtime.ts`                                                                                                                        | Exact current Scene/View/Conversation identity passed through package public ports                    | Replace `instances.find(...)` and active Surface lookup with the canonical current composition. A stale request must fail on its supplied identity; no active/recent fallback is retained.                                                                                                    |
| All-Workbench portal target and runtime mounting                                          | `DesktopWorkbenchPortalTargetDeck` and the `projection.window.workbenches.instances.map(...)` path in `apps/neko-desktop/src/renderer/DesktopShell.tsx`                                                                                                                                        | Desktop renderer composition of the current Scene slots                                               | Render portal targets and `DesktopWorkbenchRuntimePortals` only for the current composition and an explicit visible secondary slot. Inactive management/workspace hooks and subscriptions must unmount.                                                                                       |
| All-Agent retained Root mounting                                                          | `RetainedDesktopAgentSurfaceDeck` in `DesktopAgentSurface.tsx` and `allAgentSurfaces` in `DesktopShell.tsx`                                                                                                                                                                                    | Current Scene interaction slot; background state remains in Agent application runtime                 | Render one exact current Agent Root, or one explicit visible secondary Agent Root if such a split is qualified. Delete the Desktop retained deck export and retained-only tests. UI detach must not dispose a protected task runtime.                                                         |
| Generic retained UI primitive used as product-lifecycle policy                            | `@neko/ui/workbench` `RetainedSurfaceDeck`; Desktop consumers above; Assets resource browser and Canvas inspector local uses                                                                                                                                                                   | Owning package composition with visible-item semantics                                                | Remove Desktop product-lifecycle consumers. Audit Assets and Canvas uses separately: keep only simultaneously visible repeated items; replace uses that preserve hidden page/detail/inspector state, then remove the primitive if no qualified consumer remains.                              |
| Agent Workspace runtime map                                                               | `DefaultAgentAppHost.workspaces` in `packages/agent/runtime/src/application/agent-app-host.ts`; attached through Desktop Agent composition and currently released only by delete/application disposal                                                                                          | `@neko/agent-runtime/application`                                                                     | Add exact visible/protected bindings and release eligibility. Remove an inactive Workspace runtime when it has no visible Surface and no protected Conversation, without changing the Workspace/Project catalog.                                                                              |
| Agent Conversation runtime map                                                            | `DefaultAgentWorkspaceRuntime.conversations` in `agent-app-host.ts`; turn/queue/approval state coordinated by `agent-controller-composition.ts` and `runtime/session/agent-message-queue.ts`                                                                                                   | `@neko/agent-runtime/application` per-Conversation owner                                              | Keep running, queued and approval/question-waiting Conversations protected; detach idle invisible owners and recreate them from `NodePiConversationAuthority` transcript/metadata on exact reopen. No renderer-selected ownership is added.                                                   |
| Provider execution admission                                                              | Conversation execution paths in `agent-controller-composition.ts`; no application-wide budget                                                                                                                                                                                                  | One direct scheduler owned by `AgentAppHost` application composition                                  | Serialize each Conversation and admit at most two provider turns application-wide. Do not introduce a generic scheduler framework or include media/export Jobs in this budget.                                                                                                                |
| Agent composer presentation recovery                                                      | `tab-render-runtime.ts`, `tab-render-realm-state.ts`, `useTabRenderRuntimeRegistry.ts` and Desktop Agent host adapters using Window `sessionStorage`; entry composer values still live only in `ConversationController.tsx`                                                                    | `@neko/agent-webview` minimal presentation snapshot through injected `AgentHostRuntimeAdapter`        | Reuse the existing package-owned tab draft state and extend the same canonical state owner for the one Window entry draft. Do not add a Desktop-global cache or persist transcript/queue/provider streams in it.                                                                              |
| Successful navigation projection                                                          | Host `desktop-shell-service.ts` commits and `emitAll()`; `DesktopShell.tsx` subscribes and also calls `getSnapshot()` after successful transition                                                                                                                                              | Host projection event sequence                                                                        | Remove only the unconditional success refresh. Keep snapshot reads for initial attach, renderer-session replacement, sequence gap and failed mutation recovery.                                                                                                                               |
| Contract and runtime fixtures                                                             | Host tests, Desktop Main/renderer tests, preload tests, SQLite integration tests, `scripts/desktop-functional/*`, and `scripts/agent-eval/desktop/scenario.mjs`                                                                                                                                | Canonical producer/consumer path above                                                                | Replace fixtures and assertions atomically. Delete replaced-path tests and `desktop-workbench-retention-provider-ui.mjs`; retain current-path, general invalid-current-record, mounted-root bound, background continuation and exact-identity rejection evidence without historical fixtures. |

The durable authorities intentionally outside this removal boundary are `NodePiConversationAuthority` transcript/metadata, Project/Workspace catalogs, Asset manifests and user-managed revisions, Room/Character facts, documents and generated artifacts. Neither UI cleanup nor rejected Window presentation data may rewrite or remove them.

### 12. Agent Evaluation disposition

The behavior owner remains `agent-runtime.workflow-controller`, so this change uses disposition
`update`, not a new suite. Existing `queue-during-run`, `tool-approval-visible`,
`cancel-resume-recovery`, `conversation-idle-continuation` and
`conversation-persistence-resume` cases remain the canonical behavior coverage. Their runtime facts
must be extended only where needed to prove background continuation, bounded provider admission and
runtime release after the visible connection leaves. Deterministic application tests own exact
eligibility, release-once and catalog-preservation mechanics; they are not described as real provider
acceptance. The hidden complete-Desktop and visible Electron lanes remain required by tasks 7.3 and
7.4.

## Validation Evidence (2026-08-07)

- `pnpm test:agent:eval` passed the key-free harness readiness lane: 44 test files, 285
  tests, 22 suites and 52 cases, including the all-suite dry run. This is not real Agent
  behavior evidence. The required hidden full-Desktop real-provider matrix remains
  `infrastructure-blocked` because `OPENNEKO_AGENT_EVAL_PROVIDER_ID`,
  `OPENNEKO_AGENT_EVAL_MODEL_ID` and `OPENNEKO_AGENT_EVAL_COST_APPROVED` are not present;
  the functional provider used by UI acceptance is not substituted for that authorization.
- Visible Electron workbench acceptance passed with no console errors, console warnings or
  exceptions. The authoritative report is
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-07T01-23-04.364Z-desktop-workbench-scenes-development/report.json`.
  It covers Create, Assets, Extensions, Projects, Settings, two isolated Workspaces,
  explicit split, small-window layout, application restart, Preview restoration and an
  Assistant turn that completed while its UI was not current before exact Conversation
  restoration. The directly inspected screenshots show Workspace B without Workspace A's
  View, Workspace A's Preview restored after the round trip, and no overlapping or clipped
  controls in the 1040 x 700 Assets split.
- Visible Electron Conversation navigation passed with no console errors, console warnings
  or exceptions. The authoritative report is
  `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-07T01-21-43.489Z-desktop-conversation-navigation-development/report.json`.
  It creates six durable Assistant Conversations, bounds the collapsed metadata projection
  to five visible children, expands to all six, deletes a non-current Conversation without
  changing the active identity, and exactly restores the earliest remaining Conversation
  with its transcript after leaving the Agent scene. The directly inspected restoration
  screenshot shows the selected Conversation, transcript and composer without overlap.
- The workbench report measured one `ControlledWorkbenchShell`, one Primary Sidebar, one
  primary Agent Surface and zero hidden owner Roots. Initial renderer counters were 2
  documents, 227 nodes, 509 listeners, 26,222,556 used heap bytes and 35,913,728 total heap
  bytes. Restoring Workspace A after visiting Workspace B took 19 ms and retained one
  mounted View/Preview Root with zero hidden owner Roots. Ordinary Assets navigation emitted
  exactly one projection update.
- The same single-run before/after switch sample increased from 703 to 1,386 nodes, 943 to
  1,692 listeners and 37,034,844 to 40,468,512 used heap bytes. The mounted Root bound and
  absence of hidden historical Roots prove that residency is not proportional to visited
  Workbench identities, but one sample does not prove long-term heap or listener stability.
  No idle-runtime LRU or generic cache is introduced from this evidence.
- `pnpm check:ci` passed formatting, lint, TypeScript, production builds, Desktop packaging,
  full package coverage tests and repository quality gates. The final removed-symbol audit
  found no production or test references to the deleted lifecycle policies, retained deck,
  retained deck selector, open Workbench catalog or Agent Surface catalog. Long-term
  functional acceptance now asserts only the canonical Entry draft and Files/Media/Assets
  paths; replaced owner-menu and Materials-facet absence probes were removed.

## Risks / Trade-offs

- [Switching back reconstructs a Surface and may be slower] -> restore local snapshot first, load heavy content on demand and measure before adding any cache.
- [Unmount loses an unsaved control value] -> inventory each current retained Root and add the smallest package-owned draft/snapshot before removing that Root.
- [Background task is accidentally stopped with its UI] -> protect runtime by explicit turn/queue/approval identity and add hidden-task continuation tests.
- [Two-turn application budget delays independent work] -> expose queued/running status; revise the number only with provider and Electron resource evidence.
- [Removing duplicate Host fields exposes existing inconsistent records] -> reject only the smallest presentation owner and preserve separate durable authorities; do not add compatibility success.
- [Management scenes reopen with less transient state] -> persist only user-valuable filter/selection state, not every visited page component.
- [StrictMode cleanup disposes a runtime prematurely] -> effect owns its subscription; package application owner owns the protected runtime until release eligibility is committed.
- [Hidden real-provider matrix is not authorized] -> keep task 7.3 open and do not infer Agent behavior acceptance from the key-free harness or visible functional-provider lane.

## Replacement Plan

1. Add focused failing tests for visible Surface bounds, background continuation, runtime release and durable catalog preservation.
2. Establish package-owned minimal snapshot contracts for Agent draft and affected Workspace/editor/management Roots.
3. Add Agent application runtime release ports and the two-turn scheduler; prove one-turn-per-conversation and fair queued admission.
4. Remove Host renderer lifecycle fields and redundant Workbench/Agent Surface facts, then atomically update producers, consumers and fixtures.
5. Replace retained Workbench/Agent/management portal decks with current plus optional split composition; remove old retained-path tests.
6. Remove unconditional post-transition snapshot refresh and verify canonical event delivery/recovery paths.
7. Run package tests, build/check/legacy-debt/unused gates, memory/subscription instrumentation and visible real Electron switching/background scenarios.

Rollback is source-level only. It must not delete conversations, Projects, Assets, Rooms, documents or accepted artifacts created while the new runtime is active. The old retained contract, lifecycle fields and renderer path are not restored as fallback production paths.

## Open Questions

- The Phase 1 provider-turn budget is fixed at two by this change. Raising it requires measured provider, memory and cancellation evidence; it is not a user preference in the first implementation.
- A recent idle runtime cache is intentionally absent. Its need and size remain a future measurement question rather than a current implementation task.
