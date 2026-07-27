## 1. Contract and regression

- [x] 1.1 Add red-capable FFmpeg graph tests for multichannel downmix before
      `loudnorm`, resampling before `alimiter`, and no float sample above 1.
- [x] 1.2 Add red-capable GOP preparation tests proving a non-zero compatible
      H.264 seek uses the preceding keyframe and stream copy.
- [x] 1.3 Add browser lifecycle tests proving standby connection does not
      dispose or empty the active video/PCM generation.
- [x] 1.4 Add paused-seek tests proving the old picture remains until the latest
      paused generation is ready.
- [x] 1.5 Add Timeline-clock tests proving same-Clip and Clip-boundary handoff
      remain monotonic.

## 2. Realtime PCM

- [x] 2.1 Reorder the Cut PCM graph to downmix before dynamic `loudnorm`.
- [x] 2.2 Apply final post-resample `alimiter` to realtime PCM.
- [x] 2.3 Add prepared-generation gain retirement to `PcmAudioClient` and keep
      adjacent generations on one shared `AudioContext`.

## 3. GOP-aware video preparation

- [x] 3.1 Add source-fingerprint-owned keyframe index reuse in the Node adapter.
- [x] 3.2 Replace the non-zero H.264 transcode rule with preceding-keyframe
      fragment copy and explicit requested offset.
- [ ] 3.3 Remove the fixed ten-second video boundary and keep buffering bounded
      independently from OTIO input boundaries.

## 4. Webview generation ownership

- [x] 4.1 Introduce distinct active and standby browser generation records.
- [x] 4.2 Connect prepared video/PCM before the boundary and promote only after
      readiness.
- [x] 4.3 Keep one monotonic Timeline clock through promotion and dispose the
      old generation afterward.
- [x] 4.4 Add latest-only paused seek generation and paused promotion.

## 5. Validation

- [x] 5.1 Run focused `@neko/media` and Cut tests/typechecks/builds.
- [x] 5.2 Run `pnpm build`, `pnpm test`, `pnpm check`, OpenSpec, legacy-debt,
      and unused-code gates.
- [x] 5.3 Validate `cut-basic.otio` only in `~/Git/neko-test` through the real
      Extension Development Host and CDP Webview lane.
- [x] 5.4 Record same-Clip handoff, Clip switch, paused seek, audio peak, A/V
      synchronization, and console evidence.
