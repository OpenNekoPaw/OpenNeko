## Context

当前代码事实仍以 NKV、Cut Webview 和 Rust Engine 为主。本设计定义目标替换路径，而不是声明迁移已完成。新实现必须先建立 OTIO canonical path，再 poison 并删除旧路径；不得用双读、双写或 fallback 维持多种事实来源。

相关稳定决策见 [`ADR: Cut OTIO 工程、VS Code 精简与 Desktop 媒体迁移边界`](../../../docs/architecture/adr-cut-otio-vscode-desktop-media-runtime-boundary.md)。

## Goals / Non-Goals

**Goals:**

- 用 OTIO 取代 Cut 自定义项目格式，并限制为可验证的轻量 subset。
- 让 VS Code 与 Desktop 共用 Cut Core、编辑命令、React UI 和媒体 profile。
- VS Code 先保留 Engine adapter，Desktop 建立无 Engine 的 WebCodecs/Host FFmpeg 路径。
- 让大文件、PCM 和导出都通过明确、有背压、可取消的 Host 数据边界。
- 通过格式白名单和相同 fixture 控制两个媒体 backend 的差异。
- 完整删除被移除能力及 legacy success path。

**Non-Goals:**

- 构建专业 NLE、多视觉层、合成、动画、调色、字幕 authoring 或插件生态。
- 让 Desktop 复用 Rust Engine，或立即删除 VS Code 当前可工作的 Engine。
- 支持任意 FFmpeg/WebCodecs 可识别格式。
- 建设 NKC/NKV 在线迁移、proxy/original relink 或高质量原片回套。
- 通过 OTIO metadata 重新发明一套隐藏 timeline schema。
- 在本变更中保留或重定义生成式媒体/AI processor handoff；该能力如需继续必须由独立 OpenSpec 拥有。

## Five-layer analysis

| Layer | Decision |
| --- | --- |
| Responsibility | Cut Core owns OTIO and edit semantics; host adapters own authorized IO, preview and export execution. |
| Dependency | Webview depends on browser-safe Cut contracts; Node/VS Code/Electron/Engine remain behind host adapters. |
| Interface | Probe, video preview, PCM, export and authorized source are separate small ports with explicit identities. |
| Extension | A new host implements the same ports and profile; it cannot add another project codec or UI model. |
| Testing | Shared OTIO/media fixtures prove semantic parity, while each host has its own real-runtime acceptance. |

## Decisions

### 1. OTIO document is the only timeline authority

```text
project.otio
  -> OtioDocument
  -> edit command
  -> derived TimelineView
  -> React presentation state
```

`OtioDocument` is the only mutable timeline state. `TimelineView` is rebuilt or incrementally projected for rendering and hit testing, but is never serialized. Selection, playhead, zoom, panel layout and decode cache are recoverable presentation state.

The parser accepts only Timeline, top-level Stack, one Video Track, zero or more Audio Tracks, Clip, Gap, ExternalReference, RationalTime, TimeRange and bounded positive LinearTimeWarp. It rejects unknown schema versions, nested stacks, transitions, extra video tracks and unknown required effects before mutation.

ExternalReference uses a URI relative to the `.otio` file. Host paths, tokens, localhost URLs, Webview URIs and blob URLs never enter the project.

### 2. Namespaced metadata is minimal and non-structural

Allowed metadata is limited to:

```text
timeline.metadata.openneko.cut.profile
audio metadata.openneko.audio.sourceStreamIndex
audio metadata.openneko.audio.gainDb
audio metadata.openneko.audio.fadeInSeconds
audio metadata.openneko.audio.fadeOutSeconds
```

Metadata cannot duplicate children, track order, source range or media reference. Unknown required `openneko` capability fails closed. Other application metadata is preserved when safe but does not silently enable unsupported behavior.

### 3. Legacy projects are rejected without mutation

The new Cut editor does not register NKC/NKV as writable Cut formats, does not auto-convert on open, and does not write two formats. An old file is left byte-for-byte unchanged and receives an actionable unsupported diagnostic. A future converter, if justified by real user data, is a separate offline command with its own OpenSpec.

### 4. Shared Cut Core is independent from media runtime

The common code owns OTIO codec/validation, commands, undo/redo, view projection, profile validation and typed requests. It depends on small ports equivalent to:

- `MediaProbePort`;
- `VideoPreviewPort`;
- `AudioPcmStreamPort`;
- `ExportJobPort`;
- `AuthorizedMediaSourcePort`.

Every request and event carries explicit document/session/job identity. Active editor or active window is never an owner. The ports do not expose Engine actions, FFmpeg argv or local absolute paths.

### 5. VS Code selects one frozen Engine adapter

VS Code keeps the existing Neko Engine for probe, preview, PCM and export during the transition. A `VSCodeMediaAdapter` maps the restricted OTIO runtime projection to the existing media operations. Engine does not parse or persist OTIO and does not expose profile-external features to the UI.

There is no Node/WebCodecs fallback if Engine initialization or playback fails. The failure is visible. Engine feature work is frozen except for fixes required to keep the restricted profile safe and functional.

The existing `neko-pcm-v1` binary frame and `AudioStreamClient` can remain, provided their descriptor no longer implies Engine ownership and sessions remain editor-scoped.

### 6. Desktop selects one WebCodecs/Host FFmpeg adapter

Desktop video path:

```text
authorized source
  -> bounded range source
  -> one selected MP4 demuxer
  -> WebCodecs VideoDecoder
  -> Canvas/WebGPU
```

Desktop audio path:

```text
authorized source
  -> ffprobe stream selection
  -> managed FFmpeg child process
  -> interleaved f32le / 48 kHz / stereo frames with PTS
  -> binary WebSocket with backpressure
  -> shared AudioContext / WebAudio mixer
```

Desktop export freezes an OTIO revision and compiles a typed export plan. The Host owns FFmpeg argv construction, process lifecycle, progress, cancellation, temporary output, validation and atomic commit. Public callers never submit shell or arbitrary filter graphs.

### 7. Media bytes use a data plane, not IPC

Host bridge/IPC carries only authorization, descriptors, commands, progress and diagnostics. Bounded file bytes use localhost HTTP Range, Electron custom protocol or an equivalent source abstraction. PCM uses a binary channel with backpressure. Base64 and bulk postMessage are forbidden.

The shared Node resource kernel owns loopback binding, opaque token, registration, HEAD/OPTIONS, response headers, stream cancellation, revocation and disposal. Preview owns document route profiles; Cut/Desktop owns bounded media profiles. Feature packages do not import each other's internal server implementation.

Media Range accepts one closed `bytes=start-end` request, defaults to a 1–4 MiB maximum, and rejects open-ended, suffix, multiple, invalid, stale and unauthorized requests. An HTML media element URL is not a Cut preview source.

### 8. One product profile gates both backends

Directly editable media is limited to MP4 with H.264/AVC 8-bit yuv420p SDR progressive CFR up to 1080p, AAC-LC 44.1/48 kHz mono/stereo, and standalone WAV PCM 44.1/48 kHz mono/stereo. Host decoding normalizes frontend PCM to f32le 48 kHz stereo.

VFR, HDR, 10-bit, 4:2:2/4:4:4, interlaced, multiple video streams, surround/object audio, DRM, corrupt timestamps and unknown duration are rejected. Validation uses ffprobe-equivalent metadata, not the filename extension.

Desktop may explicitly convert other accepted inputs into project-local conforming MP4/WAV. The converted file becomes the OTIO media reference and export source. VS Code shows an actionable conversion-required diagnostic until it consumes the same job contract; it does not implement a parallel converter.

### 9. Export has one initial profile

The initial media output is MP4/H.264/AAC-LC/SDR/yuv420p up to 1080p. OTIO is the only project save format. FCPXML and SRT/VTT, if retained, are separate interchange adapters and must report unsupported or lossy fields.

Export input is a frozen document URI, revision, OTIO snapshot, authorized source set and typed output profile. Success requires output codec, duration, size and audio validation followed by atomic commit.

### 10. Replacement is vertical and fail-visible

The implementation order is contract first, new canonical path second, legacy poison and removal third. New tests assert that OTIO commands, the selected host adapter and the new UI projection were called, and poison legacy codecs/handlers so they cannot contribute to a passing result.

Host selection happens once at the composition root. No runtime fallback chooses another host adapter. VS Code and Desktop may have different execution implementations but never different project models, commands, UI stores or supported format matrices.

## Risks / Trade-offs

- **Two temporary media adapters:** shared contract fixtures and a strict format intersection limit divergence; adapter-specific behavior remains separately tested.
- **OTIO audio metadata is application-specific:** keep it minimal, preserve it for interchange and emit loss diagnostics where another adapter cannot execute it.
- **No legacy migration:** preserve bytes and reject clearly; do not add compatibility logic without evidence of valuable user data.
- **PCM bandwidth and scheduling:** use bounded buffers, generation-tagged seek, backpressure and cancellation; never cache a full decoded timeline.
- **Desktop conversion costs time and disk:** show explicit job progress and make the converted artifact the project source for the first profile.
- **VS Code Remote locality:** local Extension Development Host evidence does not cover SSH/WSL/Codespaces; those targets remain unsupported until separately verified.
- **FFmpeg distribution:** pin version, configuration, platform checksum and license manifest before release.

## Migration Plan

1. Freeze OTIO subset, media profile, port contracts, legacy diagnostics and cross-host fixtures.
2. Implement host-neutral OTIO codec, validator, command model and TimelineView.
3. Replace the Cut timeline UI and project save/open path while retaining reusable editor shell components.
4. Add VS Code Engine adapter and prove the old NKV/NKC path is not involved.
5. Poison and delete removed Cut capabilities and legacy success paths vertically.
6. Extract the shared Node resource transport kernel from Preview without moving document semantics.
7. Build Desktop composition root, bounded MP4 source, selected demuxer and WebCodecs renderer.
8. Replace Desktop audio production with managed FFmpeg PCM and reuse/refactor the existing frontend PCM contract.
9. Add Desktop conversion import and bundled FFmpeg export with atomic output.
10. Run shared contract, VS Code Development Host, packaged Electron and platform distribution validation.

## Open Questions

- Mediabunny versus MP4Box as the one Desktop MP4 demuxer must be frozen by a focused spike.
- The final Range window, request concurrency and cache budget require measurement on the 1080P fixture and representative long files.
- Existing AudioBuffer scheduling versus AudioWorklet ring buffer requires multi-track drift and CPU profiling.
- Final removal of Neko Engine from VS Code is a separate decision after Desktop acceptance evidence exists.
