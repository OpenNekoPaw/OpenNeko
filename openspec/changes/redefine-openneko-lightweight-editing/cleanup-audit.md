# Cut OTIO replacement cleanup gate

Status: `passed`

This gate records evidence that the selected legacy Cut implementation and its success tests have been removed before any new OTIO production implementation begins. It is an implementation checkpoint, not a substitute for the final quality gates.

## Rules

- Allowed statuses are `not-started`, `in-progress`, `blocked` and `passed`.
- Status MUST NOT become `passed` while any required absence or validation is incomplete.
- Sections 4–9 of `tasks.md` MUST NOT begin before this gate is `passed`.
- Deprecated Cut Webview feature slices and their dedicated tests MUST be the first deletion slice. The basic package/build, app shell, Host adapter and reusable primitives MAY remain only when their owner and future `TimelineView` consumer are recorded.
- Cleanup may retain shared UI/Host primitives and the selected current media-runtime seam only when an owner and post-cleanup consumer are recorded below.
- Cleanup MUST NOT modify, migrate or delete user NKC/NKV files or referenced media bytes.

## Inventory and disposition

| Path or capability | Owner/callers | Disposition | Evidence |
| --- | --- | --- | --- |
| `packages/neko-cut/packages/webview/src/components/{ColorCorrection,Effects,Mask,SpeedControl,TransitionPicker}/**`, shape/keyframe components, professional Inspector branches and their locale/type helpers | Webview `App`, `PropertyPanel*`, `PreviewPanel`, `Timeline*` | `delete` (`delete-first`) | Direct imports and feature-specific files enumerated with `find .../components -type f` and `rg` before deletion. |
| `packages/neko-cut/packages/webview/src/components/Timeline/TimelineMinimap/**` and `hooks/useMinimapInteraction.ts` | `Timeline.tsx`; Webview-only | `delete` (`delete-first`) | Minimap owns a second navigation projection/state path and is excluded by the target surface. |
| `packages/neko-cut/packages/webview/src/{App.tsx,root.tsx,main.tsx,index.css}`, package/build files, `host-adapter/**`, ErrorBoundary/Toast, basic Preview/Timeline/Inspector primitives | Cut Webview package; future revisioned `TimelineView` surface | `retain-basic-webview` | Package/build remains a required VS Code Webview target. Files may remain only after professional branches and writable project ownership are removed. |
| `packages/neko-cut/package.json` `.nkv` custom editor, `extension/src/editor/video/**`, `project/JviProjectLoader.ts`, `services/{ProjectSessionService,CutProjectQualityFacade,TimelineToolExecutor,timelineToolBridge,CutProjectAuthoringService}.ts` | Extension activation, commands, Agent/API authoring, legacy Custom Editor | `delete` | All are rooted in NKV/`ProjectData`; no migration or compatibility path is allowed. |
| `webview/src/stores/**`, `webview/src/types.ts`, old `ProjectData` operation DTOs, `hooks/useVSCodeMessaging.ts` project snapshot branches | Current Webview components and `videoEditorProvider` | `replace-after-cleanup` | The entire writable timeline/store authority must disappear; retained UI will later consume revisioned read-only projection and send command intents. |
| `extension/src/editor/video/{messageHandler,videoEditorModel,videoProjectDocument,cutProjectFilePersistence}.ts` and `requestCutProjectSnapshot` in `videoEditorProvider.ts` | Legacy Custom Editor save/backup/autosave | `delete` | These reconstruct or persist a full Webview/NKV project snapshot. |
| `extension/src/editor/video/cutProjectSourceIngest.ts`, authoring ingest callers and subtitle/storyboard import helpers | Legacy authoring/import | `delete` | This path couples copy with NKV reconstruction and secondary-element creation. The replacement uses one narrow Host prepare step only for workspace-external input, followed by the canonical OTIO link command. |
| `webview/src/stores/slices/elementOpsSlice.ts` separation and `extension/src/services/tools/trackAudioHandler.ts` `SeparateAudio` | Webview and timeline tools | `replace-after-cleanup` | Preserve only the documented same-source/manual-mute semantics; the current `ProjectData` implementations are not retained. |
| `extension/src/services/EngineConnection.ts` | Current VS Code extension; future document-scoped media adapter | `retain-current-media-adapter` | Existing narrow `EngineClient` acquisition seam; adapter must remove cross-document mutable singleton assumptions when recomposed. |
| `extension/src/services/CutMediaRepresentationGenerator.ts` | Current media service; future probe/frame/preview adapter candidate | `retain-current-media-adapter` | Already validates canonical workspace-file sources and keeps runtime representations out of project persistence. |
| `extension/src/services/ExportPresetService.ts` | Export UI/Extension; future basic export surface | `retain-shared-primitive` | Stores user export preferences only and does not own timeline/project facts. |
| `extension/src/services/{MediaService,ExportService}.ts` | Legacy `videoEditorProvider` | `replace-after-cleanup` | Engine dispatch/lifecycle may be extracted after the gate, but current classes consume `ProjectData`, reconstruct engine timelines and include removed professional operations. |
| `extension/src/services/{cutProjectAuthoringTarget,CutProjectAuthoringService,cutStoryboardAuthoring,cutTimelineAuthoring}.ts`, active-editor resolution in `extension.ts`/commands and Canvas draft aliases | Extension API, Canvas, Agent/commands | `delete` | Current routes are `.nkv`/legacy DTO based; new Canvas support will require explicit `.otio` URI/revision after the gate. |
| Extension tools/commands for effect, transition, mask, keyframe, shape, color, rich subtitle editing/generation, speed, AI and professional authoring; matching package manifest/NLS entries | Extension activation, command palette, Agent capability | `delete` | Deferred feature surface must not remain registered or callable. Basic Subtitle Track and external subtitle Clip entry are replacement capabilities, not retained legacy authoring. |
| Webview and Extension tests beside every deleted path, including shape/keyframe/speed/storyboard/import/NKV/provider/save/authoring/tool tests | Vitest suites | `delete` | Tests may not keep removed handlers, DTOs, aliases or fixtures alive. Basic UI/media primitive tests are retained and updated. |
| `packages/neko-cut/packages/webview/package.json`, root Cut Webview build dependency, `turbo.json` Webview dependency and `scripts/compile-ts-vsix.mjs` Webview build | Monorepo/VSIX build | `retain-basic-webview` | They build the retained basic Webview; they are not legacy reachability by themselves. |

## Required absence evidence

- [x] Every deprecated Cut Webview feature slice and its dedicated test/snapshot/fixture was deleted before replacement production development began, while retained basic files are individually justified below.
- [x] No writable NKV/NKC Cut editor, codec, save, backup or migration registration remains in the replacement boundary.
- [x] No Webview-to-Host full project snapshot can be used as a successful save path.
- [x] No Extension DTO reconstructs the removed full project model for new Cut requests.
- [x] No legacy ingest, automatic audio/subtitle creation or derived-audio request remains in the new Cut entry path; workspace-external input uses the isolated Host copy boundary defined by the current spec.
- [x] No active/recent editor fallback or implicit `.nkv` target can return success.
- [x] No removed professional operation or Minimap path remains registered, callable or hidden behind a setting.
- [x] No retained test obtains success through a removed handler, codec, alias, fixture or fallback.
- [x] No stale package export, dependency, manifest entry or generated artifact keeps a deleted path reachable.

## Retained seams

Record the exact shared primitives and current media-runtime seams retained for later composition. Each item requires an owner, callers, lifecycle, error contract and reason it is not part of the deleted project model.

| Seam | Owner | Post-cleanup consumer | Reason retained | Evidence |
| --- | --- | --- | --- | --- |
| `EngineConnection` | VS Code Cut Extension | Future document-scoped VS Code media adapter | Acquires the existing local Engine client without persisting engine identity in Cut data. Initialization failure is diagnostic/fail-visible; no hidden alternate runtime. | `services/EngineConnection.ts`; current caller inventory in `videoEditorProvider.ts`. |
| `CutMediaRepresentationGenerator` | VS Code Cut Extension | Future media probe/frame/preview adapter | Converts only canonical workspace files to runtime representations and rejects workspace escape. | `services/CutMediaRepresentationGenerator.ts` plus focused tests. |
| `ExportPresetService` | VS Code Cut Extension | Future basic export UI | Owns user preference presets, not document/timeline state. | `services/ExportPresetService.ts` plus focused tests. |
| Webview package/root/app/Host adapter | Cut Webview | Future `TimelineView` renderer | Preserves the existing VS Code Webview build and application composition point; durable state and deprecated feature branches are explicitly excluded. | `packages/webview/package.json`, `root.tsx`, `App.tsx`, `host-adapter/**`. |
| ErrorBoundary, Toast, basic input/resize/workbench primitives | Cut Webview / `@neko/ui` | Future basic Preview/Timeline/Inspector | UI-only lifecycle; errors remain visible and no project bytes are owned. | Existing primitive tests and dependency audit. |

## Static guard definitions

Run these guards from the repository root. A forbidden-path guard passes only with no output; retained media candidate files are checked separately for forbidden legacy types before reuse.

```bash
# Removed NKV/NKC registration, persistence and implicit-target vocabulary.
rg -n "\\.nkv|loadNkv|saveNkv|neko\\.videoEditor|requestCutProjectSnapshot|ProjectSessionService|JviProjectLoader|kind: 'active'|recent.*Cut" \
  packages/neko-cut/package.json packages/neko-cut/packages/extension/src packages/neko-cut/packages/webview/src \
  --glob '!**/*.test.*' --glob '!**/__tests__/**'

# Removed project-copy/import and derived-audio paths.
rg -n "CutProjectSourceIngest|addCutProjectSource|PROJECT_MEDIA_DIR|project:source:add|subtitle:import|storyboard:import|extract.*wav|audio.*transcode" \
  packages/neko-cut/packages/extension/src packages/neko-cut/packages/webview/src

# Removed professional/deferred and Minimap production paths.
rg -n "TimelineMinimap|useMinimapInteraction|rightDockMode|professional|ColorCorrection|EffectsPanel|MaskPanel|SpeedControl|TransitionPicker|KeyframeIndicator|ShapeRenderer|AIActionsButton" \
  packages/neko-cut/packages/extension/src packages/neko-cut/packages/webview/src packages/neko-cut/package.json

# Retained media candidates must not expose the removed project model when recomposed.
rg -n "ProjectData|TimelineTool|Nkv|NKV|\\.nkv" \
  packages/neko-cut/packages/extension/src/services/EngineConnection.ts \
  packages/neko-cut/packages/extension/src/services/CutMediaRepresentationGenerator.ts \
  packages/neko-cut/packages/extension/src/services/ExportPresetService.ts

# Deleted files must not remain reachable through manifests, exports or imports.
rg -n "videoEditorProvider|timelineToolBridge|CutProjectAuthoringService|TimelineMinimap|ColorCorrection|EffectsPanel|MaskPanel|SpeedControl|TransitionPicker" \
  packages/neko-cut/package.json packages/neko-cut/packages/extension/package.json \
  packages/neko-cut/packages/extension/src packages/neko-cut/packages/webview/src
```

## Validation commands and results

| Command | Result | Coverage |
| --- | --- | --- |
| `pnpm --filter @neko/webview build` | passed after delete-first Webview slice | retained Webview shell compilation; no dangling imports from deleted feature slices |
| `pnpm --filter @neko/webview test` | passed after full legacy-store deletion: 5 files, 111 tests | intermediate cleanup checkpoint; the later OTIO surface replaces these retained component tests |
| `pnpm --dir packages/neko-cut compile:extension` | passed after legacy Extension deletion | cleanup-only Extension entry and retained service seams bundle |
| `pnpm --dir packages/neko-cut test --run` | passed: 2 files, 14 tests | retained base service collection and media representation seams |
| Static production guards in this document plus Canvas/Agent Cut-bridge guards | passed, no matches | forbidden source/dependency/manifest paths; negative assertions in tests are excluded |
| `pnpm check:legacy-debt` | passed, zero blocking findings | obsolete-code debt gate |
| `pnpm check:unused` | passed | unused code and dangling exports |
| `pnpm check` | passed, no dependency violations across 1,345 modules | unused exports and package dependency direction |
| `pnpm --dir packages/neko-cut compile` | passed | retained Cut Extension and Webview package/build skeleton |
| `pnpm --dir packages/neko-canvas compile` | passed | Canvas after removing the old Cut send UI/Host route |
| `pnpm --filter @neko-agent/webview build` | passed | Agent UI after removing the old Timeline transfer target |
| `pnpm --dir packages/neko-canvas test --run` | passed: 22 files, 287 tests | Canvas retained behavior and absence of removed handoff success routes |
| Agent plugin-transfer focused tests | passed: 5 files, 43 tests | old Cut commands are neither planned nor displayed; Canvas/Explorer transfers remain |
| `openspec validate redefine-openneko-lightweight-editing --strict` | passed | proposal/design/spec/tasks consistency |
| `git diff --check` | passed | patch integrity |

## User-data check

- [x] Cleanup does not open user NKC/NKV files through a writer.
- [x] Cleanup does not rename, migrate or delete user project files.
- [x] Cleanup does not copy, modify or delete referenced media bytes.

## Gate decision

- Decision: `passed`
- Reviewed by: Codex
- Date: 2026-07-22
- Blockers/residual risk: No cleanup blocker. The retained Cut Webview now consumes the OTIO `TimelineView`; no old editor path can return success.

## Final selective-cleanup follow-up

After the OTIO surface was connected, the retained boundary was narrowed again. That pass incorrectly treated whole components as obsolete when only their NKV/Zustand or advanced branches were obsolete. The corrected boundary retains/adapts `PreviewControls`, the basic `TimelineControls` actions, pointer/keyboard/context-menu interaction, shared property inputs, bounded constant-speed controls and the export configuration/progress/background-task UX. Advanced preview settings, screenshot, picture-in-picture, professional property branches and Webview project ownership remain removed.

Final focused evidence: `@neko/webview` has 1 test file / 6 tests, `neko-cut` has 6 files / 47 tests, the Cut Webview production stylesheet dropped from 1,702 to 338 lines, and the forbidden advanced-control source guard has no production matches.

## 2026-07-23 retained-surface correction

The basic Webview boundary explicitly retains preview, transport, timeline, audio/video/subtitle Track entry and Clip drag/move. The replacement remains bounded to one Video Track, at most three Audio Tracks and at most one Subtitle Track. This correction does not restore the deleted writable Webview project store, media-copy ingest, storyboard import, rich subtitle authoring, professional property surfaces or Minimap. New interactions must consume revisioned `TimelineView` projections and submit stable `trackId`-targeted command intents.

## 2026-07-23 resizable and interaction correction

The prior selective cleanup removed more than the intended professional slices: it replaced the retained shared Workbench Right Dock, Preview/Timeline resize and mature Clip pointer lifecycle with fixed CSS rows, an inline Preview grid column and minimum HTML drag. Those layout and interaction responsibilities are now classified as `retain-shared-primitive` / `retain-basic-webview`, not legacy project ownership.

The corrected path reuses `CreativeWorkbenchShell.rightDock`, `ResizeHandle`, `useResizable`, `usePersistedResize` and shared property composition. Layout state remains VS Code Webview state only. Clip dragging owns pointer capture/cancellation, compatible Track/insertion feedback and edge auto-scroll in a Cut-local hook, then submits one existing revisioned `move-item`; it does not restore `ProjectData`, Zustand mutation, legacy ingest, professional Inspector groups or Minimap.

The complete corrected capability matrix is recorded in `legacy-webview-capability-audit.md`. Export presentation is `retain-basic-webview`; old `ExportService` is `replace-after-cleanup`, preserving enqueue/progress/cancel/staging concepts while replacing `ProjectData`, guessed current job and Webview-coupled lifecycle with explicit OTIO document/session/job identity.
