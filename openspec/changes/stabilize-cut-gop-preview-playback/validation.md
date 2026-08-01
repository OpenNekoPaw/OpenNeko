## Validation

Date: 2026-07-27

> 2026-08-01 supersession: all loopback URL, token and VS Code Host observations below are
> historical evidence. The canonical Desktop transport is the single `openneko:` handler and
> exact-resource registry qualified by
> `replace-desktop-media-scheme-with-http-resource-gateway`; this document does not authorize a
> loopback or legacy-scheme fallback.

### Native Range replacement status

The sections below this status record the accepted MSE implementation before
the native video replacement. They remain historical evidence for PCM,
thumbnail, and generation behavior, but they do not accept the current video
transport.

Current automated evidence:

- `pnpm ci:local`: passed after formatting the four changed media source files;
  this covered format, lint, build, 28 repository test tasks, repository quality,
  67 strict OpenSpec items, and 4 local VS Code configuration tests.
- `pnpm --filter @neko/media exec vitest run`: 7 files, 42 tests passed.
- `pnpm --filter @neko/media typecheck`: passed.
- `pnpm --dir packages/neko-cut exec vitest run`: 25 files, 119 tests passed.
- `pnpm --dir packages/neko-cut/packages/webview exec vitest run`: 30 files,
  238 tests passed.
- `pnpm exec tsc --noEmit -p packages/neko-cut/packages/webview/tsconfig.json`:
  passed.
- `pnpm --dir packages/neko-cut compile`: passed.
- `pnpm build`: 8 build tasks passed.
- `pnpm test`: 28 repository test tasks passed.
- `pnpm check`: passed; dependency-cruiser found no violations across 1,205
  modules and 4,031 dependencies.
- `pnpm check:legacy-debt`: passed.
- Both affected OpenSpec changes pass strict validation.
- `git diff --check`: passed.

Path evidence proves that compatible H.264 MP4 and qualified VP8 WebM publish
the original file without FFmpeg or keyframe indexing; remux and hardware
conversion publish only completed seekable files. Browser tests poison
`fetch()` and `MediaSource`, assign one loopback URL directly to `<video>`, and
cover source-time mapping, origin-zero load, decoded-frame priming, disposal,
same-Clip video retention, Range cancellation, and token revocation.

Focused native Range and paused-seek acceptance is recorded below. Broader task
5.3 and 5.4 acceptance remains open for complete playback, audio peak, and A/V
synchronization coverage.

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
- The earlier paused same-Clip trace came from an old Extension Host and is not
  accepted as evidence. The current regression showed that `pausePreview()`
  sent a full Host stop before assigning `video.currentTime`, revoking the URL
  needed for subsequent Range reads. Runtime acceptance must be repeated after
  pause and full-stop ownership are separated.

### Seek ownership regression, 2026-07-27

A fresh `Debug Dev (All)` Extension Development Host was started after staging
the current worktree. Its page target was
`2FF452488E27B1C6DFF8A321914BE7A3` and its Neko Cut iframe target was
`1DAB788249CCE0D299CF16FAD94BC34A`; the workspace was exactly
`~/Git/neko-test` and the open fixture was `.functional/cut-basic.otio`.

- Pausing the first Clip kept its authorized file token live. An explicit
  `Range: bytes=0-31` request returned `206 Partial Content`.
- A same-Clip frame seek moved the Timeline from `5.03` to `5.00` seconds and
  the visible video to `currentTime=5.000` on the same loopback URL. The video
  emitted `seeking`, `seeked`, and `canplay` without a new Host preview message.
- Seeking across the Clip boundary published a new paused generation and loaded
  it in the hidden video. The replacement emitted `loadedmetadata`,
  `loadeddata`, `canplay`, and `seeked` before it became visible. Only then did
  the old element emit disposal-driven `emptied`.
- After promotion, the old token returned `404` and the replacement token
  returned `206`. A second same-Clip frame seek moved the replacement to
  `currentTime=0.033333` without changing its URL or publishing another Host
  preview generation.
- The Webview console contained no Cut media error. It contained the documented
  VS Code `local-network-access` warning. The initial play action was issued by
  CDP and therefore also produced Chromium's untrusted-user-gesture
  `AudioContext` warning; this trace is not used as audio acceptance evidence.

This focused run closes the seek/token regression only. The broader task 5.3
and 5.4 playback, audio peak, and A/V synchronization acceptance remains open.
- No Cut alert or media element error was present after the scenarios. VS Code
  container warnings about `local-network-access` remain classified as benign
  host warnings by the debugger skill.

### Timeline seek coordinator regression, 2026-07-27

The initial CDP reproduction clicked an empty Timeline track row at 4 seconds.
The Timeline clock moved from `00:00.03` to `00:04.00`, but the visible native
video remained at `currentTime=0.033333` and emitted no seek event. This proved
that Timeline interactions called the presentation-store projection directly
and bypassed the media-aware `App.seek()` path.

After routing Timeline ruler gestures and track clicks through the same
`onSeek` contract as preview controls and keyboard shortcuts, a fresh
`Debug Dev (All)` Host used iframe target
`82C2B9B10110F3EAE91EC848C5574404` in `~/Git/neko-test`:

- The same 4-second track click kept the first Clip URL unchanged, moved the
  visible video to `currentTime=4.000`, and emitted `seeking`, `timeupdate`,
  `seeked`, and `canplay`.
- A 6-second track click loaded the second Clip in the hidden video at source
  time `0.966666`, promoted it only after readiness, and then emptied the old
  slot.
- A 7-second track click retained the second URL and moved it to source time
  `1.966666` through native seek.
- The retired token returned `404`; `Range: bytes=0-31` on the active token
  returned `206`.
- The Webview console contained no Cut media error and only the documented VS
  Code `local-network-access` warning.

The red-capable path test
`pnpm --filter @neko/webview exec vitest run src/App.layout.test.ts` failed
before the fix and passed afterward. The focused Timeline suite passed 18
tests, and Webview TypeScript checking passed.

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

The native video replacement removes the previous incremental GOP append and
application-level backpressure task. Compatible H.264 MP4 and qualified VP8
WebM are now original-file Range resources; other formats are completed,
seekable prepared files. Chromium owns byte scheduling, buffering, demux, and
decoder backpressure.

The observed Clip boundary also retains a source-PTS-sized first-frame hold.
Removing that final cadence discontinuity requires boundary scheduling that
arms Host ownership and the shared audio start before the edit point; it must
not be hidden by CPU conversion, speculative source-time rewriting, or a
second fallback path.
