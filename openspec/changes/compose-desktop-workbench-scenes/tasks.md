## 1. Baseline And Active-Change Reconciliation

- [x] 1.1 Update `integrate-desktop-agent-home` and `plan-neko-desktop-phase-1-delivery` artifacts so Home handoff/standalone composer and Home -> Project -> Agent are explicitly superseded by direct unified Workbench entry; record `fix-desktop-agent-shell-regressions` and `integrate-desktop-assets-canvas` behavior as the unchanged baseline.
- [x] 1.2 Add normal Workspace Agent negative-regression tests for Header, Tabs, history, composer, model, file/reference, command, Skill, execution/approval, voice and Host messages before adding draft presentation.
- [x] 1.3 Add Desktop structure/parity tests for existing Project Main View identities, Resource Browser, display modes, theme surfaces, Timeline and resize behavior before Shell extraction.
- [x] 1.4 Add red structure tests requiring exactly one PrimarySidebar and one `ControlledWorkbenchShell` for Agent, Workspace, resource center, Extensions, project management and Settings scenes.
- [x] 1.5 Add poison tests for `HomeWorkspace`, `HomeStartCreating`, `agentInitialInput`, Home/Project/Settings top-level branches, scene-owned sidebar frames and first/recent/active Project fallback.

## 2. Host Scene, Transition And Sidebar Contracts

- [x] 2.1 Add closed, versioned scene context and slot-specific Interaction/Main/Manager/Timeline/Status Surface refs to `@neko/host` public entries; reuse exact Window/View/Workspace/session identities.
- [x] 2.2 Add strict codecs/invariants rejecting unknown kinds, renderer payloads, incompatible slots, missing owner identity, mixed AssetCenter sessions and cross-Window/Workspace/View refs.
- [x] 2.3 Add typed scene transition intents/requests with requestId, endpoint epoch, Window identity and expected Window/scene revisions; cover Agent Assistant, explicit Workspace grant, resource center, Extensions, project management, Settings and conversation restore.
- [x] 2.4 Add independent versioned `DesktopApplicationSidebarProjection` and sidebar mutation CAS with producer tests for visibility, hover reveal and width independent of Workspace revisions.
- [x] 2.5 Update Host Shell service/state repository to restore exact scene/sidebar projections, reject stale transitions and return owner-qualified unavailable for unqualified future scenes.
- [x] 2.6 Migrate the old `workbench.primarySidebar` value once, switch all producer/consumer paths atomically and delete or fail-close legacy sidebar updates without dual read/write.

## 3. Single Desktop Workbench Composition Root

- [x] 3.1 Refactor `DesktopShell` to mount one `ApplicationPrimarySidebar` inside one `ControlledWorkbenchShell` for every scene, driven only by validated Host scene/sidebar projections.
- [x] 3.2 Convert the current Project workspace into slot composition without changing Agent/Main/Resource/Timeline components, props, View identities or layout helpers; delete its internal Shell/sidebar owners.
- [x] 3.3 Convert Settings into settings navigation/main slots in the same Workbench and delete the top-level `applicationSurface`/Settings shell branch and duplicate sidebar.
- [x] 3.4 Wire sidebar toggle/resize exclusively to sidebar CAS while retaining shared `useResizable` pointer lifecycle.
- [x] 3.5 Add Desktop delegation tests proving renderer maps validated refs to public Roots but cannot decide Agent scope, Workspace/resource identity, domain availability or preview kind.
- [x] 3.6 Run focused workspace parity tests and renderer production build; stop and repair any Agent, Canvas, Preview, Cut, Resource Browser, theme, display-mode, Timeline or resize regression.
- [x] 3.7 Restore PrimarySidebar recent Project and Agent conversation presentation/actions from the authoritative Shell projections; add all-scene persistence and exact-identity path tests.
- [x] 3.8 Reuse the Workspace visual/layout scope for every Workbench shape and add Agent-only, Assistant Agent + Main, Workspace Agent + Main + right Resources, and no-empty-column structure tests.

## 4. Assets-Owned Resource Center

- [x] 4.1 Add `AssetCenterSession` identity, catalog/filter/selection projection and revision/CAS to `@neko/assets-domain`, with producer tests for empty, selected, stale and disposed sessions.
- [x] 4.2 Adapt the existing Assets global-library Root into an Asset Management Root consuming the session contract; reuse `@neko/ui` controls and keep selection/filter state package-owned.
- [x] 4.3 Add Assets application coordination that authorizes the selected `ContentLocator` through Host ports and creates/releases an exact PreviewSession descriptor without exposing raw paths.
- [x] 4.4 Compose Asset Management in Main plus optional Preview/empty/unavailable Secondary Main using one AssetCenterSession; add package producer and Desktop consumer path tests.
- [x] 4.5 Add unsupported preview, authorization failure, scene switch, renderer reload and Window teardown tests proving Preview handles dispose while Assets facts remain.
- [x] 4.6 Delete the independent Home asset page/layout and poison raw-path, extension-inference and Desktop-owned selection/preview fallback paths.

## 5. Remaining Management Scenes

- [x] 5.1 Move Extensions/Skills presentation from `DesktopShell` to an Agent package public management Root in Workbench Main using the existing extension application contract; retain Desktop only as typed adapter/placement.
- [x] 5.2 Compose project catalog/selection and available detail inside manager/main slots; keep selection separate from explicit directory/Workspace opening.
- [x] 5.3 Add owner/public-entry, empty/unavailable detail, scope mismatch, scene switching and Root disposal tests for Extensions, project management and Settings.
- [x] 5.4 Delete superseded Home management containers, CSS, route branches and app-owned extension UI helpers; run legacy/unused checks for removed paths.

## 6. Canonical Agent Draft And Scope Contracts

- [x] 6.1 Add package-owned `draft | session` Agent presentation and `assistant | workspace` scope contracts; keep normal Workspace invocation behavior unchanged when draft presentation is absent.
- [x] 6.2 Add Webview tests proving draft reuses the existing controller, `EmptyState`, `InputAreaProvider` and `InputArea`, retains model/configuration, authorized reference, launch-safe command/Skill and voice controls, and does not create conversation/scratch while editing.
- [x] 6.3 Define a window/view-scoped launch connection plus scope-qualified secret-free model/command/Skill/resource catalogs in `@neko/agent-contracts`.
- [x] 6.4 Classify every Host route by connection/scope; fail-close Workspace file search, Workspace Tool and domain mutation under Assistant scope with `workspace-scope-required`, and poison active/first/recent Project fallback.
- [x] 6.5 Implement package-owned launch application ports and Desktop Main/preload sender-bound adapters for catalogs and exact file/directory/microphone authorization without a synthetic Project or second Agent controller.
- [x] 6.6 Mount the same `AgentWebviewRoot` for draft/session and replace launch/session adapters by exact epoch while preserving Root identity; add detach/attach, stale epoch, reload and unmount cleanup tests.

## 7. Explicit Workspace Scope

- [x] 7.1 Add opaque sender/Window-bound Workspace directory grant and resolution contracts; native picker cancellation preserves the existing scene and creates no Workspace.
- [x] 7.2 Resolve an authorized grant to an exact Workspace identity through Host authority and transition to Agent + Workspace Main + Workspace Resources without creating a conversation.
- [x] 7.3 Freeze Workspace identity/grant in conversation context on first submit; restore it without active Project lookup and migrate existing Workspace conversations from their exact stored identity.
- [x] 7.4 Reject revoked, stale, mismatched or raw-path grants and return `new-conversation-required` for active-conversation scope/directory changes.
- [x] 7.5 Add producer/consumer/Electron path tests for directory choose/cancel, existing Project resolution, draft scope switch, first submit, conversation restore and no fallback.

## 8. Assistant User Space, Scratch And First Submit

- [x] 8.1 Add versioned AssistantSpace, AgentConversationContext, ResourceGrant and ScratchArtifactRef contracts without physical paths; define migration rejection for unresolved legacy records.
- [x] 8.2 Implement Agent-owned Assistant conversation/scratch lifecycle metadata over injected Host Content/File ports; isolate user resources from config, credential, extension roots and unrelated conversations.
- [x] 8.3 Add publish-before-cleanup flows to Assets/Workspace owning ports and cleanup only on conversation deletion or explicit command; test crash/reload recovery and durable artifact preservation.
- [x] 8.4 Implement first-submit local transaction for context, conversation, initial message and pending-turn intent, followed by idempotent provider execution keyed by request/turn identity.
- [x] 8.5 Project default as Agent-only and activated Assistant as Agent + authorized Preview Main without an independent Assistant Resources dock; preserve the Agent Root while attaching the committed session.
- [x] 8.6 Add path tests for Assistant files/scratch/preview, exactly-once first turn, provider startup failure, renderer reload, adapter replacement, deletion cleanup and forbidden Home/raw-path/Workspace fallback.

## 9. Qualification And Documentation

- [x] 9.1 Record the `neko-agent-evaluation` authoring decision: update/create focused cases for Assistant vs explicit Workspace scope, scope-required denial, directory grant, exactly-once first turn and forbidden Project fallback; define hard path evidence before running.
- [x] 9.2 Run focused producer/consumer tests and typechecks for Host, UI Workbench, Agent contracts/runtime/Webview, Assets, Preview, Canvas, Cut and Desktop; record exact commands and canonical-path/poison evidence in `verification.md`.
- [x] 9.3 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:quality`, `pnpm check:legacy-debt`, `pnpm check:unused`, `pnpm check:application-boundaries`, `git diff --check` and `pnpm exec openspec validate compose-desktop-workbench-scenes --strict`.
- [x] 9.4 Run the key-free Agent Evaluation harness and focused real Desktop complete-session cases when configured; report key-free evidence separately from provider/model behavior and preserve exact infrastructure blockers.
- [ ] 9.5 Run isolated production Electron scenarios for all scenes, Agent draft controls, Assistant activation, directory choose/cancel and Workspace activation, resource management + preview, sidebar toggle/hover/resize, all Workspace display modes, reload and cleanup at large/small windows.
- [x] 9.6 Update Desktop/Agent/Host/Assets architecture documentation after runtime evidence; apply `neko-quality-review` and record residual risks for existing voice readiness, supported Preview types and deferred cross-scope continuation.
- [x] 9.7 Migrate exact version 5 `project-catalog`/management catalog and Assistant resources Scene shapes to the canonical v6 slots; add Host codec, SQLite repository and real startup regression evidence while keeping current/unknown kinds fail-visible.
- [x] 9.8 Refine the package-owned Agent composer into a centered elevated surface; integrate safe Workspace label/selection presentation, preserve add/mode/model/command/Skill/approval/usage/send controls, omit branch/local metadata, and qualify narrow Desktop docks plus upward menus.
- [x] 9.9 Repair qualification regressions: attach Workspace sessions from Scene identity, make current-Project navigation idempotent, restore the dedicated PrimarySidebar toggle and bounded management presentation, reuse the canonical Preview presentation in Asset Center, and align Agent-only EmptyState with the composer; add focused producer/consumer and Electron path evidence.
