## Context

The canonical media route is Extension Host `NodeMediaRuntime` or a narrow
domain adapter, tokenized loopback HTTP, muted browser video, and OpenNeko-owned
PCM audio. Real files show that H.264/AAC/MP3 and 5.1-to-stereo PCM work. AV1
Main10 PQ can advance Electron's native clock while its composed frame remains
frozen, and Apple M2 VideoToolbox rejects the same source decoder. One
H.264/AAC file has a valid prefix but overstated container duration.

Five-layer analysis:

- **Responsibility:** `@neko/media` owns process qualification, bounded transport,
  PCM scheduling primitives, and failure classification. Cut owns timeline
  selection, clip envelopes, mix policy, and export graphs. The OpenNeko
  composition root owns packaged executable selection.
- **Dependency:** Webviews depend only on browser media contracts and opaque
  loopback URLs. Extension adapters depend on Node/FFmpeg ports. Feature
  packages do not discover or fall back to Neko Engine.
- **Interface:** PCM connection becomes `prepare -> shared startAt -> consume`
  while the existing `connect` convenience remains the single-track canonical
  composition. Waveform results keep their current contract while their
  implementation consumes the FFmpeg `Readable` incrementally. Cut preview
  messages carry the envelope facts needed for live playback. Runtime
  qualification reports exact required capabilities.
- **Extension:** New codecs continue through probe plus declared proxy profiles;
  new mix policy belongs in the Cut mix bus/export builder, not in generic PCM
  transport. Packaged targets add one verified runtime descriptor, not another
  discovery branch.
- **Testing:** Fast unit tests make buffer lead, shared start, positive gain,
  limiter/fade graphs, and interval classification red-capable. The real-media
  matrix and VS Code Webview provide integration and user-path evidence.

## Goals / Non-Goals

**Goals:**

- Keep scheduled PCM lead bounded to a small constant independent of source
  duration.
- Keep waveform working memory bounded by one aggregation window independent of
  source duration, excluding the intentionally returned peak array.
- Start every Cut PCM input at one `AudioContext` time after all first packets
  are ready.
- Preserve positive gain and live fades while preventing uncontrolled output
  peaks in preview and export.
- Make every non-native preview depend on one verified, all-hardware video
  processing closure with no CPU fallback.
- Preserve valid-prefix evidence for partially damaged sources.

**Non-Goals:**

- Restore Neko Engine, WebCodecs, or browser-native audio as a fallback.
- Add WebM as a preferred playback profile; WebM files are diagnostic coverage
  only and continue through the declared proxy policy.
- Implement professional loudness mastering, LUFS target normalization, DTS-HD
  passthrough, subtitle rendering, or new OTIO effects.
- Modify, repair, or commit user-provided media.

## Decisions

### PCM uses a bounded prepare/start scheduler

`PcmAudioClient.prepare()` obtains the response, creates audio nodes, and waits
for the first complete packet without starting playback. `startAt()` schedules
that packet at a caller-provided `AudioContext` time and releases consumption.
`connect()` composes both operations for single-source consumers. After start,
the reader stops pulling while scheduled lead is above the high-water mark and
resumes below the low-water mark. Disposal aborts fetch and stops/disconnects
every scheduled source.

Cut prepares all clients concurrently, computes one future context start only
after every first packet is ready, and starts all clients with that exact value.
The first audible client remains the timeline master, while every other client
is checked against it for a bounded inter-track offset.

Alternatives rejected:

- Letting each client use `currentTime + 100ms` preserves arrival jitter as
  track offset.
- Scheduling the entire HTTP body is simple but memory and node count scale
  with duration.
- Suspending the shared `AudioContext` as a buffer control deadlocks playback
  clocks and affects all tracks.

### Cut owns one preview mix bus

The shared Cut audio owner creates one input bus and one
`DynamicsCompressorNode` configured as a conservative peak limiter. PCM client
gain nodes connect to that bus instead of directly to the destination.
Positive linear gain is allowed; non-finite or negative gain fails visibly.
Clip fade-in/out is scheduled against the shared start time and current
position in the clip.

Export retains per-clip trim, speed, gain, fade, and delay, then applies
`amix=normalize=0` followed by `alimiter`. This preserves intentional mix
levels while preventing final full-scale overflow. LUFS normalization remains
a separate mastering feature because it changes program loudness rather than
only protecting peaks.

### Waveform peaks are aggregated directly from the decode stream

`generateWaveform()` uses the existing cancellable `streamFfmpeg()` process
port instead of `run()`. It keeps only an incomplete float32 byte suffix, the
current peak window, and the returned numeric peaks. Complete float32 samples
are consumed once and discarded; chunk boundaries may split a sample without
changing the result.

FFmpeg completion is awaited after stdout ends. If the decoder fails after at
least one complete sample, the result is explicitly partial and retains the
completed prefix. Failure before any sample remains a stream corruption error.
Cancellation keeps the existing abort contract and does not manufacture a
partial success. The runtime does not add a PCM passthrough decoder or a second
waveform implementation.

Alternatives rejected:

- Reading the complete raw output before peak calculation retains memory
  proportional to media duration.
- Using `AudioContext.decodeAudioData()` requires browser codec support and
  whole-resource buffering, and moves file/decode ownership into the Webview.
- A temporary PCM file changes RAM pressure into unbounded disk IO and adds
  cleanup state without improving the single-pass aggregation.

### Video processing is hardware-only

HDR10/PQ and HLG sources are not made direct-play inputs from probe facts
alone. Preview Webview readiness reports narrowly named MP4 codec capabilities.
`canPlayType()` alone is not qualification: the real VS Code Electron host
reported `probably` for AV1 Main10, advanced `currentTime`, and filled Range
buffers while the composed video frame remained frozen. Preview therefore
reports AV1 MP4 as unqualified until a source-specific test proves changing
decoded pixels over time. The host may select `av1-mp4-direct` only after that
stronger qualification exists. It may select `vp9-mp4-remux` when MP4 VP9 is
reported because that path has real-host frame-output evidence. WebM VP9 is not
selected from `canPlayType(video/webm)` because the same host reported
`probably` for the 10-bit Profile 2 fixture while decode still failed with
media error 4. The validated VP9 route remuxes without re-encoding into MP4.

Any source that cannot use a qualified native or remux route may use an H.264
SDR preview only when one hardware backend owns the complete video-processing
closure. On darwin that closure is VideoToolbox hardware decode, `scale_vt`
hardware color conversion/scaling, and `h264_videotoolbox` hardware encode.
FFmpeg receives a VideoToolbox hardware output format and the encoder receives
`allow_sw=false`; decoded frames never cross into a CPU video filter and the
encoder cannot silently select its software implementation. `libx264`, `scale`,
`zscale`, and `tonemap` are forbidden in this path.

The runtime does not fall back from this hardware closure to software decode,
software filters, or software encode. Hardware decoder rejection is a runtime
capability failure, not source corruption. This is observable on the current
Apple M2 validation host: VideoToolbox reports no AV1 decoder for the AV1
Main10/PQ fixture even though Chrome can software-decode it. That fixture
therefore fails visibly instead of direct-playing a frozen frame or generating
a CPU proxy.

`scale_vt` is not described as the former float-RGB tone-map graph. A real
VideoToolbox-only smoke proves hardware decode, scaling/color conversion, and
hardware encode remain connected without `hwdownload`, and ffprobe observes
BT.709 output metadata. Acceptable HDR-to-SDR visual quality still requires a
supported HDR hardware decoder and real-host image comparison; the Apple M2
AV1 fixture cannot provide that evidence because decode is rejected first. A
source may still use an independently qualified native HDR route. Native video
remains muted; audio continues through OpenNeko PCM.

Poster capture is an independent operation. Its failure may leave the player
without a poster, but cannot invalidate a separately qualified playback path.
Extension event callbacks consume every rejected promise and project the
operation and diagnostic to the Webview; they never return an unobserved async
callback promise to the VS Code event emitter.

Preview derives poster policy from the canonical video preparation plan before
requesting frame extraction. Qualified direct/remux routes may request the
optional poster independently. A route planned as `h264-sdr-transcode` does not
request an HDR poster: playback preparation is the first source-specific
hardware qualification, and the prepared video's first frame becomes the
visual surface after success. If hardware decode is unavailable, Preview emits
only the playback capability diagnostic. It does not perform a second HDR
capture check or retain a stale poster diagnostic beside the playback failure.

Preview operation failures cross the Host/Webview boundary as stable diagnostic
codes rather than user-facing `Error.message` strings. An unavailable hardware
decoder is a non-crashing playback limitation: the mounted video element,
transport controls, metadata, and editor session remain present while a
localized notice explains that software fallback is disabled and recommends a
hardware-supported device or H.264 source. Hardware-only HDR poster capture is
an informational notice; it explains that no cover frame was generated and
that playback may still be attempted. Unknown failures use a generic localized
operation notice while the Host logger retains implementation details.

The native video file session is editor-scoped and remains stable across seek
and speed changes. A seek updates `<video>.currentTime`, allowing Chromium to
issue a Range request against the already prepared source; it does not remux,
transcode, revoke, or republish the video file. Only the PCM session is replaced
for the requested media time and rate. This is especially important for VP9
WebM input because its one-time MP4 remux may be large.

PCM replacement is generation-owned and serialized. A newer request supersedes
an in-flight preparation, stops its unpublished PCM session, and is the only
generation allowed to publish. The Webview applies the same ownership rule to
asynchronous descriptor connection: a rejected superseded generation cleans up
its own PCM client but cannot replace the current player with an error view.
Clearing `<video src>` remains an intentional final-disposal or source-change
reset, so its empty-source media event must not become a user-visible decode
failure or unmount the element. Intentional PCM termination aborts the owning
process signal before killing FFmpeg so a normal seek cannot surface as an
unhandled `SIGKILL` command failure.

PCM v1 is a finite generation, not a resumable connection. When its scheduled
tail completes, Preview marks that generation spent and stops using it as the
playback clock. The editor-scoped video descriptor, `<video src>`, and shared
`AudioContext` remain alive. Replaying from EOF requests a new PCM generation
at zero while retaining the same video URL; it must not call `resume()` on the
spent PCM client or republish the video file.

Chromium may cancel an obsolete HTTP Range response while seeking or replacing
the selected source. The loopback server treats a response-side
`ERR_STREAM_PREMATURE_CLOSE` after the client connection has closed as expected
transport cancellation. It must not emit an error diagnostic or attempt a 500
response for that case. File IO failures, invalid ranges, and premature stream
closure while the client is still connected remain visible failures.

Development may select explicit `NEKO_FFMPEG_PATH` and
`NEKO_FFPROBE_PATH`. Packaged OpenNeko must select repository-staged
executables whose descriptor contains target, version, hashes, and required
capability signature. Missing or mismatched packaged executables block media
activation; PATH is not a release fallback.

### Corruption reports the narrowest proven scope

Probe success proves the container/source is readable, not that every advertised
timestamp exists. A bounded frame request returning no frame, early EOF, or
known decoder corruption becomes `MediaCorruptionError('interval', ...)`.
Batch capture retains every successful timestamp. Whole-source failure is used
only when probe/container opening fails; stream failure is used when the
selected stream cannot produce any valid prefix.

## Risks / Trade-offs

- A one-second PCM high-water mark adds bounded latency/memory but prevents
  duration-scaled allocation.
- Waveform output still contains `duration * peaksPerSecond` numbers by
  contract; only decoded PCM working memory becomes duration-independent.
- A dynamics compressor is not a broadcast loudness workflow; it is explicit
  peak protection until LUFS mastering is designed.
- Hardware-only preview intentionally rejects codecs that Chrome can decode
  only in software. This includes AV1 Main10 on the validated Apple M2 host.
- `scale_vt` availability does not prove acceptable HDR-to-SDR output; that
  graph remains unqualified until real-host color and changing-frame evidence
  exists.
- Retaining controls after a capability failure allows seeking and retrying,
  but it does not imply that the same unsupported source will become playable
  without a source or hardware change.
- Shipping FFmpeg has binary-size and license-notice costs. The staged
  descriptor and release audit make those costs visible and reviewable.

## Migration Plan

1. Add red-capable browser/media/Cut tests.
2. Implement PCM prepare/start, bounded scheduling, shared start, mix bus, and
   realtime envelopes.
3. Align export peak protection and add output validation.
4. Tighten HDR qualification and corruption classification.
5. Add Webview-to-host native codec qualification and operation-scoped Preview
   failure projection.
6. Add packaged runtime descriptor/staging and composition-root selection.
7. Run real-media matrix, full gates, and VS Code Webview acceptance.

No project schema migration is required. Old preview messages are internal and
pre-release; unknown shapes fail visibly instead of using compatibility
fallbacks.
