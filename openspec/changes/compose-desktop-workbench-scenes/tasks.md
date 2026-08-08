## 1. Baseline And Active-Change Reconciliation

- [x] 1.1 Update `integrate-desktop-agent-home` and `plan-neko-desktop-phase-1-delivery` artifacts so Home handoff/standalone composer and Home -> Project -> Agent are explicitly superseded by direct unified Workbench entry; record `fix-desktop-agent-shell-regressions` and `integrate-desktop-assets-canvas` behavior as the unchanged baseline.
- [x] 1.2 Add normal Workspace Agent negative-regression tests for Header, Tabs, history, composer, model, file/reference, command, Skill, execution/approval, voice and Host messages before adding draft presentation.
- [x] 1.3 Add Desktop structure/parity tests for existing Project Main View identities, Resource Browser, display modes, theme surfaces, Timeline and resize behavior before Shell extraction.
- [x] 1.4 Add red structure tests requiring exactly one PrimarySidebar and one `ControlledWorkbenchShell` for Agent, Workspace, resource center, Extensions, project management and Settings scenes.
- [x] 1.5 Add absence/path tests for removed `HomeWorkspace`, `HomeStartCreating`, `agentInitialInput`, Home/Project/Settings top-level branches, scene-owned sidebar frames and implicit first/recent/active Project selection.

## 2. Host Scene, Transition And Sidebar Contracts

- [x] 2.1 Add closed canonical scene context and slot-specific Interaction/Main/Manager/Timeline/Status Surface refs to `@neko/host` public entries; reuse exact Window/View/Workspace/session identities.
- [x] 2.2 Add strict codecs/invariants rejecting unknown kinds, renderer payloads, incompatible slots, missing owner identity, mixed AssetCenter sessions and cross-Window/Workspace/View refs.
- [x] 2.3 Add typed scene transition intents/requests with requestId and exact Window/Workbench/Scene/owner identities; cover Agent Assistant, explicit Workspace grant, resource center, Extensions, project management, Settings and conversation restore.
- [x] 2.4 Add independent canonical `DesktopApplicationSidebarProjection` and Window-owner serialized mutation path with producer tests for visibility, hover reveal and width isolation from Workspace state.
- [x] 2.5 Update Host Shell service/state repository to restore exact scene/sidebar projections, reject stale transitions and return owner-qualified unavailable for unqualified future scenes.
- [x] 2.6 Switch all sidebar producer/consumer/fixture/test paths atomically and delete the old `workbench.primarySidebar` field, handler and dispatch without dual read/write or product conversion.

## 3. Single Desktop Workbench Composition Root

- [x] 3.1 Refactor `DesktopShell` to mount one `ApplicationPrimarySidebar` inside one `ControlledWorkbenchShell` for every scene, driven only by validated Host scene/sidebar projections.
- [x] 3.2 Convert the current Project workspace into slot composition without changing Agent/Main/Resource/Timeline components, props, View identities or layout helpers; delete its internal Shell/sidebar owners.
- [x] 3.3 Convert Settings into settings navigation/main slots in the same Workbench and delete the top-level `applicationSurface`/Settings shell branch and duplicate sidebar.
- [x] 3.4 Wire sidebar toggle/resize exclusively to the Window-owned serialized command path while retaining shared `useResizable` pointer lifecycle.
- [x] 3.5 Add Desktop delegation tests proving renderer maps validated refs to public Roots but cannot decide Agent scope, Workspace/resource identity, domain availability or preview kind.
- [x] 3.6 Run focused workspace parity tests and renderer production build; stop and repair any Agent, Canvas, Preview, Cut, Resource Browser, theme, display-mode, Timeline or resize regression.
- [x] 3.7 Restore PrimarySidebar recent Project and Agent conversation presentation/actions from the authoritative Shell projections; add all-scene persistence and exact-identity path tests.
- [x] 3.8 Reuse the Workspace visual/layout scope for every Workbench shape and add Agent-only, Assistant Agent + Main, Workspace Agent + Main + right Resources, and no-empty-column structure tests.

## 4. Assets-Owned Resource Center

- [x] 4.1 Add `AssetCenterSession` identity, catalog/filter/selection projection and owner-serialized mutations to `@neko/assets-domain`, with producer tests for empty, selected, wrong-session and disposed sessions.
- [x] 4.2 Adapt the existing Assets global-library Root into an Asset Management Root consuming the session contract; reuse `@neko/ui` controls and keep selection/filter state package-owned.
- [x] 4.3 Add Assets application coordination that authorizes the selected `ContentLocator` through Host ports and creates/releases an exact PreviewSession descriptor without exposing raw paths.
- [x] 4.4 Compose Asset Management in Main plus optional Preview/empty/unavailable Secondary Main using one AssetCenterSession; add package producer and Desktop consumer path tests.
- [x] 4.5 Add unsupported preview, authorization failure, scene switch, renderer reload and Window teardown tests proving Preview handles dispose while Assets facts remain.
- [x] 4.6 Delete the independent Home asset page/layout plus raw-path, extension-inference and Desktop-owned selection/preview alternative paths.

## 5. Remaining Management Scenes

- [x] 5.1 Move Extensions/Skills presentation from `DesktopShell` to an Agent package public management Root in Workbench Main using the existing extension application contract; retain Desktop only as typed adapter/placement.
- [x] 5.2 Compose project catalog/selection and available detail inside manager/main slots; keep selection separate from explicit directory/Workspace opening.
- [x] 5.3 Add owner/public-entry, empty/unavailable detail, scope mismatch, scene switching and Root disposal tests for Extensions, project management and Settings.
- [x] 5.4 Delete superseded Home management containers, CSS, route branches and app-owned extension UI helpers; run legacy/unused checks for removed paths.

## 6. Canonical Agent Draft And Scope Contracts

- [x] 6.1 Add package-owned `draft | session` Agent presentation and `assistant | workspace` scope contracts; keep normal Workspace invocation behavior unchanged when draft presentation is absent.
- [x] 6.2 Add Webview tests proving draft reuses the existing controller, `EmptyState`, `InputAreaProvider` and `InputArea`, retains model/configuration, authorized reference, launch-safe command/Skill and voice controls, and does not create conversation/scratch while editing.
- [x] 6.3 Define a window/view-scoped launch connection plus scope-qualified secret-free model/command/Skill/resource catalogs in `@neko/agent-contracts`.
- [x] 6.4 Classify every Host route by connection/scope; reject Workspace file search, Workspace Tool and domain mutation under Assistant scope with `workspace-scope-required`, and delete implicit active/first/recent Project selection.
- [x] 6.5 Implement package-owned launch application ports and Desktop Main/preload sender-bound adapters for catalogs and exact file/directory/microphone authorization without a synthetic Project or second Agent controller.
- [x] 6.6 Mount the same `AgentWebviewRoot` for draft/session and replace launch/session adapters by exact connection identity while preserving Root identity; add detach/attach, wrong-connection, reload and unmount cleanup tests.

## 7. Explicit Workspace Scope

- [x] 7.1 Add opaque sender/Window-bound Workspace directory grant and resolution contracts; native picker cancellation preserves the existing scene and creates no Workspace.
- [x] 7.2 Resolve an authorized grant to an exact Workspace identity through Host authority and transition to Agent + Workspace Main + Workspace Resources without creating a conversation.
- [x] 7.3 Freeze Workspace identity/grant in the stable conversation context on first submit and restore it without active Project lookup; reject only context-invalid conversations without rewriting records.
- [x] 7.4 Reject revoked, stale, mismatched or raw-path grants and return `new-conversation-required` for active-conversation scope/directory changes.
- [x] 7.5 Add producer/consumer/Electron path tests for directory choose/cancel, existing Project resolution, draft scope switch, first submit, conversation restore and exact owner selection.

## 8. Assistant User Space, Scratch And First Submit

- [x] 8.1 Add canonical AssistantSpace, AgentConversationContext, ResourceGrant and ScratchArtifactRef contracts without physical paths; reject an invalid record at its exact owner boundary without product conversion.
- [x] 8.2 Implement Agent-owned Assistant conversation/scratch lifecycle metadata over injected Host Content/File ports; isolate user resources from config, credential, extension roots and unrelated conversations.
- [x] 8.3 Add publish-before-cleanup flows to Assets/Workspace owning ports and cleanup only on conversation deletion or explicit command; test crash/reload recovery and durable artifact preservation.
- [x] 8.4 Implement first-submit local transaction for context, conversation, initial message and pending-turn intent, followed by idempotent provider execution keyed by request/turn identity.
- [x] 8.5 Project default as Agent-only and activated Assistant as Agent + authorized Preview Main without an independent Assistant Resources dock; preserve the Agent Root while attaching the committed session.
- [x] 8.6 Add path tests for Assistant files/scratch/preview, exactly-once first turn, provider startup failure, renderer reload, adapter replacement, deletion cleanup and absence of Home/raw-path/implicit Workspace routes.

## 9. Qualification And Documentation

- [x] 9.1 Record the `neko-agent-evaluation` authoring decision: update/create focused cases for Assistant vs explicit Workspace scope, scope-required denial, directory grant, exactly-once first turn and absence of implicit Project selection; define hard path evidence before running.
- [x] 9.2 Run focused producer/consumer tests and typechecks for Host, UI Workbench, Agent contracts/runtime/Webview, Assets, Preview, Canvas, Cut and Desktop; record exact commands, canonical-path evidence and removed-path assertions in `verification.md`.
- [x] 9.3 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:quality`, `pnpm check:legacy-debt`, `pnpm check:unused`, `pnpm check:application-boundaries`, `git diff --check` and `pnpm exec openspec validate compose-desktop-workbench-scenes --strict`.
- [x] 9.4 Run the key-free Agent Evaluation harness and focused real Desktop complete-session cases when configured; report key-free evidence separately from provider/model behavior and preserve exact infrastructure blockers.
- [x] 9.5 Run isolated production Electron scenarios for all scenes, Agent draft controls, Assistant activation, directory choose/cancel and Workspace activation, resource management + preview, sidebar toggle/hover/resize, all Workspace display modes, reload and cleanup at large/small windows.
- [x] 9.6 Update Desktop/Agent/Host/Assets architecture documentation after runtime evidence; apply `neko-quality-review` and record residual risks for existing voice readiness, supported Preview types and deferred cross-scope continuation.
- [x] 9.7 Replace `project-catalog`/management catalog and Assistant resources Scene producers/consumers with canonical slots, remove the superseded fields/readers, and add Host codec, SQLite repository and real startup regressions proving invalid records fail locally.
- [x] 9.8 Refine the package-owned Agent composer into a centered elevated surface; integrate safe Workspace label/selection presentation, preserve add/mode/model/command/Skill/approval/usage/send controls, omit branch/local metadata, and qualify narrow Desktop docks plus upward menus.
- [x] 9.9 Repair qualification regressions: attach Workspace sessions from Scene identity, make current-Project navigation idempotent, restore the dedicated PrimarySidebar toggle and bounded management presentation, reuse the canonical Preview presentation in Asset Center, and align Agent-only EmptyState with the composer; add focused producer/consumer and Electron path evidence.
- [x] 9.10 Make Project/Workspace and conversation restore atomically activate `activeTarget`, Workbench, Scene and Agent phase; allow a live Workspace Scene with an empty Main after closing the last View and add Host/AppHost/renderer path regressions.
- [x] 9.11 Preserve Pi `errorMessage` in the canonical transcript projection, prove failed turns remain diagnostic and successful turns remain conversational, and update/reuse the focused Agent workflow/stream-delivery evaluation evidence.
- [x] 9.12 Reuse Workspace panel chrome and resize composition for Assets, Extensions and Projects management + optional Preview/Detail, retain `@neko/preview-webview` as the sole viewer implementation, and qualify large/small Electron layouts.

## 10. Entry Draft Identity And Renderer Startup Recovery

- [x] 10.1 Update proposal/design/spec for unbound Entry Draft, per-click draft identity, exact session versus container recent navigation, and StrictMode-safe view-runtime ownership.
- [x] 10.2 Add the canonical Host scene contract/codec for exact Entry Draft identity; update all producers/consumers in one pass and keep unknown kinds fail-visible at the exact record.
- [x] 10.3 Make every Start Creating action allocate a new unbound draft without conversation, AssistantSpace, Workspace or inferred stable Scene/View binding.
- [x] 10.4 Add package-owned Agent Webview draft transition/reset that clears prior session presentation state while preserving the same Root, global model catalog and user settings.
- [x] 10.5 Bind Assistant/Workspace only through explicit current-draft transitions and keep unavailable Character/Room owners fail-visible; preserve atomic first-submit session activation.
- [x] 10.6 Add producer/consumer path tests proving stale drafts fail, old conversations remain unchanged, old Tabs/transcript cannot appear in a new draft, and recent session/container actions retain distinct semantics.
- [x] 10.7 Fix Asset Center runtime ownership so StrictMode effect remount cannot reuse a disposed runtime; add a regression that fails before the fix and preserves fail-visible final disposal.
- [x] 10.8 Run focused Host/Agent/Desktop tests, Agent Evaluation, full quality gates and real development/packaged Electron startup/reload scenarios; record canonical-path evidence and residual risks.
- [x] 10.9 Correct Entry Draft owner prompts, remove unbound prompts after Workspace binding, and place the Workspace layout control beside the PrimarySidebar top visibility control; add Agent/Desktop/AppHost path regressions.
- [x] 10.10 Render Workspace Preview through canonical content-only Preview chrome, compose management/detail as independent tabless shells, and hide only the Workspace Resource Browser global refresh control; add package/Desktop regressions.
- [x] 10.11 Qualify the corrected Agent activation and shell chrome in isolated development and packaged Electron at large/small sizes, then update `verification.md` and architecture documentation.
- [x] 10.12 Replace blocking Entry Draft owner selection with deterministic direct-submit Assistant binding while preserving explicit Workspace directory and future Role owner selection; add Agent Webview, Host and Desktop path regressions plus focused Evaluation evidence.
- [x] 10.13 Compose Assets, Extensions and Projects management plus Preview/Detail as two visually and structurally independent sibling shells with their own chrome/overflow boundaries and a resize gutter; add structure and real Electron layout evidence.
- [x] 10.14 Re-run focused/full quality gates, update verification/architecture evidence and apply `neko-quality-review` for the corrected entry and management shell behavior.
- [x] 10.15 Bind exact Entry Draft resource grants to deterministic Assistant scope before first-submit validation; reject partial/cross-draft binding and qualify an attached-file direct submit in development and packaged Electron.
- [x] 10.16 Render authorized Preview through canonical content-only chrome with inherited shell theme, omit low-information Project Detail while preserving an explicit catalog open action, and qualify focused plus development/packaged Electron paths.
- [x] 10.17 Make Entry Draft first-submit atomically hand off to the exact scope-owned Agent session and projection endpoint: materialize/replay the committed runtime conversation after lifecycle initial-message commit and before provider claim, retire launch attachments through their old binding, prove default Assistant and explicit Workspace activation plus second-message delivery, and update focused Evaluation/quality evidence.
- [x] 10.18 Replace the mixed Workspace layout menu and Main-header buttons with VS Code-style PrimarySidebar-top controls that independently toggle PrimarySidebar, Agent, Main and management presentation; add ownership, placement, interaction and focused renderer/style regressions.
- [x] 10.19 Restore packaged PrimarySidebar layout glyphs through a query-free canonical Codicon font asset and explicit TTF protocol MIME while retaining query-bearing URL rejection; add UI source and Desktop protocol regressions plus production renderer evidence.
- [x] 10.20 Keep Canvas node selection on the Canvas without mounting the selected node PropertyPanel as a Workbench right dock; verify the focused Webview test/build, application boundaries and strict OpenSpec. The selected-node Electron checkpoint passes, while the overall scenario remains failed on current Canvas Host-disposed exceptions recorded in `verification.md`.

## 11. Multi-Workbench And Agent Surface Instances

Tasks 11.1-11.9 record the implemented retained baseline that exposed the residency problem. Their
target constraints are superseded by `bound-desktop-ui-residency`; they are not production behavior to
preserve or a legacy path to keep after the replacement is complete.

- [x] 11.1 Reconcile this change with `remove-internal-versioning-and-product-migrations` tasks 3.1, 3.2, 5.3, 7.2 and 7.3; add red Host contract/state tests for a Window open Workbench instance catalog, one instance per AssistantSpace/Workspace owner, independent layouts and active-instance visibility selection without internal version/generation fields.
- [x] 11.2 Add red Desktop lifecycle tests proving two Workspace panel trees and multiple same-Workspace Agent Roots stay mounted across switching, while close/delete/archive releases only the exact owner; cover shell/panel and Main tab visibility without remount.
- [x] 11.3 Replace Window-global Workbench mutable state with instance-owned layouts and active identity; use one stable persisted shape, delete superseded product readers/writers, and reject only the exact invalid Window/Workbench record without modifying its bytes or disabling valid siblings.
- [x] 11.4 Add Host-owned open Agent Surface identity and lifecycle projection; reuse an existing Workspace instance when creating/restoring another associated conversation and keep draft-to-session Root identity stable.
- [x] 11.5 Make Main/preload/renderer Agent connections multi-instance: explicit connection/request identities, connection-owned projection control, exact-Surface qualification for user business actions, and no event projection into another Surface; remove endpoint epochs/generations rather than renaming them.
- [x] 11.6 Render all open Workbench, shell/panel, Main View and Agent Surface Roots through stable retained stacks inside the one ControlledWorkbenchShell; each navigation layer switches only its active identity.
- [x] 11.7 Add package-owned retained page/node lifecycle for resource directory/media/material/entity/detail/preview navigation and Canvas node inspector/editor switching; deletion closes only the exact child instance.
- [x] 11.8 Prove parent hide preserves the complete descendant tree and explicit close/delete/archive performs exact recursive disposal without cross-instance mutation.
- [x] 11.9 Add explicit `hot-retained | suspendable | ephemeral` lifecycle contracts and tests: retain core navigation/forms, suspend high-memory Canvas/media/3D resources with recoverable UI snapshots, reset Modal/Dialog invocations, recursively clear Window/user context, and reject one invalid child snapshot without dropping valid siblings.
- [ ] 11.10 Complete `bound-desktop-ui-residency`, then run focused Host/Desktop/Agent/Assets/Canvas tests, strict OpenSpec/quality gates and visible real-provider Electron acceptance proving two Workspace/conversation histories remain recoverable while only current/explicit-split Roots mount and background execution remains independent.
- [x] 11.11 Reconcile persisted session Agent Surfaces against the canonical owner-qualified Conversation catalog before renderer bootstrap; locally reject an invalid exact Surface, preserve Conversation authority bytes and valid siblings, activate a same-owner draft, project the diagnostic, and add Host/Desktop regressions plus deterministic Evaluation disposition.
- [x] 11.12 Make Assets, Extensions and Projects management/detail compositions default to an equal split and constrain the management Main to at least 50%; add renderer resize-boundary tests and visible large/compact Electron evidence.

## 12. Commit Entry Target Only On First Submit

- [x] 12.1 Update proposal/design/spec and Evaluation disposition so Project/directory/Assistant/Character/Room are Entry Draft targets, not pre-submit Scene scopes; keep unqualified Character/Room fail-visible.
- [x] 12.2 Keep Entry Draft unbound while retaining exact owner-bound Drafts for Assistant/Workspace/Character/Room invocation; replace optional submit authority with an exact `draftId + target` submit contract and update every producer, consumer, codec, fixture and test in one pass.
- [x] 12.3 Add a sender-bound Workspace target receipt path for one selected catalog Project or native directory without Scene mutation, active-Project inference or raw-path projection.
- [x] 12.4 Persist package-owned Entry input, references, target and model/configuration selection; stop writing Entry model/mode changes to shared settings and clear Draft state only after local submit succeeds.
- [x] 12.5 Activate Assistant/Workspace session Scene only after local transaction and exact runtime materialization; prove validation/persistence failure preserves the Entry Draft and provider failure remains in the committed session.
- [x] 12.6 Route Assistant/Workspace new-conversation actions to fresh owner-qualified Entry Drafts and retain explicit unavailable behavior for Character/Room until their owners are composed.
- [x] 12.7 Unify the Entry composer presentation with the session composer while hiding Entry-only unsupported mode and shortcut controls; add narrow/large UI regressions.
- [ ] 12.8 Run focused contracts/runtime/Webview/Host/Desktop tests, strict OpenSpec and quality gates, focused Agent Evaluation, and visible development/packaged Electron UI validation; record evidence and residual risk.
- [x] 12.9 Validate Workbench resize against the exact current Scene owner, remove the empty Desktop dock session Header divider, and simplify the shared conversation composer without disabling typed command/Skill discovery; add focused Host/Webview/Desktop and visible Electron regressions.
- [x] 12.11 Replace the Workbench-global Timeline-only Surface/portal with a Main-below Cut Panel whose active OTIO Root composes Preview + Timeline; keep Canvas/file Preview/Editor in upper Main, use Cut Panel tabs for multiple OTIO documents, make the top control toggle only the panel, unmount hidden/inactive Cut Roots, and add focused Cut/Host/Desktop plus visible Electron regressions for toggle, tab switching and resource drag/drop.
- [x] 12.16 Keep the Workspace region-control overlay aligned with macOS native title chrome while making Entry, Workspace, Assets, Extensions, Projects and Settings top-level panels full-bleed; remove decorative panel margin/Dock padding without changing package-owned content padding or the management/Preview resize gutter, and add focused style plus visible Electron regressions.
- [x] 12.17 Remove Workbench-level panel radii from Main, Interaction, Manager, independent Preview/Detail and responsive overlay shells while preserving package-owned internal component radii, borders and the functional resize gutter; update focused style and visible Electron assertions.
- [x] 12.18 Align the Workspace Main tab strip and adjacent Resource management header to one `38px` panel chrome height without changing the shared editor-tab default; add focused style and visible Electron geometry assertions.
