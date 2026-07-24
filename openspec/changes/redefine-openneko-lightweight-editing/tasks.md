## 1. Freeze the replacement boundary without implementing it

- [x] 1.1 Inventory every NKV/NKC codec, Custom Editor registration, Webview component/store/snapshot, Extension reconstruction path, operation/message/command, media import/copy path, current linked separation path, Canvas target, test, fixture, manifest entry and dependency inside the replacement boundary.
- [x] 1.2 Classify each item as `delete`, `retain-basic-webview`, `retain-current-media-adapter`, `retain-shared-primitive` or `replace-after-cleanup`; record owner, callers and deletion evidence in `cleanup-audit.md`.
- [x] 1.3 Freeze the target OTIO subset, document ownership, `.otio`-relative persistence/workspace-relative runtime projection and rebase grammar, manual-mute linked-audio semantics, VS Code-only scope and media-port boundary in OpenSpec/ADR only.
- [x] 1.4 Add static source/dependency/manifest guard definitions for every forbidden legacy path. Do not implement OTIO production code or new Webview behavior in this phase.

## 2. Delete deprecated Cut Webview slices first, then the remaining legacy path

- [x] 2.1 Freeze and record the retained Webview boundary: package/build, root/app shell, Host adapter and basic UI/media primitives that can consume future `TimelineView` without owning durable project state.
- [x] 2.2 First delete deprecated Webview feature slices and their dedicated tests/snapshots/fixtures: professional mode, extra visual layers, speed, transitions, rich title/subtitle authoring and generation, effects, color, mask, keyframes, shapes/animation, plugin surfaces, the legacy NKV Minimap and ambiguous controls; do not delete the retained basic shell or basic Subtitle Track.
- [x] 2.3 Delete the Webview snapshot/save protocol, parallel timeline DTOs, Extension-owned full-project reconstruction and any Extension handlers that only served the deleted Webview.
- [x] 2.4 Delete NKV/NKC Cut Custom Editor registration, codec, create/open/save/autosave/backup/migration and compatibility aliases from the selected replacement boundary.
- [x] 2.5 Delete media import/ingest/copy, project-local `media/`/`exports/` assumptions, import-time automatic audio/subtitle creation and Cut calls to audio transcode/derived-media jobs.
- [x] 2.6 Delete active/recent editor target lookup, implicit `.nkv` target selection, legacy Canvas aliases and fallback handlers.
- [x] 2.7 Delete professional/deferred operations and the legacy NKV Minimap across any remaining Host/store/message/adapter/settings/localization/test paths: extra visual layers, speed, transitions, title/subtitle authoring, effects, color, mask, keyframes, plugin/professional mode and ambiguous controls.
- [x] 2.8 Delete all remaining legacy tests/fixtures/helpers whose only purpose is to make a removed NKV, import/copy, professional, legacy Minimap or fallback path succeed; preserve only shared primitives and selected media-adapter seams with explicit post-cleanup consumers.

## 3. Prove cleanup is complete before new development

- [x] 3.1 Run the forbidden-path source, dependency, manifest and generated-artifact guards; every removed path must be absent or explicitly poisoned, not merely unreachable from the UI.
- [x] 3.2 Run legacy-debt and unused-code checks, plus focused package compilation sufficient to prove the cleanup skeleton has no dangling imports, duplicate DTOs or hidden registration.
- [x] 3.3 Inspect retained tests and prove none invokes deleted handlers, codecs, fixtures, command aliases or Webview snapshot persistence.
- [x] 3.4 Confirm old NKC/NKV user files and referenced media bytes were not modified or deleted by cleanup.
- [x] 3.5 Complete `cleanup-audit.md` with removed paths, retained seams, executed commands, results and residual blockers.
- [x] 3.6 Record an explicit `passed` cleanup gate. Sections 4–9 MUST NOT begin while any required absence, command, evidence or user-data check is incomplete.

## 4. Implement the OTIO file authority after the cleanup gate

- [x] 4.1 Define OTIO types and runtime guards for the selected Timeline/Stack/Track/Clip/Gap/ExternalReference/RationalTime/TimeRange versions only.
- [x] 4.2 Implement parse/serialize with object/path diagnostics, approved metadata validation and source-byte preservation on rejection.
- [x] 4.3 Implement stable `clipId`, reciprocal linked-audio identity and deterministic identity behavior for create/link/split.
- [x] 4.4 Implement Host-owned `CutDocumentSession` create/open/save/save-as/backup/revert, dirty state, external-change handling, revision and multi-document isolation.
- [x] 4.5 Implement link/relink, split, trim, reorder, ripple delete, Gap, audio gain/mute/fade, undo and redo as typed commands.
- [x] 4.6 Implement revisioned `TimelineView` projection and tests proving Webview state cannot become a writable project fact.

## 5. Implement `.otio`-relative media references

- [x] 5.1 Implement `linkMedia(workspaceRelativePath)` by validating the workspace media URI and persisting a normalized POSIX path relative to the `.otio` document directory, without transcode.
- [x] 5.2 Resolve ExternalReference targets from the `.otio` directory, allowing `..` references to project-external workspace files while rejecting absolute/runtime URLs and any resolved or symlink escape; project safe targets to the existing workspace-relative media source contract without persisting a second path.
- [x] 5.3 Implement `cut.defaultProjectRoot` only as the new-document destination without required project-local media/export/derived directories.
- [x] 5.4 Implement Save As rebasing that resolves against the old document directory and atomically rewrites references relative to the new directory without changing media targets.
- [x] 5.5 Test whole-tree moves, unrebased document-only moves, Save As rebasing, cross-workspace missing-media diagnostics and media-byte immutability.
- [x] 5.6 Route selected/dropped workspace-external regular files through one Host-owned atomic copy into `<otio-directory>/media/`, allocate conflicts without overwrite, clean failed staging, and then reuse the canonical link/probe/command path.
- [x] 5.7 Test inside-workspace no-copy, outside-workspace copy, conflict allocation, symlink/directory rejection, failure cleanup and both picker/drop callers.

## 6. Reintroduce the retained current separation and media execution

- [x] 6.1 Reimplement the retained explicit separate/unseparate semantics on OTIO stable Clip/link metadata and one atomic Cut Core command; do not revive the deleted Webview/NKV implementation.
- [x] 6.2 Reuse the same ExternalReference and current ranges; do not create WAV, transcode, copy media or create derived tasks.
- [x] 6.3 Add persisted Video Clip mute and initialize separated Audio Clips as unmuted at unity gain while preserving the Video Clip mute state.
- [x] 6.4 Prove links do not auto-mute or suppress either input: two unmuted linked Clips mix twice, muting either one removes only that input, and unseparate preserves Video Clip mute.
- [x] 6.5 Implement host-neutral probe/frame-capture/video-preview/PCM/export ports without Engine implementation types.
- [x] 6.6 Compose one selected VS Code adapter over the retained current media runtime; keep implementation actions/tokens/native handles private.
- [x] 6.7 Test media-unavailable diagnostics, PCM lifecycle, cancellation, staging cleanup, output preservation and document/session isolation.

## 7. Adapt the retained Webview to the new basic VS Code surface

- [x] 7.1 Register `.otio` as the Cut Custom Editor and drive the Webview from revisioned projections and command intents only.
- [x] 7.2 Refactor only the retained shell and primitives that passed the cleanup audit; do not restore deleted project stores, messages, adapters or hidden controls.
- [x] 7.3 Implement the basic timeline, contextual Inspector and controls for link media, split, delete, undo/redo, zoom, fit-all, playback, media export and Video Clip mute.
- [x] 7.4 Add new Webview tests for temporary-state loss, revision conflicts, manual-mute separation, supported controls, long-timeline navigation and absence guards.

## 8. Connect VS Code Canvas through an explicit Cut target

- [x] 8.1 Implement ordered Canvas workspace-contained media/gap routes targeting a new or explicit `.otio` URI/revision.
- [x] 8.2 Reject stale revisions, unsupported route items and active/recent Cut fallback without partial mutation.
- [ ] 8.3 Add producer/consumer and Extension Development Host coverage for new-target creation and explicit-target append.

## 9. Final validation and documentation

- [x] 9.1 Run new OTIO fixtures, command algebra, document-relative link/rebase, workspace containment, copy/move/save-as, multi-document and selected media-adapter tests.
- [ ] 9.2 Run Extension Development Host scenarios for open/edit/save/reopen, temporary Webview state loss, link, separation/manual mute, playback/export and multi-document isolation.
- [x] 9.3 Run affected build/test/check, legacy-debt, unused-code, strict OpenSpec and `git diff --check`.
- [x] 9.4 Update package/user/architecture docs to the implemented state and attach both the cleanup-gate evidence and final validation evidence.

## 10. Correct the retained basic Webview and bounded multi-track contract

- [x] 10.1 Update proposal, design, specs, ADR and cleanup audit so preview, transport, basic timeline, media/subtitle entry and Clip drag remain retained while only advanced feature slices are removed.
- [x] 10.2 Extend the OTIO subset with stable Track identity and enforce exactly one Video, at most three Audio, at most one Subtitle and at most five total Tracks.
- [x] 10.3 Replace kind-ambiguous commands with `trackId`-targeted add/remove Track, link/Gap and compatible Clip move commands; reject cross-kind moves and non-empty/fixed Track removal.
- [x] 10.4 Extend the Extension/Webview message contract for target Track media selection, optional Track creation and revisioned drag/drop without restoring Webview-owned project state.
- [x] 10.5 Refactor the retained preview panel, transport and timeline into basic components supporting audio/video/subtitle entry, Track controls, Clip selection/drag and manual Video Clip mute.
- [x] 10.6 Add path-level Core, Extension and Webview tests for Track limits, stable identity, targeted commands, compatible drag/drop, retained controls and advanced-surface absence.
- [x] 10.7 Run affected package build/test/check and Extension Development Host scenarios; record results and residual runtime limits.

## 11. Restore the retained Webview component boundaries and basic timeline interaction

- [x] 11.1 Record the corrected component boundary: `App` owns only message/media-session orchestration and temporary state; preview, transport, Inspector, toolbar, ruler/playhead, Track and Clip remain separate presentation components.
- [x] 11.2 Refactor the monolithic OTIO Webview into the retained basic components without restoring Zustand project ownership, snapshot save, legacy messages or advanced feature imports.
- [x] 11.3 Restore the reference timeline layout with fixed Track headers, adaptive ruler ticks, clickable/draggable playhead, horizontal scroll, zoom/fit-all, target Track media entry and compatible Clip drag/drop.
- [x] 11.4 Change preview start from selected-Clip-relative positioning to a revisioned timeline-time intent resolved by the Host, while retaining explicit stream cleanup and manual embedded/separated audio mute behavior.
- [x] 11.5 Keep thumbnail/waveform rendering behind a discardable derived-representation boundary; do not restore fake waveform fallback or Webview-owned workspace/media IO. Record unavailable derived visuals as a residual limit if the Host contract is not implemented in this slice.
- [x] 11.6 Add component, interaction and path tests proving the retained structure, playhead seek, timeline-time preview, compatible drag, Track limits and absence of advanced/legacy ownership.
- [x] 11.7 Run affected build/test/check and Extension Development Host scenarios, then update validation evidence and remaining runtime limitations.

## 12. Add derived media visuals and basic Clip editing

- [x] 12.1 Update the proposal/design/spec to require Host/Engine-derived thumbnails and waveforms plus frame-quantized snapping without restoring Webview IO or writable timeline state.
- [x] 12.2 Add a bounded revisioned representation request/result contract and extend the Cut media adapter with waveform generation beside existing frame capture.
- [x] 12.3 Render Video thumbnails and Audio waveforms through the retained `TimelineElementContent`, with in-memory revision scoping, stale-result rejection and explicit per-Clip unavailable state.
- [x] 12.4 Add shared frame quantization/snapping math for ruler/playhead and Clip trim interactions.
- [x] 12.5 Add selected-Clip start/end trim handles that preview locally and commit the existing typed `trim` command; retain split, ripple delete and compatible Track movement.
- [x] 12.6 Add Core/Extension/Webview tests for representation boundaries, stale revisions, waveform/frame projection, trim command payloads and snapping math.
- [x] 12.7 Run affected build/test/check and Extension Development Host scenarios, then update validation evidence and residual limitations.

## 13. Restore the retained resizable Workbench and mature basic interaction

- [x] 13.1 Correct proposal/design/spec so shared resizable layout, contextual Right Dock and recoverable Clip pointer interaction are retained basics rather than deleted professional behavior.
- [x] 13.2 Reuse `CreativeWorkbenchShell.rightDock`, shared resize primitives and VS Code Webview state for a collapsible 200–400px Inspector and a 20%–80% Preview/Timeline split.
- [x] 13.3 Adapt the retained `PropertyPanel` to Project/Video/Audio/Subtitle/Gap contexts using shared property primitives and only existing typed command callbacks.
- [x] 13.4 Replace minimum HTML Clip drag with pointer-owned compatible Track/insertion feedback, snapping indication, horizontal edge auto-scroll and cancellation cleanup; commit one revisioned `move-item` only on a valid release.
- [x] 13.5 Add focused component/interaction/path tests proving resize persistence, Right Dock ownership, pointer cleanup and absence of writable project/advanced panel restoration.
- [x] 13.6 Run affected build/test/check/OpenSpec gates and Extension Development Host scenarios, then record visual/runtime evidence and residual limits.

## 14. Close the basic-editor regression against the retained NKV interaction quality

- [x] 14.1 Update proposal/design/spec/ADR to distinguish deletion of the legacy NKV Minimap path from retention of a read-only OTIO Timeline Overview.
- [x] 14.2 Make the Preview stage fill the resizable region at the project aspect ratio and place transport below it.
- [x] 14.3 Add a `TimelineView`-only Overview with viewport/playhead projection and scroll-only pointer navigation; do not restore project store, media IO or Host commands.
- [x] 14.4 Keep one discoverable Inspector visibility action at the right edge of Preview controls without replacing the persisted expanded width or adding a collapsed right rail.
- [x] 14.5 Add regression/path tests for Preview sizing and order, Overview geometry/ownership, Inspector discoverability and legacy Minimap absence.
- [x] 14.6 Run affected Webview/package/build/check/OpenSpec gates and an Extension Development Host visual scenario; record evidence and residual limits.

## 15. Restore functional basic editing beyond reorder-only UI

- [x] 15.1 Reproduce the cross-Clip playback defect with a failing boundary-contract test and update proposal/design/spec/ADR for Preview-right Inspector, absolute Clip placement, Explorer/file linking, constant speed, basic Inspector editing and Timeline context menus.
- [x] 15.2 Extend the OTIO/Core contract with bounded `LinearTimeWarp.1`, media available range, revisioned Clip timing/speed updates and frame-based `place-clip` Gap normalization.
- [x] 15.3 Extend the selected VS Code adapter and preview protocol with active-input segment boundaries, speed-aware source mapping and automatic cross-Clip/Audio-boundary stream switching.
- [x] 15.4 Route VS Code Explorer/system file drops through the same Host prepare/validation/probe/ExternalReference command as the file picker.
- [ ] 15.5 Move the resizable Inspector beside Preview and above the full-width Timeline; add Project/Track/Clip/Gap basic editing controls without restoring the professional property system.
- [ ] 15.6 Add Timeline context menus and time-placement pointer interaction while retaining trim handles, snapping, autoscroll and cancellation cleanup.
- [ ] 15.7 Add Core/Extension/Webview regression and path tests for boundary switching, Gap placement, dropped files, duration/speed/audio edits, Inspector layout and context-menu dispatch.
- [ ] 15.8 Run affected builds/tests/checks, strict OpenSpec and Extension Development Host scenarios covering cross-Clip playback and the restored interactions; record remaining limits.

## 16. Restore the audited core/basic Webview capability set

- [x] 16.1 Re-audit the previous Webview, Extension provider, save path, media services, export panel/service and tests; record the P0/P1/delete matrix in `legacy-webview-capability-audit.md`.
- [ ] 16.2 Add failing behavior/path tests for edit-dirty-save-reopen, cross-Clip preview, time placement, trim/duration/speed/audio persistence, Explorer/file drop, context-menu dispatch and export task restore/cancel.
- [ ] 16.3 Adapt the old basic components, keyboard shortcuts and interaction lifecycle to revisioned `TimelineView` and typed intents; do not maintain a parallel minimal implementation or restore writable project Store ownership; leave primary+S to VS Code save.
- [x] 16.4 Replace synchronous foreground export with a document/session/job-scoped Extension Host registry, adapt the old config/progress panel to query, background, cancel and resume it, and project explicit task state into a native VS Code status item that navigates to the owning `.otio`.
- [ ] 16.5 Restore P1 selection/clipboard/shortcut/Track productivity only after the P0 edit-save-preview-export paths pass their tests.
- [ ] 16.6 Run Core/Extension/Webview behavior tests and builds, strict OpenSpec, dependency/legacy/unused gates and isolated Extension Development Host scenarios; keep the change incomplete until all applicable gates pass.
- [ ] 16.7 Restore the canonical `PreviewPanel`, `PreviewControls`, `Timeline`/timeline hooks, `PropertyPanel` and Export subview boundaries; remove parallel `Basic*` replacements and prove shared i18n/theme/error/logger/UI infrastructure remains the only runtime.

## 17. Restore the previous UI implementation before reconnecting OTIO

- [ ] 17.1 Restore the pre-change Cut Webview `components/`, `hooks/`, i18n and style implementation in one bounded operation while retaining the current OTIO Domain, Extension Host, document session and media adapter.
- [ ] 17.2 Refactor Zustand into a document-scoped Presentation Store containing the immutable `TimelineView` projection and recoverable UI/gesture state, then introduce one OTIO adapter/controller that routes every retained durable edit through revisioned typed intents; do not restore NKV `ProjectData`, project mutation/history/save or any writable project authority.
- [ ] 17.3 Reconnect the restored `PreviewPanel`/`PreviewControls`, `Timeline`/Track/Clip/hooks, `PropertyPanel` and Export subviews through that adapter without replacing their DOM, accessibility and interaction lifecycles with minimal JSX.
- [x] 17.4 Remove only the professional/deferred branches listed by the capability audit, together with their exclusive handlers/locales/styles/tests; retain shared runtime and all basic component behavior tests.
- [ ] 17.5 Adapt the retained behavior tests for OTIO projections and typed intents, including pointer/keyboard/focus, context menu, resize, selection, clipboard, export and media-session lifecycle; source-string checks alone are insufficient.
- [ ] 17.6 Run Webview/Cut/Domain tests, builds, dependency/unused/legacy gates, strict OpenSpec and isolated Extension Development Host visual/interaction scenarios before marking 16.7 complete.

## 18. Repair revision stability, serialization and media-independent preview

- [x] 18.1 Add regression tests proving linked source-range edits remain serializable and `CutDocumentSession` rejects invalid command results before mutation.
- [x] 18.2 Make reciprocal linked timing/source edits atomic while preserving independent mute/gain/fade settings.
- [x] 18.3 Support audio-only and streamless-gap preview segments; stop normally at timeline end without a missing-Video diagnostic.
- [x] 18.4 Clamp each Minimap Clip to the timeline range and retain unchanged derived representations across Host revisions.
- [x] 18.5 Audit Cut i18n/theme/error/logger paths; replace raw Host/Preview/Export error strings with the shared structured diagnostic contract, localize the complete catalog and project recoverable errors through the existing Toast surface only.
- [ ] 18.6 Run focused Core/Extension/Webview tests and builds, strict OpenSpec, then validate save/backup, Minimap, add-Track/move and audio-only preview in an isolated Extension Development Host.

## 19. Restore Clip/Track state tools and reversible trim

- [x] 19.1 Add failing Core/Codec/Preview tests for Clip/Track enabled and locked state, new-identity duplication and locked-command rejection.
- [x] 19.2 Project available-range start/duration and add failing Webview tests for independent start/end trim recovery and localized Clip status.
- [x] 19.3 Implement Clip/Track copy, paste, delete, lock and visibility through the existing Zustand/controller/context-menu/component path.
- [x] 19.4 Replace text glyph controls with shared icons and status tags without changing theme colors or creating a second design system.
- [x] 19.5 Run focused Domain/Extension/Webview tests and builds, strict OpenSpec, then verify state visuals, clipboard actions, i18n and reversible trim in the Extension Development Host.

## 20. Restore retained productivity and shared Host integrations

- [x] 20.1 Re-audit old and current Clip/Track/Timeline edit/state, context menus, Inspector, AI quick invocation, VS Code status bar, i18n/theme/error/logger/Shell and drag/drop paths; record exact retain/adapt/delete decisions in `legacy-webview-capability-audit.md`.
- [ ] 20.2 Restore multi-select, box-select, batch move, Timeline cut/copy/paste/duplicate/select-all, playhead follow and multi-file serialized drop through the retained Zustand/controller/hooks.
- [x] 20.3 Restore Track rename/reorder/mute/lock/hide/delete, Track/Gap/background context menus and Project/Track/Gap Inspector contexts through revisioned Host commands.
- [ ] 20.4 Replace the legacy Cut AI action helper/handler with shared `AgentContextPayload` projection and `neko.agent.sendContext`; add deterministic contract tests and a focused Agent Evaluation proving explicit target identity and no legacy/active-editor fallback.
- [x] 20.5 Extend the shared `StatusBarGroup` integration with document/session-scoped Cut status while keeping background export jobs independent; localize all text and navigation commands.
- [ ] 20.6 Prove shared i18n, VS Code theme tokens, icons/tags/menu/property primitives, ErrorBoundary/Toast/ErrorHandler, logger, `CreativeWorkbenchShell`, resize, keyboard and drag/drop paths remain canonical and no Cut-local replacement runtime exists.
- [ ] 20.7 Run focused Domain/Codec/Extension/Webview tests and builds, strict OpenSpec, key-free Agent Evaluation validation, dependency/legacy/unused gates and isolated Extension Development Host scenarios for the retained productivity set.

## 21. Stabilize rapid timeline gestures and compact Track controls

- [x] 21.1 Add red-capable tests for two rapid durable Clip edits sharing one starting revision, retained timeline canvas extent and icon-only Track controls.
- [x] 21.2 Serialize durable Webview intents across accepted Host revisions without optimistic OTIO mutation or stale-revision retry.
- [x] 21.3 Make both Clip trim edges visible and reversible within `available_range`, and retain the document-session timeline canvas extent after shortening.
- [x] 21.4 Increase Timeline Overview readability, remove Preview border/file overlays and replace redundant Track tags/names with media-kind and lock/mute/delete icon controls.
- [x] 21.5 Run focused tests/build/OpenSpec and validate rapid move, reversible trim, Overview and Track controls in the isolated Extension Development Host.
- [x] 21.6 Add explicit `place-clip` overlap policy and make pointer drops over an occupied Clip insert before/after it while exact Inspector time edits remain reject-on-overlap.
- [x] 21.7 Remove per-Track media-add buttons, centralize add actions in Timeline controls, expose Track state actions in the label and keep Clip/Track context menus semantically separate.

## 22. Add adaptive Preview canvas and project video profiles

- [x] 22.1 Add red-capable Domain/Webview tests for a revisioned project Canvas profile command, source-to-Canvas contain geometry and Canvas-to-container contain presentation.
- [x] 22.2 Implement `set-project-canvas` in Cut Core/Host while preserving edit rate and canonical OTIO metadata serialization.
- [x] 22.3 Reuse the Project Inspector and shared property/select primitives for localized TV, cinema, short-video and square presets.
- [x] 22.4 Make Preview render decoded frames without crop or stretch into the persisted project Canvas and let that Canvas adapt to both container dimensions.
- [x] 22.5 Prove background export consumes the accepted OTIO profile dimensions, then run focused tests/build/OpenSpec and an isolated Extension Development Host resize/profile/save scenario.

## 23. Replace Timeline add-Track text glyphs with media icons

- [x] 23.1 Add a red-capable `TimelineControls` DOM test proving Audio/Subtitle Track actions have localized names, remain clickable and do not render visible `A`/`S` glyphs.
- [x] 23.2 Reuse the shared Audio/Subtitle media-kind icons in Timeline controls without changing theme colors or introducing a second component path.
- [x] 23.3 Run the focused Webview test/build and strict OpenSpec validation, then verify both controls in an isolated Extension Development Host.

## 24. Diagnose export, playback and Preview runtime defects

- [x] 24.1 Use `runtime-defect-register.md` as the current defect inventory and add stable failing/path tests before changing export, playhead or preview runtime behavior.
- [x] 24.2 Decide and specify whether export saves the VS Code document or freezes the accepted in-memory OTIO revision; bind every job to explicit document/session/revision identity and prohibit disk/Webview/active-editor fallback.
- [x] 24.3 Repair the OTIO-to-export projection and output validation so duration, Clip order/ranges/speed, Video embedded audio, Audio Tracks and enabled/mute state match the frozen revision.
- [x] 24.4 Restore job-scoped output name, MP4/MOV, aspect-preserving resolution, frame-rate, video bitrate, audio inclusion/bitrate/sample-rate parameters without creating a second project-profile fact; explicitly exclude export-to-Canvas/DaVinci, retain the shared resizable Inspector path, and localize export/status projections through existing shared paths.
- [x] 24.5 Diagnose and repair stuck Playhead gestures, timeline-end overrun and delayed/interrupted cross-Clip switching across the Webview controller, Host preview boundary and selected media adapter.
- [x] 24.6 Make Preview workspace background follow existing VS Code theme tokens while preserving the project Canvas/letterbox color semantics.
- [ ] 24.7 Run focused Domain/Extension/Webview tests and builds, strict OpenSpec and isolated Extension Development Host scenarios for dirty export revision, mixed audio, multiple Clip boundaries, high-frequency Playhead drag, exact timeline stop and light/dark Preview themes; record evidence in `validation.md`.
- [ ] 24.8 Add save lifecycle/path tests, migrate OTIO persistence from package-local temporary-file replacement to the shared project-file save/authorized writer boundary, and prove normal save preserves the exact Custom Editor document/panel identity while version conflicts remain fail-visible.

## 25. Correct Timeline placement and presentation extent

- [x] 25.1 Diagnose historical canvas extent, real OTIO Gap, Clip move and media-entry paths; freeze sequence/position, explicit media insertion and structure-sensitive canvas contracts in proposal/design/spec/register.
- [x] 25.2 Add red-capable Domain/Webview/Extension path tests for ripple versus preserve-gap movement, same-Track forward adjustment, explicit `link-media` timing, picker/drop targeting and trim-versus-structure canvas retention.
- [x] 25.3 Implement required Core `sourcePolicy`/`overlapPolicy` placement and explicit timed `link-media`, poison omitted-field append behavior and keep Canvas explicit-target append outside this interactive insertion path.
- [x] 25.4 Add document-scoped sequence/position presentation state and route Clip pointer preview/release through the matching insertion or exact-time policy.
- [x] 25.5 Route external drop through pointer Track/time and native picker through playhead/selected compatible Track, preserving serialized multi-file order from each accepted insertion end.
- [x] 25.6 Make retained canvas extent depend on Track/item identity-order structure, shrink after delete/move/reorder, and visually distinguish projected Gap from ordinary Track background.
- [x] 25.7 Run focused Domain/Extension/Webview tests and builds, strict OpenSpec and isolated Extension Development Host scenarios for both modes, tail deletion, real Gap, pointer drop and picker insertion; record evidence in `validation.md`.
- [x] 25.8 Replace the two-option placement `SegmentedControl` with one localized icon-only toolbar button, infer position mode for an initial projection containing Gap, and enter sequence mode through a revisioned trailing-Gap trim without removing internal synchronization Gaps.

## 26. Group the contextual Inspector without Tabs

- [x] 26.1 Update proposal/design/spec so Project, Track, Clip and Gap properties use one continuous grouped Inspector surface without Tab or unsupported professional groups.
- [x] 26.2 Add DOM/path tests and adapt the retained `PropertyPanel`/`PropertyPanelInline` through shared property primitives for context-specific basic, timing, speed, audio, canvas and state groups.
- [x] 26.3 Run focused Webview tests/build, strict OpenSpec and an isolated Extension Development Host visual/interaction scenario; record evidence and remaining limits.

## 27. Group Timeline placement and Overview controls

- [x] 27.1 Update proposal/design/spec so the placement-mode and Timeline Overview visibility buttons form one adjacent toolbar group while retaining independent presentation state and actions.
- [x] 27.2 Add a DOM regression assertion and move the existing icon-only buttons into one `TimelineControls` group without changing handlers or toolbar ownership.
- [x] 27.3 Run focused Webview tests/build, strict OpenSpec and an isolated Extension Development Host visual scenario; record evidence.

## 28. Refine contextual Inspector density and alignment

- [x] 28.1 Update proposal/design/spec with responsive Inspector alignment, density, control grouping and non-overlap requirements across the supported width range.
- [x] 28.2 Add focused layout/value assertions, refine the Cut-scoped property surface, group, control and action styles, and normalize frame-derived seconds without changing shared property behavior or the canonical typed command path.
- [x] 28.3 Run focused Webview tests/build, strict OpenSpec and isolated Extension Development Host scenarios at the narrow and wide Inspector bounds; record geometry, interaction, console and screenshot evidence.

## 29. Close the repository local-CI baseline after the Cut refinement

- [x] 29.1 Reproduce and classify the remaining local-CI failures across Cut test ownership, Canvas presentation labels and Agent content-access contract assertions.
- [x] 29.2 Register the Cut Domain test and shared-coverage owner, align stale tests with the canonical Canvas and Agent contracts, and remove unused Cut legacy fallback style tokens without restoring compatibility paths.
- [x] 29.3 Run the focused regressions, residual/unused checks and full `pnpm ci:local`; record the exact results and any remaining external runtime risk.
