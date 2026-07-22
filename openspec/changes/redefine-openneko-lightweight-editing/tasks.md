## 1. Freeze contracts and replacement evidence

- [ ] 1.1 Inventory NKV/NKC Cut codecs, timeline stores, operations, messages, Engine actions, UI panels, Canvas/Agent handoff, tests and dependencies inside the VS Code replacement boundary.
- [ ] 1.2 Add source/dependency/manifest/path guards proving new requests cannot reach NKV/NKC, active/recent target fallback, import-time automatic Audio Clip creation, audio transcode/WAV derivation or deferred professional features.
- [ ] 1.3 Commit OTIO fixtures covering the exact accepted schema/metadata profile and every rejected object, version, field and path.
- [ ] 1.4 Commit media fixtures covering silent MP4, MP4 with one AAC stream, MP4 with multiple audio streams, WAV, mixed source frame rates, corrupt timestamps and video-only/audio-present exports.
- [ ] 1.5 Freeze host-neutral contracts for `MediaDescriptor`, `TimelineView`, role-explicit `CutPreviewPlan`/`CutExportPlan`, VS Code media ports and workspace-relative project roots.
- [ ] 1.6 Record the Agent evaluation authoring decision and observability needed to prove the real Cut capability path.

## 2. Make OTIO the Cut project authority

- [ ] 2.1 Define OTIO types and runtime guards for `Timeline.1`, `Stack.1`, `Track.1`, `Clip.2`, `Gap.1`, `ExternalReference.1`, `RationalTime.1` and `TimeRange.1` only.
- [ ] 2.2 Implement `OtioDocument` parse/serialize with exact schema checks, object/path diagnostics, project-contained relative URI validation and approved metadata validation.
- [ ] 2.3 Implement the Cut v1 validator for one Video Track, zero or more Audio Tracks, sequential clips/gaps, project edit rate and the VS Code media profile.
- [ ] 2.4 Implement import/link, split, trim, reorder, ripple delete, Gap, audio gain/mute/fade, relink, undo and redo as typed `OtioDocument` commands.
- [ ] 2.5 Implement read-only `TimelineView`, `CutPreviewPlan` and `CutExportPlan`; assert adapters never reinterpret the whole OTIO document.
- [ ] 2.6 Implement save, save-as, backup, revert, revision and multi-document tests proving OTIO is the only writable Cut fact.

## 3. Rebuild the Cut Webview as one basic editor

- [ ] 3.1 Audit and reuse the editor shell, material list, toolbar, inspector, theme, i18n, Logger and shared UI primitives where responsibilities remain valid.
- [ ] 3.2 Replace the timeline with one sequential Video Track and zero or more Audio Tracks, visible-range thumbnails/waveforms, playhead, zoom and selection.
- [ ] 3.3 Replace the basic/professional property surface with one contextual Inspector for Video Clip, Audio Clip, Gap and project/empty states, reusing shared field primitives.
- [ ] 3.4 Remove transform, text, speed, transition, color, effect, mask and disabled placeholder Inspector groups together with their state, messages, i18n, styles and tests.
- [ ] 3.5 Reduce playback controls to start, previous project frame, play/pause, next project frame, end, timecode, mute/volume and fullscreen; test project-frame stepping.
- [ ] 3.6 Reduce the timeline toolbar to media import, split, delete, undo/redo, zoom, fit-all and export; remove duplicate/profile-external/ambiguous buttons and hidden restore paths.
- [ ] 3.7 Delete Minimap components, viewport projection, interactions, store state, messages, settings, localization, styles and tests; add absence guards.
- [ ] 3.8 Implement horizontal scroll, zoom, fit-all and playback playhead-follow behavior as the only long-timeline navigation path.
- [ ] 3.9 Delete import-time `detectAndCreateAudio`; show imported video as video-only and expose “Separate Audio” only when probe evidence supports logical separation.
- [ ] 3.10 Implement explicit logical separation UI that creates an Audio Clip referencing the same MP4 and clearly does not claim to create a WAV file.
- [ ] 3.11 Show project edit rate, source fps/frame count and “来自视频” provenance without implying audio/video sync lock.
- [ ] 3.12 Replace active-editor/singleton routing with editor-scoped Cut Core and Engine adapter instances carrying explicit identity.
- [ ] 3.13 Add Webview unit/integration coverage for Inspector contexts, controls, navigation, explicit separation, no automatic audio, Minimap absence and unsupported diagnostics.

## 4. Implement logical audio separation in Cut Core

- [ ] 4.1 Define the logical-separation command with document/revision, source Video Clip identity and deterministic target Audio Track placement.
- [ ] 4.2 Re-probe the source and require one supported embedded audio stream; fail on zero, multiple, unsupported or stale evidence without changing OTIO.
- [ ] 4.3 Create an Audio Clip with the same ExternalReference and initial timeline/source range plus provenance-only `sourceVideoClipId`.
- [ ] 4.4 Ensure undo/redo changes OTIO only and never starts media cleanup, transcode or derived-artifact work.
- [ ] 4.5 Prove later move/trim/delete/undo operations do not propagate between the source Video Clip and Audio Clip.
- [ ] 4.6 Delete or adapt `linkedAudioId`/`linkedVideoId` paths so they cannot reintroduce coupled edits or a second timeline fact.

## 5. Keep VS Code on the current bounded Engine path

- [ ] 5.1 Define `MediaProbePort`, `VideoPreviewPort`, `AudioPcmStreamPort` and `ExportJobPort` without Engine, Node or Webview implementation types.
- [ ] 5.2 Expand the Engine probe bridge to return complete `MediaDescriptor` evidence, including stream counts/codecs, pixel/color fields, rational rate/timestamps, duration and audio properties.
- [ ] 5.3 Implement one editor-scoped `VSCodeMediaAdapter` over existing Engine probe, timeline stream, PCM and export capabilities.
- [ ] 5.4 Compile Engine requests from frozen role-explicit plans: Video Track segments are video-only; Audio Track segments decode audio even when their source is MP4.
- [ ] 5.5 Reuse `neko-pcm-v1`/`AudioStreamClient` for MP4-backed and WAV-backed Audio Clips; prove seek generation, pause/resume, EOF and disposal.
- [ ] 5.6 Remove any Cut call to `audios:transcode`/WAV extraction and poison future audio-derivation requests in this v1 path.
- [ ] 5.7 Replace Extension-owned timeline reconstruction with `CutPreviewPlan`/`CutExportPlan` adapters and assert the selected Engine handler path.
- [ ] 5.8 Run Extension Development Host scenarios for open/edit/save/reopen, no-auto-audio import, logical separation, PCM, mixed-fps seek, export and multi-editor isolation.

## 6. Implement paths and media authorization

- [ ] 6.1 Add workspace-relative `cut.defaultProjectRoot` through the shared settings/path mechanism; reject absolute paths, traversal and unresolved variables.
- [ ] 6.2 Create project-local `media/` and `exports/` conventions without `derived/audio/` or host-specific URLs in OTIO.
- [ ] 6.3 Enforce containment and symlink/realpath checks for imports, relinks, output targets and Engine resource registration.
- [ ] 6.4 Implement editor-scoped media descriptors with source revision, owner identity and deterministic revoke/dispose behavior.

## 7. Define Canvas and Agent interaction explicitly

- [ ] 7.1 Replace the legacy Canvas Cut payload with an ordered route snapshot containing only supported media/gap inputs.
- [ ] 7.2 Require “create new Cut” or a specific writable `.otio`; remove active/recent Cut lookup and implicit `.nkv` targets.
- [ ] 7.3 Apply Canvas handoff through Cut Core commands with explicit target URI/revision while preserving independent Canvas/Cut authority.
- [ ] 7.4 Update Agent Cut capability schemas, approval and diagnostics for explicit `.otio` identity/revision and logical audio separation.
- [ ] 7.5 Delete legacy Agent aliases/target fallbacks and prove missing, stale or non-OTIO targets fail visibly.
- [ ] 7.6 Create/update the indexed `agent-runtime.cut-authoring` suite; if the real host-neutral Cut binding is unavailable to TUI, record that blocker instead of adding an eval-only tool.

## 8. Enforce timing, presentation and export profiles

- [ ] 8.1 Implement one probe-backed validator for MP4/H.264 video, supported embedded AAC logical separation and independently imported WAV PCM.
- [ ] 8.2 Reject unsupported video/color/timestamp/audio evidence with field-level diagnostics; reject logical separation when audio-stream selection would be ambiguous.
- [ ] 8.3 Implement the frozen source-PTS hold-last sampling rule for mixed supported CFR sources without interpolation.
- [ ] 8.4 Apply centered aspect-preserving contain on an opaque black project canvas without crop/transform controls.
- [ ] 8.5 Implement output-fps selection with the same deterministic PTS/drop/repeat mapping.
- [ ] 8.6 Execute typed Engine export for MP4/H.264/AAC-LC/SDR/yuv420p/up-to-1080p from a frozen role-aware `CutExportPlan`.
- [ ] 8.7 Validate video-only output when no Audio Clip exists and audio presence when MP4/WAV-backed Audio Clips are enabled before atomic commit.
- [ ] 8.8 Return conversion-not-available for unsupported inputs; do not add general conversion, proxies, original-media relink or Desktop behavior.

## 9. Remove legacy paths vertically

- [ ] 9.1 Delete NKV/NKC Cut registration, codec, save, autosave, backup and migration paths after OTIO path tests pass.
- [ ] 9.2 Delete speed, extra visual layers, transitions, subtitle/title, effect/color/mask/keyframe/plugin/professional paths from Webview through adapter.
- [ ] 9.3 Delete compatibility aliases, dual DTOs, fallback branches, hidden commands and tests that allow old or implicit paths to return success.
- [ ] 9.4 Preserve old user files byte-for-byte and return explicit unsupported diagnostics without a runtime converter.
- [ ] 9.5 Run legacy-debt, unused-code, dependency-direction, manifest and generated-artifact checks.

## 10. Synchronize documentation and validation

- [ ] 10.1 Update architecture, package boundaries, Engine runtime, Canvas/Cut boundary, Webview security and user docs for the implemented VS Code state.
- [ ] 10.2 Run focused TypeScript/Rust tests, typecheck/build, producer/consumer contract tests, strict OpenSpec and Extension Development Host acceptance.
- [ ] 10.3 Run OTIO/media fixtures for PTS, logical separation, role isolation, PCM, cancellation, shutdown, export and multi-instance behavior.
- [ ] 10.4 Run focused real Agent evaluation when capability/routing lands; keep key-free harness results distinct from real behavior evidence.
- [ ] 10.5 Run root build/test/check/quality/legacy/unused gates, `git diff --check` and a final retained/removed path audit before completion.
