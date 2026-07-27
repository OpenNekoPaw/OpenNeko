## 1. Regression Contract

- [x] 1.1 Add red-capable tests for bounded PCM scheduling, scheduled-source
      disposal, and playback completion after the queued tail.
- [x] 1.2 Add red-capable tests proving concurrent PCM tracks share one start
      time and preserve positive gain.
- [x] 1.3 Add red-capable Cut tests for live fades, mix-bus peak protection, and
      export limiter placement.
- [x] 1.4 Add red-capable media tests for HDR qualification and bounded no-frame
      interval corruption.
- [x] 1.5 Add red-capable media tests proving waveform generation consumes a
      stream incrementally, handles split float32 samples, preserves a valid
      prefix after decoder failure, and propagates cancellation.

## 2. Browser PCM and Cut Synchronization

- [x] 2.1 Implement explicit PCM prepare/start phases with bounded high/low
      water scheduling.
- [x] 2.2 Stop and disconnect all scheduled sources on disposal.
- [x] 2.3 Start all Cut PCM clients at one post-prepare `AudioContext` time and
      validate secondary clocks against the primary clock.
- [x] 2.4 Add a Cut-owned mix bus, allow positive gain, and schedule clip fades.
- [x] 2.5 Replace per-Clip browser mixing with one bounded Host mixed PCM
      segment and remove `DynamicsCompressorNode` from the Webview.
- [x] 2.6 Apply the declared realtime EBU R128 target after the complete segment
      mix, retaining browser monitor volume and the PCM timeline clock.
- [x] 2.7 Serialize preview lifecycle operations per panel and claim each
      generation before asynchronous cleanup so rapid seek/stop cannot retire
      the replacement session or stop one resource twice.

## 3. FFmpeg Preview and Export

- [x] 3.1 Require the exact video decoder/filter/encoder closure before preview
      generation; section 5.7 supersedes the former CPU BT.709 tone-map graph
      with the hardware-only VideoToolbox closure.
- [x] 3.2 Add post-mix `alimiter` to Cut export and validate required video/audio
      streams.
- [x] 3.3 Classify bounded no-frame/early-EOF outcomes as interval corruption
      without downgrading successful prefix operations.
- [x] 3.4 Replace whole-output waveform buffering with bounded incremental peak
      aggregation over the cancellable FFmpeg stream.
- [x] 3.5 Replace limiter-only Cut export with fail-visible two-pass EBU R128
      `loudnorm`; keep `alimiter` only after measured normalization.

## 4. Runtime Closure

- [x] 4.1 Define verified FFmpeg runtime descriptors for darwin-arm64 and
      linux-x64, including exact version, executable hashes, license metadata, and
      capability signature.
- [x] 4.2 Stage the selected runtime into development/release payloads and make
      the composition root inject it before feature activation.
- [x] 4.3 Reject packaged PATH fallback, wrong target, checksum mismatch, and
      missing HDR/audio capabilities in orchestration tests.
- [x] 4.4 Include `loudnorm`, `ebur128`, `alimiter`, AAC, FLAC, and DTS decode
      in the staged runtime capability signature.

## 5. Native Preview Qualification

- [x] 5.1 Add red-capable media tests for qualified AV1/MP4 direct playback,
      VP9/WebM-to-MP4 remux, and unqualified HDR proxy behavior.
- [x] 5.2 Add a versioned Preview readiness capability payload and pass its
      narrowly named native MP4 profiles into the Node media runtime.
- [x] 5.3 Observe Preview message promises and project capture-frame versus
      playback failures without an Extension Host unhandled rejection.
- [x] 5.4 Inject the qualified development FFmpeg/ffprobe pair explicitly from
      the VS Code development composition.
- [x] 5.5 Treat response-side Chromium Range cancellation as an expected
      transport boundary without hiding real loopback failures.
- [x] 5.6 Make Preview seek generation-safe: retain one editor-scoped native
      video/Range session, serialize latest-only PCM replacement, ignore
      intentional empty-source reset, consume intentional PCM FFmpeg
      termination, and replace rather than resume a spent PCM generation after
      EOF.
- [x] 5.7 Replace the CPU H.264 SDR proxy with one VideoToolbox-only closure:
      forced hardware decode/output, `scale_vt`, `h264_videotoolbox`, disabled
      software encoder fallback, and no CPU video-filter fallback.
- [x] 5.8 Classify source-specific VideoToolbox decoder rejection as an
      actionable runtime-unavailable failure and prove no legacy CPU proxy is
      invoked.
- [x] 5.9 Apply the same hardware-only rule to Cut preview preparation so
      Preview and Cut cannot diverge onto different video-processing paths.
- [x] 5.10 Replace raw Preview runtime strings and the whole-player error
      return with structured localized AV1/hardware and HDR-poster notices that
      retain video, controls, metadata, and session state.
- [x] 5.11 Derive poster policy from the canonical video preparation plan so
      hardware-required routes skip HDR poster extraction and surface only the
      higher-priority playback capability diagnostic when decode is
      unavailable.
- [x] 5.12 Move SDR poster and Cut thumbnail capture to VideoToolbox decode plus
      `scale_vt` and one bounded frame readback; reject CPU fallback and check
      hardware availability before HDR metadata.
- [x] 5.13 Give each Cut preview attempt one failure latch and stage-specific
      localized video, audio, synchronization, or startup diagnostics so
      concurrent callbacks cannot stack generic notices; keep superseded
      representation cancellation out of the user-error channel; prepare
      non-zero H.264 seeks as zero-origin VideoToolbox fragments.

## 6. Validation

- [x] 6.1 Run focused `@neko/media` and Cut tests/typechecks.
- [x] 6.2 Run the read-only matrix against `~/Assets/Media` and record healthy,
      partial-corruption, HDR, and non-priority WebM results.
- [x] 6.3 Run build, test, check, quality, legacy-debt, unused, Engine-retirement,
      and OpenSpec gates.
- [x] 6.4 Validate Preview, Canvas, and Cut in the generated isolated Extension
      Development Host using both visible host and Webview/CDP evidence.
- [x] 6.5 Re-run the focused media suite and read-only waveform validation
      against a long file under `~/Assets/Media`, recording peak count,
      available duration, and process memory.
- [x] 6.6 Re-run the exact `~/Git/neko-test/cases/4K.mp4` and `test.webm`
      Preview paths in the Extension Development Host and record Range,
      descriptor profile, `readyState`, current-time progression, PCM, and
      console evidence.
- [x] 6.7 Re-run the AV1 Main10 fixture on Apple M2 and assert a visible
      VideoToolbox capability failure, zero CPU proxy processes, and no frozen
      native playback.
- [x] 6.8 Add red-capable Host/Webview diagnostic tests and verify both notices
      in the real `~/Git/neko-test` Extension Development Host.
- [x] 6.9 Verify the ordered capability path against
      `~/Git/neko-test/cases/4K.mp4`: opening the hardware-required AV1 source
      emits no HDR poster diagnostic, Play emits one hardware-decoder alert,
      and CDP observes no concurrent poster status.
- [x] 6.10 Re-run Cut in the real `~/Git/neko-test` Extension Development Host,
      exercise rapid seek/stop and a segment boundary, and assert one PCM
      master, progressing video, and no duplicate preview-failure notice.
