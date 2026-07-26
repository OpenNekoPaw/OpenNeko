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

## 3. FFmpeg Preview and Export

- [x] 3.1 Require the exact HDR decoder/encoder/filter closure before proxy
      generation and retain the explicit BT.709 tone-map graph.
- [x] 3.2 Add post-mix `alimiter` to Cut export and validate required video/audio
      streams.
- [x] 3.3 Classify bounded no-frame/early-EOF outcomes as interval corruption
      without downgrading successful prefix operations.
- [x] 3.4 Replace whole-output waveform buffering with bounded incremental peak
      aggregation over the cancellable FFmpeg stream.

## 4. Runtime Closure

- [ ] 4.1 Define verified FFmpeg runtime descriptors for darwin-arm64 and
      linux-x64, including exact version, executable hashes, license metadata, and
      capability signature.
- [ ] 4.2 Stage the selected runtime into development/release payloads and make
      the composition root inject it before feature activation.
- [ ] 4.3 Reject packaged PATH fallback, wrong target, checksum mismatch, and
      missing HDR/audio capabilities in orchestration tests.

## 5. Validation

- [x] 5.1 Run focused `@neko/media` and Cut tests/typechecks.
- [x] 5.2 Run the read-only matrix against `~/Assets/Media` and record healthy,
      partial-corruption, HDR, and non-priority WebM results.
- [x] 5.3 Run build, test, check, quality, legacy-debt, unused, Engine-retirement,
      and OpenSpec gates.
- [x] 5.4 Validate Preview, Canvas, and Cut in the generated isolated Extension
      Development Host using both visible host and Webview/CDP evidence.
- [x] 5.5 Re-run the focused media suite and read-only waveform validation
      against a long file under `~/Assets/Media`, recording peak count,
      available duration, and process memory.
