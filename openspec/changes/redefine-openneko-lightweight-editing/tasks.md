## 1. Freeze contracts and replacement evidence

- [ ] 1.1 Inventory NKV/NKC Cut codecs, timeline stores, operations, messages, Engine actions, UI panels, tests and package dependencies that are inside the replacement boundary.
- [ ] 1.2 Define source/dependency/manifest absence guards for professional mode, extra visual tracks, transitions, subtitle/title authoring, effects, color, masks, keyframes, plugins and legacy project success paths.
- [ ] 1.3 Commit synthetic OTIO and media fixtures covering the accepted subset, every rejected object, direct media profile, conversion-required formats, corrupt input, seek, PCM and export.
- [ ] 1.4 Define shared cross-host acceptance results for OTIO bytes/semantics, duration, seek target, PCM timestamps, A/V drift and output validation.

## 2. Make OTIO the Cut project authority

- [ ] 2.1 Define TypeScript OTIO schema types and runtime guards for Timeline, top-level Stack, one Video Track, Audio Tracks, Clip, Gap, ExternalReference, RationalTime, TimeRange and bounded positive LinearTimeWarp.
- [ ] 2.2 Implement `OtioDocument` parse/serialize with schema-version and object/path diagnostics, project-relative URI validation, unknown metadata preservation and no transient runtime paths.
- [ ] 2.3 Implement the Cut v1 validator for one video track, audio tracks, allowed operations, minimal namespaced audio metadata and capability limits.
- [ ] 2.4 Implement command-owned split, trim, reorder, ripple delete, gap, gain/mute/fade, fixed speed, undo and redo against `OtioDocument`.
- [ ] 2.5 Implement a read-only `TimelineView` projection for rendering, hit testing and selection without a second serialized project model.
- [ ] 2.6 Add save, save-as, backup, revert, revision and multi-document tests proving OTIO is the only writable fact.

## 3. Rebuild the Cut Webview as one lightweight editor

- [ ] 3.1 Audit and reuse the existing editor shell, material list, toolbar, inspector, theme, i18n, Logger and shared UI primitives where their responsibility remains valid.
- [ ] 3.2 Replace the timeline area with one sequential Video Track and multiple Audio Tracks, visible-range thumbnail/waveform loading, playhead, zoom and selection.
- [ ] 3.3 Remove the basic/professional selector and all profile-external UI, stores, operations, undo entries, messages, handlers, i18n, CSS and tests.
- [ ] 3.4 Replace active-editor or singleton routing with editor-scoped Cut Core and media port instances carrying explicit identity.
- [ ] 3.5 Add Webview unit/integration coverage for every retained operation and explicit unsupported UI for rejected OTIO/media.

## 4. Keep VS Code on one frozen Engine adapter

- [ ] 4.1 Define `MediaProbePort`, `VideoPreviewPort`, `AudioPcmStreamPort`, `ExportJobPort` and `AuthorizedMediaSourcePort` without Engine, Node or Webview implementation types.
- [ ] 4.2 Implement `VSCodeMediaAdapter` over existing Neko Engine probe, preview, PCM and export capabilities for only the Cut v1 profile.
- [ ] 4.3 Derive Engine playback/export input from a frozen OTIO runtime projection without giving Engine project persistence or edit authority.
- [ ] 4.4 Reuse the `neko-pcm-v1`/`AudioStreamClient` contract with editor-scoped descriptors and prove stale seek generation, pause/resume, EOF and dispose behavior.
- [ ] 4.5 Poison NKV/NKC open/save, legacy timeline handlers and profile-external Engine operations for new Cut requests.
- [ ] 4.6 Run real Extension Development Host scenarios for open/edit/save/reopen, playback, PCM, seek, error diagnostics, export and multi-editor isolation.

## 5. Extract a shared bounded Host resource transport

- [ ] 5.1 Audit Preview PDF/CBZ/EPUB transport and extract only loopback lifecycle, token registration, headers, stream cancellation, revocation and disposal into an appropriate public Host/Node entry.
- [ ] 5.2 Keep EPUB entry reads, document MIME profiles and viewer behavior in Preview/Content; prohibit Cut/Desktop from importing Preview internals.
- [ ] 5.3 Add a media profile accepting exactly one closed Range with configurable 1–4 MiB cap and rejecting open-ended, suffix, multiple, stale, unauthorized and out-of-file requests.
- [ ] 5.4 Add ETag/source-revision, HEAD/OPTIONS, CORS/PNA, connection abort, backpressure, concurrency and shutdown tests.
- [ ] 5.5 Add path tests proving only the requested file interval is read and no bulk bytes use IPC/postMessage.

## 6. Build the Desktop video runtime

- [ ] 6.1 Add the Desktop composition root and an editor-scoped `DesktopMediaAdapter` without importing Neko Engine.
- [ ] 6.2 Run a focused Mediabunny versus MP4Box spike using the committed MP4 fixtures and record seek accuracy, timestamp behavior, memory, cancellation and bundle impact.
- [ ] 6.3 Select one demux path and implement bounded source → demux → WebCodecs decode → Canvas/WebGPU presentation.
- [ ] 6.4 Implement play, pause, seek, scrub, EOF, generation discard, resource budget and complete disposal without `<video src>` fallback.
- [ ] 6.5 Add packaged Electron runtime tests for visual output, frame timing, memory, repeated seek, multi-document isolation and unsupported codec diagnostics.

## 7. Replace Desktop audio with Host FFmpeg PCM

- [ ] 7.1 Define a managed FFprobe/FFmpeg process owner with explicit input authorization, stream selection, session identity, cancellation, stderr diagnostics and process-tree shutdown.
- [ ] 7.2 Decode audio and video-contained audio to interleaved f32le, 48 kHz, stereo PCM and frame it with PTS, duration, sample rate and channel count.
- [ ] 7.3 Deliver PCM over a binary local channel with bounded prebuffer, credit/backpressure, seek generation and no full-file PCM cache.
- [ ] 7.4 Reuse or refactor `AudioStreamClient` around one shared AudioContext, per-track GainNodes, fades, mixing and a stable master clock.
- [ ] 7.5 Add sample/golden tests for mono/stereo, embedded/multiple audio streams, gap, overlap, gain/fade, seek, drift, EOF, cancellation and decode failure.

## 8. Enforce import and export profiles

- [ ] 8.1 Implement one probe-backed Cut v1 validator for MP4/H.264/AAC and WAV PCM limits; extension-only checks are forbidden.
- [ ] 8.2 Reject VFR, HDR, 10-bit, non-4:2:0, interlaced, extra video streams, surround/object audio, DRM, corrupt timestamps and unknown duration with actionable diagnostics.
- [ ] 8.3 Implement Desktop conversion import to project-local conforming MP4/WAV with progress, cancellation, validation, atomic commit and OTIO reference update.
- [ ] 8.4 Implement typed Desktop FFmpeg export for MP4/H.264/AAC-LC/SDR/yuv420p/1080p from a frozen OTIO revision.
- [ ] 8.5 Validate output codec, duration, size and audio before atomic commit; failure or cancellation must clean staging and preserve existing output.
- [ ] 8.6 Keep VS Code format behavior restricted to the same profile and return conversion-required until it consumes the shared conversion job contract.

## 9. Remove old paths and dependencies vertically

- [ ] 9.1 Delete NKV/NKC Cut registration, codec, save, autosave, backup and migration paths after OTIO path-level tests pass.
- [ ] 9.2 Delete extra visual-layer, transition, title/subtitle authoring, effect/color/mask/keyframe/plugin/professional-mode paths from Webview through Engine adapter.
- [ ] 9.3 Delete compatibility aliases, dual DTOs, fallback branches, hidden commands and tests that allow old paths to return success.
- [ ] 9.4 Preserve old user files byte-for-byte and add explicit unsupported diagnostics without a runtime converter.
- [ ] 9.5 Run legacy-debt, unused-code, dependency-direction, manifest and generated-artifact checks proving removed surfaces cannot be rediscovered.

## 10. Synchronize documentation, packaging and validation

- [ ] 10.1 Update architecture, package boundaries, Proto/wire, Engine runtime, Webview security and user docs for the final implemented state.
- [ ] 10.2 Pin FFmpeg/FFprobe versions, platform builds, checksums, configuration and license manifest; allow system paths only as explicit development overrides.
- [ ] 10.3 Run focused TypeScript tests/typecheck/build, producer/consumer contract tests, VS Code Development Host, packaged Electron and strict OpenSpec validation.
- [ ] 10.4 Run shared OTIO/media fixture parity, Range/PCM/A/V sync, cancellation, shutdown, export and multi-instance acceptance.
- [ ] 10.5 If Agent Cut capabilities or routing change, update the indexed evaluation suite and run the required focused real Agent cases; do not claim Agent validation from schema-only tests.
- [ ] 10.6 Run root build/test/check/quality/legacy/unused gates, `git diff --check`, packaging validation and a final retained/removed path audit before completion.
