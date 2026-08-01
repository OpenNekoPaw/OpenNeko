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
   the Node adapter owns source qualification, optional FFmpeg preparation, and
   authorized Range resources; Chromium owns video buffering, demux, decoding,
   and transport backpressure; the Webview coordinator owns generation
   promotion and the Timeline clock.
2. **Dependency:** the Webview consumes transient `openneko://resource` URLs
   and runtime-neutral descriptors. It receives no path or FFmpeg command.
3. **Interface:** a prepared generation has one authorized video URL, explicit
   source-time origin, Timeline interval, and readiness. Active and standby
   generations are distinct owners.
4. **Extension:** other codecs keep the existing hardware-only preparation
   policy. Their prepared output implements the same ordinary Range-file
   contract without exposing FFmpeg or storage paths to the Webview.
5. **Testing:** graph-order tests catch post-downmix clipping; adapter tests
   assert preceding-keyframe copy; coordinator tests assert standby does not
   dispose active clients; real Webview traces assert no `emptied` event during
   paused seek or same-Clip handoff.

## Decisions

### 1. Compatible sources remain original Range resources

For compatible H.264 MP4 and qualified VP8 WebM, the adapter publishes the
original source through the injected `NodeMediaPublisher`; Desktop registers
the exact file in its OpenNeko resource registry. It does not invoke FFmpeg,
build a GOP index, copy a fragment, create a preview file, or read the media
into application memory. The descriptor reports the Clip source-time origin;
Chromium seeks through standard byte Range requests and performs its own
keyframe pre-roll.

Formats that require container conversion or codec conversion retain the
existing bounded Host preparation policy. H.264 remux uses stream copy.
Incompatible codecs use the complete VideoToolbox decode/filter/encode closure
with software fallback disabled. The result is session-owned, removable, and
published only as an ordinary Range file after successful preparation.

### 2. OTIO boundaries replace arbitrary video boundaries

Video generation ends at the next actual enabled video-input boundary. A long
Clip is not split every ten seconds merely to bound work. Chromium bounds
network and decoder buffering through its native media pipeline.

PCM remains bounded because realtime dynamic loudness normalization is
segment-local. Its rolling generations may use a bounded lookahead, but they do
not require replacing the video decoder or Timeline clock.

### 3. Standby connection is separate from active playback

The Webview keeps separate active and standby generation records. Receiving
`cut:preview-prepared` immediately assigns the standby element's native `src`,
loads and seeks it, and prepares its PCM client using the shared
`AudioContext`; it does not dispose, pause, or rewrite the active generation.

At the Timeline boundary, Cut activates only a fully prepared standby
generation. Promotion swaps the visible video slot and clock owner, starts the
new PCM at the handoff time, then retires the old generation after a short gain
ramp. Missing standby readiness holds the last valid picture and reports
buffering; it never clears the current surface first.

Browser-ready means more than metadata or `canplay`. The standby video client
must decode and present one frame while hidden, pause on that decoded frame,
and restore its requested media origin before it can be promoted. Decoder
priming therefore belongs to standby preparation and never runs after the Host
activation acknowledgement at the Timeline boundary.

### 4. Pause and seek preserve native video ownership

Pausing stops and releases the sequential PCM sessions but retains the current
video session, authorized Range token, element `src`, decoder, and last
presented frame. A seek whose target remains inside the same Clip and playback
mapping updates native `video.currentTime`; Chromium issues any required Range
requests and presents the target frame without a Host preview generation.

A seek to another Clip starts a non-autoplay preview generation. The mounted
picture remains visible until the replacement video is connected and
positioned. A newer cross-Clip seek cancels the older generation. The
replacement is promoted as the retained paused video owner without starting
PCM or setting transport state to playing.

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

PCM preparation must accumulate a bounded scheduling reserve before it reports
readiness. One 20 ms packet is not readiness: the cold FFmpeg/publication path
can miss the next scheduling deadline even when the first packet arrived. The
browser client buffers at least 100 ms without starting playback, then schedules
that reserve against the explicit shared handoff time.

### 6. Thumbnail cache follows the same source fingerprint rule

Timeline virtualization remains the request owner: it requests the visible
range plus bounded overscan at the density selected for the current zoom. The
Node adapter owns a durable disposable thumbnail cache under its configured
cache root. A cache entry is keyed by the source-relative identity, source
size/mtime fingerprint, requested timestamp, dimensions, and quality.

The cache stores only the JPEG result produced by the existing hardware frame
capture path. It is not project state and may be deleted at any time. A source
fingerprint change produces a different key, so stale media frames cannot be
returned. Concurrent identical requests share one in-flight capture.

### 7. Preview bytes use one native HTML video path

The descriptor contains one transient OpenNeko resource URL, MIME type, preparation profile,
source-time origin, and Clip duration. The Webview assigns that URL directly to
one of its two `<video>` elements. It never calls `fetch()` for video, creates a
`MediaSource`, appends a `SourceBuffer`, or maintains forward/backward buffer
windows.

The Desktop OpenNeko resource handler owns authorization, MIME, `HEAD`, byte Range,
`206`, `Content-Range`, cancellation, and revocation. Each browser request opens
only the requested file interval. Browser retries and concurrent Range requests
are valid; seekable registrations are not single-consumer. Stopping or replacing a
generation revokes its registration and deletes any session-owned prepared file.

When playback pauses, the Host retires only PCM ownership and keeps the active
video session registered. When a later generation retains the same video Clip
and replaces only its PCM window, Host activation transfers that video session
identity into the new active generation before retiring the old record. A real
Clip change or whole-preview stop revokes the video resource.

The Cut Webview CSP explicitly allows only `openneko://resource` in `media-src`
for this transport. Descriptor validation rejects non-resource URLs. There is
no MSE, blob, whole-response fetch, or alternate video fallback.

## Reuse audit

- Reuse the shared `HtmlVideoDescriptor` shape and injected `NodeMediaPublisher` file
  registration; Cut adds only its required source-time origin.
- Reuse the native HTML video lifecycle already proven by Preview and Canvas,
  while keeping Cut's synchronized priming in `@neko/media/browser`.
- Keep `PcmAudioClient` as the explicit audio clock path; this decision removes
  only application-owned video-byte flow control.
- Keep `useClipRepresentations` as the viewport/density planner and add caching
  at the existing Node adapter boundary rather than introducing a Webview file
  cache.
- Keep `CutPreviewClock` as the synchronization primitive and move generation
  ownership into one Cut coordinator path.
- Keep the existing Node/FFmpeg adapter as the only Cut media implementation;
  no fallback or parallel Engine adapter is added.

## Risks / Trade-offs

- A GOP can still be large for long-GOP or high-bitrate input. Chromium decides
  the Range and decode pre-roll needed for a seek; proxy policy remains the
  separate mechanism for reducing source complexity.
- Remux or hardware conversion cannot be published until its bounded output is
  complete and seekable. Those formats have higher preparation latency than
  compatible direct sources, but the application does not acquire a second
  buffering implementation to hide it.
- Browser seek precision differs across containers. Descriptor origin and
  playback tests must prove the requested frame for accepted profiles.
- A paused video keeps one authorized file token and decoder resource alive.
  Explicit stop, Clip replacement, panel disposal, and document disposal must
  still revoke it.
- Two browser video slots briefly coexist around a Clip boundary. Ownership and
  disposal tests must prevent hidden playback, leaked object URLs, or duplicate
  audio.
- Dynamic loudness state cannot be perfectly continuous across independently
  prepared PCM generations. Export remains the authoritative two-pass program
  loudness result.
- Thumbnail cache files are disposable and can grow across many source
  fingerprints. A later storage-budget policy may prune old fingerprints; the
  correctness contract does not depend on cache survival.

## Runtime verification

Use only `/Users/feng/Git/neko-test` in a real VS Code Extension Development
Host. Validate `cut-basic.otio`, including same-Clip rolling playback, the
`test.mp4 -> 720P.mp4` boundary, rapid paused seek, playhead progression, PCM
peak safety, and product-error console output. Ordinary browser playback is not
acceptance evidence.
