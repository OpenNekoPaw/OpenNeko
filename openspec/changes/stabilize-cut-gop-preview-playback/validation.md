## Validation

Date: 2026-07-27

### Focused gates

- `pnpm --filter @neko/media exec vitest run`: 6 files, 37 tests passed.
- `pnpm --filter @neko/media typecheck`: passed.
- `pnpm --dir packages/neko-cut exec vitest run`: 25 files, 113 tests passed.
- `pnpm --dir packages/neko-cut/packages/webview exec vitest run`: 30 files,
  236 tests passed.
- `pnpm exec tsc --noEmit -p packages/neko-cut/packages/webview/tsconfig.json`:
  passed.
- `pnpm --dir packages/neko-cut compile`: passed.
- `NEKO_FFMPEG_PATH=/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg
NEKO_FFPROBE_PATH=/opt/homebrew/opt/ffmpeg-full/bin/ffprobe pnpm build`:
  passed.
- `pnpm test`: 28 tasks passed.
- `pnpm check`: passed, including `check:unused`; dependency-cruiser found no
  violations across 1,205 modules and 4,032 dependencies.
- `pnpm check:legacy-debt`: passed.
- `pnpm exec openspec validate stabilize-cut-gop-preview-playback --strict`:
  passed.

### Real VS Code Webview

Workspace: `/Users/feng/Git/neko-test` only.

Fixture: `.functional/cut-basic.otio`, containing the `test.mp4 -> 720P.mp4`
video boundary and the long second Clip.

Host lane used Computer Use for the trusted Play/Pause user gestures. CDP was
used only for Webview target discovery, DOM/media observation, message
observation, and loopback fetch timing.

- The second H.264 generation was prepared about 1.55 seconds before the edit
  boundary after applying the two-second copy/remux lead.
- Generation 2 was activated at the 5.03-second boundary. The standby video
  entered `playing` before the old slot emitted its disposal-driven `emptied`
  event.
- At the ten-second PCM rolling boundary, generation 3 had no video
  descriptor. The active video kept playing in the same slot with no
  `emptied`, `loadstart`, or decoder reset.
- The PCM loopback response returned headers in 3-8 ms in the observed runs.
- Paused same-Clip seek emitted only `seeked/canplay` on the active video. It
  emitted no preview generation message and no `emptied/loadstart`.
- No Cut alert or media element error was present after the scenarios. VS Code
  container warnings about `local-network-access` remain classified as benign
  host warnings by the debugger skill.

### Audio peak and synchronization

- The generated 5.1 regression fixture passes through stereo downmix,
  `loudnorm`, 48 kHz resampling, and final `alimiter`.
- Parsed emitted float32 samples stayed at or below `0.891252` (approximately
  -1 dBFS).
- Adjacent PCM generations use the shared `AudioContext`, schedule against one
  handoff time, and retire the previous gain with a 10 ms ramp.
- `CutPreviewClock` tests cover retained-video origin projection and
  audio/video drift handling; the real Webview trace kept the playhead
  monotonic through both generation promotions.

### Cold-start and representation follow-up

Fixture: `.functional/cut-second.otio`, containing a 21.27-second first H.264
Clip followed by `external-test.mp4`.

- A fresh Extension Development Host window completed its first trusted Play
  gesture without a Cut diagnostic or unhandled Webview error.
- PCM readiness scheduled five 20 ms packets before startup. The first packet
  had 57.8 ms of scheduling lead and the fifth extended the initial reserve to
  137.8 ms; later packets retained the bounded scheduling high-water mark.
- The standby decoder appended and loaded the next 4.4 MB H.264 fragment before
  the edit boundary. It presented a warm frame, paused, sought back to the
  requested media origin, and presented that exact paused frame again.
- The restored paused frame was browser-ready about 113 ms before the Host
  activation acknowledgement. The outgoing slot's last presented frame was
  about 13.5 ms before that acknowledgement, so promotion retained a valid
  picture rather than clearing the stage or reconnecting at the boundary.
- The next source's first encoded presentation timestamp is about 83 ms. Its
  first advancing post-promotion frame arrived about 111 ms after `play()`;
  the already-decoded origin frame remained visible during that interval.
- Twelve hardware-derived thumbnail JPEGs existed in the adapter cache. Their
  modification times remained at 13:51-13:56 after the 14:03 Host reload while
  the Timeline thumbnails rendered again, proving the reload reused persistent
  entries rather than launching new captures.

### Remaining tasks

Task 3.3 remains open. Compatible H.264 now follows actual video-input
boundaries and reuses a source-fingerprint keyframe index, but the Node adapter
still writes the whole selected fragmented MP4 before MSE appends it. A later
change must provide incremental GOP-aligned append/backpressure so disk,
startup, and browser buffering are bounded independently of long OTIO Clips.

The observed Clip boundary also retains a source-PTS-sized first-frame hold.
Removing that final cadence discontinuity requires boundary scheduling that
arms Host ownership and the shared audio start before the edit point; it must
not be hidden by CPU conversion, speculative source-time rewriting, or a
second fallback path.
