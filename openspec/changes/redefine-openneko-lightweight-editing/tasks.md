## 1. Freeze the replacement boundary without implementing it

- [ ] 1.1 Inventory every NKV/NKC codec, Custom Editor registration, Webview project store/snapshot, Extension reconstruction path, operation/message/command, media import/copy path, current linked separation path, Canvas/Agent target, test, fixture, manifest entry and dependency inside the replacement boundary.
- [ ] 1.2 Classify each item as `delete`, `retain-current-media-adapter`, `retain-shared-primitive` or `replace-after-cleanup`; record owner, callers and deletion evidence in `cleanup-audit.md`.
- [ ] 1.3 Freeze the target OTIO subset, document ownership, workspace-relative link grammar, current linked-audio semantics, TUI offline scope and media-port boundary in OpenSpec/ADR only.
- [ ] 1.4 Add static source/dependency/manifest guard definitions for every forbidden legacy path. Do not implement OTIO production code, new Webview behavior or new Agent capability in this phase.

## 2. Delete the old Cut path vertically

- [ ] 2.1 Delete NKV/NKC Cut Custom Editor registration, codec, create/open/save/autosave/backup/migration and compatibility aliases from the selected replacement boundary.
- [ ] 2.2 Delete the Webview-owned writable project store/snapshot protocol, save-time snapshot request, parallel timeline DTOs and Extension-owned full-project reconstruction.
- [ ] 2.3 Delete media import/ingest/copy, project-local `media/`/`exports/` assumptions, import-time automatic audio/subtitle creation and Cut calls to audio transcode/derived-media jobs.
- [ ] 2.4 Delete active/recent editor target lookup, implicit `.nkv` target selection, legacy Canvas/Agent aliases and fallback handlers.
- [ ] 2.5 Delete professional/deferred timeline operations and their vertical UI/store/undo/message/handler/adapter/i18n/style paths: extra visual layers, speed, transitions, title/subtitle authoring, effects, color, mask, keyframes, plugin/professional mode and ambiguous controls.
- [ ] 2.6 Delete Minimap components, projection, interactions, state, messages, settings, localization, styles and activation paths.
- [ ] 2.7 Delete legacy tests, snapshots, fixtures and helpers whose only purpose is to make a removed NKV, Webview-owned, import/copy, professional, Minimap or fallback path succeed. Do not rewrite their expectations to preserve compatibility success.
- [ ] 2.8 Preserve only host-neutral/shared primitives and the current selected media adapter capabilities that have an explicit post-cleanup consumer; remove stale exports and dependencies exposed solely for deleted code.

## 3. Prove cleanup is complete before new development

- [ ] 3.1 Run the forbidden-path source, dependency, manifest and generated-artifact guards; every removed path must be absent or explicitly poisoned, not merely unreachable from the UI.
- [ ] 3.2 Run legacy-debt and unused-code checks, plus focused package compilation sufficient to prove the cleanup skeleton has no dangling imports, duplicate DTOs or hidden registration.
- [ ] 3.3 Inspect retained tests and prove none invokes deleted handlers, codecs, fixtures, command aliases or Webview snapshot persistence.
- [ ] 3.4 Confirm old NKC/NKV user files and referenced media bytes were not modified or deleted by cleanup.
- [ ] 3.5 Complete `cleanup-audit.md` with removed paths, retained seams, executed commands, results and residual blockers.
- [ ] 3.6 Record an explicit `passed` cleanup gate. Sections 4–9 MUST NOT begin while any required absence, command, evidence or user-data check is incomplete.

## 4. Implement the OTIO file authority after the cleanup gate

- [ ] 4.1 Define OTIO types and runtime guards for the selected Timeline/Stack/Track/Clip/Gap/ExternalReference/RationalTime/TimeRange versions only.
- [ ] 4.2 Implement parse/serialize with object/path diagnostics, approved metadata validation and source-byte preservation on rejection.
- [ ] 4.3 Implement stable `clipId`, reciprocal linked-audio identity and deterministic identity behavior for create/link/split.
- [ ] 4.4 Implement Host-owned `CutDocumentSession` create/open/save/save-as/backup/revert, dirty state, external-change handling, revision and multi-document isolation.
- [ ] 4.5 Implement link/relink, split, trim, reorder, ripple delete, Gap, audio gain/mute/fade, undo and redo as typed commands.
- [ ] 4.6 Implement revisioned `TimelineView` projection and tests proving Webview state cannot become a writable project fact.

## 5. Implement workspace-relative link-only media references

- [ ] 5.1 Implement `linkMedia(workspaceRelativePath)` and explicit relink without media copy, ingest or transcode.
- [ ] 5.2 Resolve ExternalReference targets from workspace root, allowing project-external workspace files while rejecting absolute/runtime URLs, traversal and symlink escape.
- [ ] 5.3 Implement `cut.defaultProjectRoot` only as the new-document destination without required project-local media/export/derived directories.
- [ ] 5.4 Test copy/move/save-as inside one workspace, cross-workspace missing-media diagnostics and media-byte immutability.

## 6. Reintroduce the retained current separation and media execution

- [ ] 6.1 Reimplement the retained explicit separate/unseparate semantics on OTIO stable Clip/link metadata and one atomic Cut Core command; do not revive the deleted Webview/NKV implementation.
- [ ] 6.2 Reuse the same ExternalReference and current ranges; do not create WAV, transcode, copy media or create derived tasks.
- [ ] 6.3 Preserve current embedded-audio playback before separation and prove reciprocal links prevent duplicate mixing after separation.
- [ ] 6.4 Implement host-neutral probe/frame-capture/video-preview/PCM/export ports without Engine implementation types.
- [ ] 6.5 Compose one selected VS Code adapter over the retained current media runtime; keep implementation actions/tokens/native handles private.
- [ ] 6.6 Test media-unavailable diagnostics, PCM lifecycle, cancellation, staging cleanup, output preservation and document/session isolation.

## 7. Build the new basic VS Code surface

- [ ] 7.1 Register `.otio` as the Cut Custom Editor and drive the Webview from revisioned projections and command intents only.
- [ ] 7.2 Reuse only primitives that passed the cleanup audit; do not restore deleted project stores, messages, adapters or hidden controls.
- [ ] 7.3 Implement the basic timeline, contextual Inspector and controls for link media, split, delete, undo/redo, zoom, fit-all, playback and media export.
- [ ] 7.4 Add new Webview tests for temporary-state loss, revision conflicts, linked separation, supported controls, long-timeline navigation and absence guards.

## 8. Expose offline Cut authoring to Canvas, Agent and TUI

- [ ] 8.1 Implement ordered Canvas workspace-relative media/gap routes targeting new or explicit `.otio` URI/revision.
- [ ] 8.2 Implement Agent Cut capability schemas, approval and diagnostics for create/open/save/save-as, structural import/export, link/relink and basic edit commands.
- [ ] 8.3 Compose the production Cut Core/document binding into TUI without a media adapter.
- [ ] 8.4 Ensure TUI probe, separation evidence, frame capture, PCM, preview and MP4 export fail with `media-runtime-unavailable` rather than simulating success.
- [ ] 8.5 Create/update the indexed `agent-runtime.cut-authoring` suite with positive OTIO artifact and invalid/stale/escaping target cases; do not add Evaluation-only Cut or media tools.

## 9. Final validation and documentation

- [ ] 9.1 Run new OTIO fixtures, command algebra, workspace containment, copy/move/save-as, multi-document and selected media-adapter tests.
- [ ] 9.2 Run the key-free Agent harness and focused real TUI Cut-authoring cases; report media behavior as excluded, not passed.
- [ ] 9.3 Run Extension Development Host scenarios for open/edit/save/reopen, temporary Webview state loss, link, separation, playback/export and multi-document isolation.
- [ ] 9.4 Run affected build/test/check, legacy-debt, unused-code, strict OpenSpec and `git diff --check`.
- [ ] 9.5 Update package/user/architecture docs to the implemented state and attach both the cleanup-gate evidence and final validation evidence.
