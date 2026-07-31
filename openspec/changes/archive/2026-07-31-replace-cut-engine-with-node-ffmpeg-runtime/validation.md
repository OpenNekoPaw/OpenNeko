# Validation: Node/FFmpeg Cut media runtime

Date: 2026-07-26

> Subsequent real-file validation in the isolated `media-runtime` workspace
> found two release blockers that the historical synthetic fixtures did not
> expose: delayed PCM startup can trip the video discontinuity guard, and the
> discovered macOS FFmpeg lacks the `zscale` filter required by the HDR-to-SDR
> proxy. The current acceptance status is recorded in
> `../retire-neko-engine-before-node-media-rebuild/validation.md`; the evidence
> below remains historical path evidence and must not be read as accepting
> arbitrary real media.

## Runtime environment

- VS Code 1.130.0 Extension Development Host
- Electron 42.6 / Chromium 148
- macOS arm64, Apple M2
- FFmpeg 8.0.1 discovered through the host runtime
- Historical synthetic workspace: `~/Git/neko-test` (superseded; this evidence
  is not reused by the Engine-retirement migration)
- Extension payload rebuilt and staged from this worktree before validation

The validation used the `Debug Dev (All)` Extension Development Host path. Host
UI behavior was checked through the visible VS Code window, while Webview
media state, messages, and resource requests were inspected through its CDP
target. Temporary audio and VP9 fixtures created for these checks were removed
after validation.

Future validation is constrained by
`retire-neko-engine-before-node-media-rebuild` to the generated
`.tmp/vscode-test-workspaces/media-runtime` directory. No subsequent media
acceptance may use `neko-test`.

## Real Webview evidence

### H.264, seek, frame capture, and clip transition

- Opened the existing `cut-second.otio` fixture.
- Play advanced the OpenNeko timeline and crossed from the first clip into the
  second clip.
- Jump-to-start and next-frame moved the timeline to `00:00.00` and
  `00:00.03`; playback then resumed normally.
- The muted `<video>` reported `readyState=4`, no media error, and the expected
  dimensions for both source clips.
- Webview resources used only tokenized loopback `/v1/cut-media/file/` and
  `/v1/cut-media/pcm/` URLs. No legacy Engine stream URL was requested.
- Thirteen 160x90 JPEG data URL thumbnails were present, proving real FFmpeg
  frame capture rather than a placeholder projection.

### PCM-only playback and waveform

- Opened a temporary 10-second OTIO audio clip backed by
  `cases/test.mp3`.
- The UI rendered a non-empty SVG waveform path and created a loopback
  `/v1/cut-media/pcm/` request without assigning a video source.
- Play advanced the OpenNeko timeline from zero to the 10-second endpoint,
  proving that the PCM clock owns audio-only playback.

### Explicit unsupported-codec transcode

- Opened a temporary five-second VP9 WebM OTIO clip.
- The host emitted `cut:preview-ready` with preparation profile
  `h264-sdr-transcode`, MIME `video/mp4; codecs="avc1.640029"`, and a tokenized
  loopback file URL.
- `cut:preview-activated` followed about 9 ms later. The first ready playback
  sample was about 0.015 seconds and subsequent 50 ms samples advanced
  monotonically to exactly 5.00 seconds.
- This trace proves preparation latency is excluded from the OpenNeko playback
  clock; the earlier coarse UI observation of an apparent jump was a sampling
  artifact, not a synchronization race.

### Browser capability qualification

- H.264 fragmented MP4 append/play passed in the real Cut Webview.
- VP8 WebM MSE append/play passed in the same Electron runtime, so the declared
  direct VP8 profile remains qualified.
- AV1 Main10 4K HDR decode capability was observed in the Webview, but this is
  not treated as proof of native HDR display correctness. Cut continues to use
  the explicit H.264 SDR tone-mapped proxy policy for unsupported/HDR sources.

## Automated validation

Passed:

- `pnpm check:openspec` — 55 OpenSpec items passed.
- Cut Extension `pnpm exec vitest run` — 25 files, 111 tests passed.
- Cut Webview `pnpm exec vitest run` — 29 files, 236 tests passed.
- Domain, Extension, and Webview `pnpm exec tsc --noEmit`.
- `pnpm build:vscode:dev` — all seven features and the unified VS Code
  extension built and staged.
- `pnpm check:deps` — 1,382 modules and 4,735 dependencies, no violations.
- `pnpm check:legacy-debt` — blocking findings: 0.
- `pnpm check:quality` — all boundary, strictness, orchestration, and OpenSpec
  gates passed.
- `pnpm test:local:vscode` — 4 tests passed.
- `node packages/neko-engine/scripts/check-media-closure.mjs`.
- `node scripts/run-with-ffmpeg-env.js -- cargo test` from
  `packages/neko-engine` — all Rust unit and doc tests passed.
- `CI=1 pnpm ci:local` completed the full release build and all 28 Turbo test
  tasks successfully.

Known repository-baseline failure:

- `pnpm check:unused`, and therefore the final repository-quality phase of
  `pnpm check` / `CI=1 pnpm ci:local`, fails on one existing unused staging
  script, two existing packaging exports, and one existing Knip configuration
  hint. None is in the Cut runtime implementation, and the final scan contains
  no newly introduced Cut unused file or export.

## Remaining risks

- Packaged FFmpeg binaries, codec licensing, and per-platform release payloads
  require release-platform validation beyond development PATH discovery.
- Native 10-bit/HDR display correctness is not claimed; current unsupported or
  HDR Cut preview is a declared SDR proxy. Real-file acceptance additionally
  requires a packaged FFmpeg with the proxy filter capability and currently
  remains blocked.
- Preview, Canvas, Tools, Agent, Assets, CLI, native host, and packaging still
  consume Engine responsibilities. The Engine deletion gate therefore remains
  closed.
