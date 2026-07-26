## Context

The canonical media route is Extension Host `NodeMediaRuntime` or a narrow
domain adapter, tokenized loopback HTTP, muted browser video, and OpenNeko-owned
PCM audio. Real files show that H.264/AAC/MP3 and 5.1-to-stereo PCM work, AV1
Main10 PQ frame decoding works, HDR proxy preparation fails on the current
Homebrew FFmpeg because it lacks `zscale`, and one H.264/AAC file has a valid
prefix but overstated container duration.

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
- Make HDR proxy success depend on a verified FFmpeg capability closure.
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

### HDR is an explicit qualified proxy

HDR10/PQ and HLG sources are never direct-play inputs. The proxy graph converts
to linear light with `zscale`, tone maps in float RGB, converts to BT.709, and
encodes H.264/yuv420p. Qualification requires the source decoder, H.264 encoder,
`zscale`, and `tonemap` before starting work.

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
- Tone-mapped SDR preview does not preserve HDR display output. Source metadata
  and 10-bit decode remain intact; only the VS Code preview proxy is SDR.
- Shipping FFmpeg has binary-size and license-notice costs. The staged
  descriptor and release audit make those costs visible and reviewable.

## Migration Plan

1. Add red-capable browser/media/Cut tests.
2. Implement PCM prepare/start, bounded scheduling, shared start, mix bus, and
   realtime envelopes.
3. Align export peak protection and add output validation.
4. Tighten HDR qualification and corruption classification.
5. Add packaged runtime descriptor/staging and composition-root selection.
6. Run real-media matrix, full gates, and isolated VS Code Webview acceptance.

No project schema migration is required. Old preview messages are internal and
pre-release; unknown shapes fail visibly instead of using compatibility
fallbacks.
