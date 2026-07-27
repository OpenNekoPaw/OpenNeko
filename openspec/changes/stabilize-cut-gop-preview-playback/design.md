## Context

The current Host successfully prepares the next preview session before a
boundary, but the Webview stores only its descriptor. At the boundary it first
disposes the active MSE and PCM clients, assigns a new `MediaSource` to the same
`<video>`, waits for append and decoder priming, inserts a new 100 ms audio
barrier, and only then installs the replacement playback segment. A real
Extension Development Host trace measured 242–272 ms picture gaps. Paused seek
uses the same stop path but never requests a paused replacement.

The Cut selector also imposes a ten-second boundary even when no OTIO input
changes. Every non-zero H.264 start selects `h264-sdr-transcode`, so a long
compatible Clip repeatedly pays hardware decode/filter/encode startup.

The realtime audio graph currently ends with
`loudnorm -> aresample -> stereo`. On a real AAC 5.1 source, stereo downmix after
true-peak control produced float samples as high as +3.75 dBFS. The source
itself peaked at -7.62 dBFS.

### Five-layer analysis

1. **Responsibility:** Cut domain owns Timeline boundaries and source offsets;
   the Node adapter owns GOP discovery and FFmpeg preparation; browser media
   clients own buffering; the Webview coordinator owns generation promotion
   and the Timeline clock.
2. **Dependency:** the Webview continues to consume opaque loopback URLs and
   runtime-neutral descriptors. It receives no path or FFmpeg command.
3. **Interface:** a prepared generation has explicit requested media origin,
   decodable fragment origin, Timeline interval, and readiness. Active and
   standby generations are distinct owners.
4. **Extension:** other codecs keep the existing hardware-only preparation
   policy. A future container parser may replace ffprobe keyframe discovery
   behind the same adapter-owned index without changing Cut UI.
5. **Testing:** graph-order tests catch post-downmix clipping; adapter tests
   assert preceding-keyframe copy; coordinator tests assert standby does not
   dispose active clients; real Webview traces assert no `emptied` event during
   paused seek or same-Clip handoff.

## Decisions

### 1. Cache metadata, not proxy media

The adapter caches a source-fingerprint-owned keyframe index containing
random-access timestamps. It does not persist one file per GOP and does not
generate a full proxy. Prepared fragment bytes remain session-owned,
bounded, and removable.

For compatible H.264, the adapter selects the nearest keyframe at or before the
requested source time. FFmpeg stream-copies from that point. The descriptor
reports the requested offset inside the zero-origin fragment so MSE primes from
the GOP start and presents the exact requested frame. B-frame pre-roll remains
inside the fragment and is not projected as Timeline progress.

If no usable preceding random-access point is available, the adapter fails the
copy qualification explicitly. It does not silently select CPU processing.
Formats that already require conversion retain the all-hardware
VideoToolbox-only path.

### 2. OTIO boundaries replace arbitrary video boundaries

Video generation ends at the next actual enabled video-input boundary. A long
Clip is not split every ten seconds merely to bound work. Browser buffering is
bounded independently by incremental fetch/append and backpressure.

PCM remains bounded because realtime dynamic loudness normalization is
segment-local. Its rolling generations may use a bounded lookahead, but they do
not require replacing the video decoder or Timeline clock.

### 3. Standby connection is separate from active playback

The Webview keeps separate active and standby generation records. Receiving
`cut:preview-prepared` immediately connects the standby MSE client and prepares
its PCM client using the shared `AudioContext`; it does not dispose, pause, or
rewrite the active generation.

At the Timeline boundary, Cut activates only a fully prepared standby
generation. Promotion swaps the visible video slot and clock owner, starts the
new PCM at the handoff time, then retires the old generation after a short gain
ramp. Missing standby readiness holds the last valid picture and reports
buffering; it never clears the current surface first.

### 4. Paused seek is a latest-only prepared generation

Paused seek updates the requested Timeline position and starts a non-autoplay
preview generation. The mounted picture remains visible until the replacement
video is connected and positioned. A newer seek cancels the older generation.
The replacement is promoted in a paused state and does not start PCM or set
transport state to playing.

### 5. Realtime audio peak safety follows channel topology

The canonical live graph is:

```text
source trims/gain/fades
  -> amix(normalize=0)
  -> stereo downmix
  -> loudnorm(dynamic I=-14, TP=-1, LRA=11)
  -> 48 kHz resample
  -> alimiter(-1 dBFS)
  -> float32 stereo PCM
```

Downmix precedes program loudness processing because channel summation changes
sample and true peaks. The final limiter follows resampling because resampling
can create inter-sample overs. It is peak safety, not a replacement for EBU
R128 normalization.

Adjacent generations use a small Web Audio gain ramp during retirement so an
arbitrary non-zero sample is not cut to zero. The shared `AudioContext` remains
the clock owner.

## Reuse audit

- Reuse `NodeMediaRuntime.keyframes` semantics; Cut does not create a second
  public keyframe contract.
- Extend the existing `MseVideoClient` and `PcmAudioClient` lifecycle rather
  than adding package-local browser transports.
- Keep `CutPreviewClock` as the synchronization primitive and move generation
  ownership into one Cut coordinator path.
- Keep the existing Node/FFmpeg adapter as the only Cut media implementation;
  no fallback or parallel Engine adapter is added.

## Risks / Trade-offs

- A whole-Clip fragmented MP4 created up front can still delay startup or grow
  disk use. The implementation must keep preparation bounded or incrementally
  append GOP-aligned fragments rather than replacing a ten-second memory bound
  with unbounded eager output.
- Stream-copy timestamps differ across containers. Descriptor offset and
  playback tests must prove exact seek for B-frame material.
- Two browser video slots briefly coexist around a Clip boundary. Ownership and
  disposal tests must prevent hidden playback, leaked object URLs, or duplicate
  audio.
- Dynamic loudness state cannot be perfectly continuous across independently
  prepared PCM generations. Export remains the authoritative two-pass program
  loudness result.

## Runtime verification

Use only `/Users/feng/Git/neko-test` in a real VS Code Extension Development
Host. Validate `cut-basic.otio`, including same-Clip rolling playback, the
`test.mp4 -> 720P.mp4` boundary, rapid paused seek, playhead progression, PCM
peak safety, and product-error console output. Ordinary browser playback is not
acceptance evidence.
