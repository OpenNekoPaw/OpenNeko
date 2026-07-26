# Validation: Engine removal-first checkpoint

Date: 2026-07-26

## Accepted checkpoint

- The OpenNeko product feature list contains Tools, Preview, Assets, Cut,
  Canvas, and Agent only.
- `neko-engine` is absent from product manifests, package groups, the composed
  VSIX contract, development staging, product Turbo dependencies, and
  CI/Release packaging jobs.
- A separately installed `neko.neko-engine` blocks product activation.
- The three remaining legacy command names are registered only as deterministic
  poison handlers. They cannot return an Engine result.
- The staged development product contains six feature roots and no Engine
  feature root.

## Isolated fixture

`pnpm prepare:vscode-media-fixture` rebuilds only:

```text
.tmp/vscode-test-workspaces/media-runtime/
  .openneko-fixture.json
  README.md
  media/audio.wav
  media/h264-aac.mp4
  projects/h264-pcm.otio
```

The H.264 fixture has one 640x360 H.264 stream and one 48 kHz AAC stream with a
six-second duration. The audio fixture is PCM WAV. Active VS Code launch
configurations and the debugger Skill no longer use `neko-test`.

## Commands passed

- `pnpm prepare:vscode-media-fixture`
- `ffprobe ... .tmp/vscode-test-workspaces/media-runtime/media/h264-aac.mp4`
- `pnpm build:vscode:dev`
- Turbo dry-run assertion that no task ID contains `neko-engine`
- `pnpm test:local:vscode`
- `pnpm check:test-orchestration`
- `pnpm build`
- `pnpm test` (27/27 workspace tasks)
- `pnpm check` (`knip` plus 1,341-module dependency graph)
- `pnpm check:quality`
- `pnpm check:legacy-debt`
- `pnpm check:engine-retirement-boundary`
- `pnpm check:openspec`
- focused Assets tests: 13 files / 82 tests
- focused Agent tests: 55 files / 435 tests
- `git diff --check`
- `node scripts/package-openneko-platform.mjs --target darwin-arm64`
- final VSIX archive audit: no `neko-engine` or `neko-client` path or manifest
  dependency

## Real-file Cut checkpoint

The user-provided files under the isolated
`.tmp/vscode-test-workspaces/media-runtime/media/` directory were checked
through the real `NodeFfmpegCutMediaAdapter`. Video checks covered probe, one
320x180 frame, preview preparation, and loopback Range delivery. Audio checks
covered waveform generation and one second of framed 48 kHz stereo float32
PCM. The structured raw output is in the gitignored
`.tmp/media-runtime-adapter-check.jsonl`.

| File                           | Probe                        | Frame              | Preview                                | Waveform / PCM                                 | Result                                        |
| ------------------------------ | ---------------------------- | ------------------ | -------------------------------------- | ---------------------------------------------- | --------------------------------------------- |
| `h264-aac.mp4`                 | H.264 8-bit + AAC            | passed             | H.264 fragmented MP4 copy, HTTP 206    | passed / passed                                | passed                                        |
| `12288828_1920_1080_30fps.mp4` | H.264 8-bit, video-only      | passed             | H.264 fragmented MP4 copy, HTTP 206    | N/A                                            | passed                                        |
| `720P.mp4`                     | H.264 8-bit + AAC 5.1        | passed             | H.264 fragmented MP4 copy, HTTP 206    | passed / stereo PCM passed                     | adapter and fresh Webview sync passed         |
| `audio.wav`                    | PCM mono                     | N/A                | N/A                                    | passed / stereo PCM passed                     | passed                                        |
| `test.aac`                     | AAC stereo                   | N/A                | N/A                                    | passed / stereo PCM passed                     | passed                                        |
| `test.mp3`                     | MP3 stereo                   | N/A                | N/A                                    | passed / stereo PCM passed                     | passed                                        |
| `test.mp4`                     | H.264 8-bit, video-only      | passed             | H.264 fragmented MP4 copy, HTTP 206    | N/A                                            | passed                                        |
| `1080P.mp4`                    | H.264 8-bit + AAC            | first frame passed | beginning fragment and HTTP 206 passed | full waveform failed / first-second PCM passed | damaged source; partial only                  |
| 4K HDR MP4                     | AV1 Main 10-bit PQ + AAC 5.1 | passed             | failed before proxy creation           | passed / stereo PCM passed                     | blocked by FFmpeg capability                  |
| `videoplayback.webm`           | VP9 Profile 2 10-bit PQ      | passed             | failed before H.264 proxy creation     | N/A                                            | non-priority WebM; blocked by same capability |

The 4K HDR failures are deterministic: the host FFmpeg 8.0.1 build exposes
`colorspace` and `tonemap` but not `zscale`; the canonical HDR-to-SDR proxy
filter requires `zscale` and fails visibly with `No such filter: 'zscale'`.
This is a runtime packaging/capability contract gap, not evidence that AV1
decode or 10-bit frame capture is unavailable.

`1080P.mp4` contains invalid H.264 NAL sizes and invalid AAC packets after the
initial playable region. Its container metadata advertises about 1,795 seconds,
but packets end near 143 seconds. Batch capture preserves successful frames at
0 and 120 seconds and marks only the 150-second sample as `corrupt/interval`.
Beginning H.264 copy preview and first-second PCM also succeed. It is partially
damaged media, not a wholly unreadable file and not a healthy full-duration
fixture.

## Real VS Code Webview checkpoint

VS Code 1.130.0 / Electron 42.6 / Chrome 148 Extension Development Hosts were
opened only on isolated generated `media-runtime` workspaces. The final 720P
check used a fresh user-data directory and the newly staged six-feature
composed extension, so no pre-removal Webview cache participated. Visible
actions were correlated with the active Webview iframe through CDP.

- `h264-aac.mp4` played from zero to six seconds. Its muted MSE `<video>`
  reported `readyState=4`, no `MediaError`, and 640x360 decoded frames. Two PCM
  streams used tokenized loopback URLs; the timeline rendered five 160x90
  thumbnails and a non-empty waveform. Split increased the project from two to
  three Clips and Undo restored two Clips.
- `test.mp3` opened with the frozen one-Video-Track model by using an empty
  Video Track plus one Audio Track. PCM-only playback advanced beyond six
  seconds, Pause restored the Play control, and the timeline remained stable
  after pausing.
- `test.mp4` opened and its video-only H.264 preview reached the project
  endpoint without a media error.
- `720P.mp4` with AAC 5.1 was revalidated after the first-packet barrier fix.
  A trusted Play gesture produced `cut:preview-ready` and
  `cut:preview-activated`; at timeline 15.01 seconds the MSE video was
  `readyState=4`, unpaused, error-free, and mapped to about 15.06 seconds of
  source time (about 50 ms drift). Stopping returned the control to Play and
  reset the video to paused/`readyState=0`, proving the active clients were
  released instead of continuing in the background.
- The AV1 Main10 HDR project opened and rendered its timeline, frame-derived
  representation, and audio representation. Play remained at zero because
  proxy preparation failed with the missing `zscale` diagnostic recorded in
  the Neko Cut output channel.

The HTML `<video>` fallback text `无法播放媒体。` remains exposed in the
accessibility tree before a source is assigned. It is not itself a playback
failure; acceptance uses `readyState`, `MediaError`, clock movement, and
loopback resource evidence.

The fresh Cut Webview did not contain `Failed to initialize media engine` or
`neko-engine`. An older already-running Webview target still retained the
pre-removal HTML in memory before the fresh host was launched; it was excluded
from acceptance rather than treated as evidence for the rebuilt product.

## Residual cleanup validation

The final residual pass removed stale current-architecture ownership claims
and unrelated test fixtures that named the retired Engine. Historical,
superseded ADR content remains historical evidence. Product retirement
scanners, the separately installed extension rejection, and three poisoned
legacy commands remain intentionally executable only as fail-closed guards;
they are not media consumers or fallback paths.

- `node --test scripts/test-orchestration/embedded-runtime-closure.test.mjs scripts/test-orchestration/release-source.test.mjs scripts/test-orchestration/release-version-contract.test.mjs scripts/test-orchestration/supported-release-platforms.test.mjs scripts/test-orchestration/engine-retirement-boundary.test.mjs`:
  passed, 23 tests.
- `pnpm check:quality`: passed, including 83 orchestration tests, application
  boundaries over 2,813 files, Engine retirement checks, and strict OpenSpec
  validation over 56 items.
- `pnpm check:legacy-debt`: passed with zero blocking non-Agent findings.
- `pnpm check:unused`: passed.
- `git diff --check`: passed.

## Accepted scope and remaining release risks

Preview, Canvas, Cut, Tools, Assets, and Agent now use `@neko/media` or their
own narrow media ports; `packages/neko-client` and `packages/neko-engine` are
deleted. The media replacement and Engine retirement scope is accepted.

The final darwin-arm64 VSIX contains no Engine/client path or manifest
dependency. Its two `.node` files are the expected Sharp image-processing
runtime, not a media Engine. The VSIX still relies on an externally available,
qualified `ffmpeg`/`ffprobe`; the current host FFmpeg lacks `zscale`, so the
canonical HDR-to-SDR proxy remains fail-visible. A self-contained release must
package or declare an exact FFmpeg closure with `zscale` + `tonemap`, audit
codec licenses per target, and rerun the qualification matrix. This risk must
not be addressed by restoring an Engine fallback.
