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

## 3. Native Range video preparation

- [x] 3.1 Replace the Cut MSE descriptor with one authorized native Range URL,
      source-time origin, duration, MIME, and preparation profile.
- [x] 3.2 Publish compatible H.264 MP4 and qualified VP8 WebM directly from the
      original source without FFmpeg or Clip-scoped preview files.
- [x] 3.3 Publish remux and hardware-converted intervals only as completed,
      seekable, session-owned Range files.
- [x] 3.4 Replace `MseVideoClient` with a native HTML video lifecycle client
      that loads, seeks, primes a real frame, plays, pauses, and disposes.
- [x] 3.5 Remove Cut's single-consumer media stream, incremental fetch,
      `SourceBuffer`, and buffer-window implementation.
- [x] 3.6 Remove the fixed ten-second video boundary and keep video ownership
      aligned with OTIO input boundaries.
- [x] 3.7 Transfer the video file session across same-Clip PCM generations so
      retiring an audio window does not revoke retained native video.
- [x] 3.8 Allow only `http://127.0.0.1:*` in the Cut Webview `media-src` CSP and
      reject non-loopback video descriptors.

## 4. Webview generation ownership

- [x] 4.1 Introduce distinct active and standby browser generation records.
- [x] 4.2 Connect prepared video/PCM before the boundary and promote only after
      readiness.
- [x] 4.3 Keep one monotonic Timeline clock through promotion and dispose the
      old generation afterward.
- [x] 4.4 Add latest-only paused seek generation and paused promotion.
- [x] 4.5 Separate pause from full stop so PCM retirement retains the authorized
      native video session and same-Clip seek can use `currentTime`.
- [x] 4.6 Add path regressions proving pause cannot revoke the current video
      token and cross-Clip paused promotion transfers the replacement owner.
- [x] 4.7 Route Timeline ruler gestures and track clicks through the same
      media-aware seek coordinator used by preview controls and shortcuts.

## 5. Validation

- [x] 5.1 Run focused `@neko/media` and Cut tests/typechecks/builds.
- [x] 5.2 Run `pnpm build`, `pnpm test`, `pnpm check`, OpenSpec, legacy-debt,
      and unused-code gates.
- [ ] 5.3 Validate `cut-basic.otio` only in `~/Git/neko-test` through the real
      Extension Development Host and CDP Webview lane.
- [ ] 5.4 Record same-Clip handoff, Clip switch, paused seek, audio peak, A/V
      synchronization, and console evidence.

## 6. Cold-start and derived-representation follow-up

- [x] 6.1 Add a red-capable PCM test proving readiness waits for at least
      100 ms instead of the first 20 ms packet.
- [x] 6.2 Prime the hidden standby decoder before Host activation and add a
      regression proving boundary activation does not prime again.
- [x] 6.3 Add a source-fingerprint thumbnail cache with concurrent-request
      reuse and source-change invalidation tests.
- [x] 6.4 Re-run focused and repository gates, then record cold first playback,
      Clip-boundary frame cadence, and thumbnail cache evidence in the real
      VS Code Webview.
