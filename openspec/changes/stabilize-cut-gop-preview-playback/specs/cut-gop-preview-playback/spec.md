## ADDED Requirements

### Requirement: Compatible media uses native Range playback

Cut SHALL expose compatible H.264 MP4 and qualified VP8 WebM as authorized
original-file Range URLs and SHALL expose the requested source-time origin.

#### Scenario: Seek begins between keyframes

- **WHEN** the requested source time is between two H.264 random-access frames
- **THEN** the adapter SHALL publish the authorized original-file URL
- **AND** the Webview SHALL assign it directly to `<video src>`
- **AND** Chromium SHALL perform Range reads and decoder pre-roll
- **AND** the Webview SHALL present the requested source time
- **AND** the adapter SHALL NOT invoke FFmpeg solely because the requested time
  is non-zero

#### Scenario: Original source remains unchanged

- **WHEN** multiple preview requests target the same unchanged source
- **THEN** each descriptor MAY authorize the same original source
- **AND** the adapter SHALL NOT generate a Clip preview file or keyframe index
- **AND** SHALL NOT read the complete source into application memory

### Requirement: Video continuity follows actual Timeline inputs

Cut SHALL NOT rebuild the active video decoder because of an arbitrary fixed
time window while the same Clip and playback mapping remain active.

#### Scenario: Long Clip crosses ten seconds

- **GIVEN** one enabled video Clip continues beyond ten seconds
- **WHEN** playback crosses the former preview-window boundary
- **THEN** the same active video presentation SHALL continue
- **AND** the video element SHALL NOT emit an intentional empty-source reset
- **AND** the playhead SHALL remain monotonic

#### Scenario: Video input changes

- **WHEN** playback approaches an actual Clip or mapping boundary
- **THEN** Cut SHALL prepare and connect the next generation without mutating
  the active generation
- **AND** the hidden standby decoder SHALL produce its first frame before the
  boundary
- **AND** decoder priming SHALL NOT run as part of boundary activation
- **AND** Cut SHALL promote only a browser-ready replacement
- **AND** SHALL retire the old generation after promotion

### Requirement: Native video owns buffering

Cut SHALL use one native `<video src>` path and SHALL leave Range scheduling,
buffering, demux, decode backpressure, and seek to Chromium.

#### Scenario: Compatible preview starts

- **WHEN** a compatible original source has been qualified
- **THEN** the Host SHALL publish its authorized Range URL without FFmpeg
- **AND** the Webview SHALL assign the URL directly to the standby video element
- **AND** SHALL NOT create a Clip-scoped temporary preview file

#### Scenario: Browser requests media bytes

- **WHEN** Chromium requests a full or partial media interval
- **THEN** the OpenNeko resource handler SHALL return standard file and Range responses
- **AND** SHALL read only the requested file interval
- **AND** the Webview SHALL NOT call `fetch()` for video
- **AND** SHALL NOT create `MediaSource` or `SourceBuffer`

#### Scenario: Video ownership ends

- **WHEN** the generation is replaced or the preview session stops
- **THEN** the Host SHALL revoke the authorized file registration
- **AND** delete any session-owned prepared output
- **AND** a revoked resource URL SHALL fail visibly
- **AND** no MSE or blob fallback SHALL return success

#### Scenario: Audio generation retains the current video Clip

- **WHEN** a prepared generation retains the active video Clip and replaces
  only the PCM window
- **THEN** Host activation SHALL transfer the active video session ownership
  to the new generation
- **AND** retiring the old generation SHALL stop only its PCM sessions
- **AND** the retained native video resource SHALL continue without reconnecting

#### Scenario: Playback pauses inside a Clip

- **WHEN** active playback pauses while its video Clip remains selected
- **THEN** the Host SHALL stop the active PCM sessions
- **AND** SHALL retain the active video session and authorized Range registration
- **AND** the Webview SHALL pause without clearing or replacing `video.src`

#### Scenario: Input requires media preparation

- **WHEN** the accepted source requires container remux or codec conversion
- **THEN** the Host SHALL complete a bounded seekable media file before
  publishing its descriptor
- **AND** H.264 remux SHALL use stream copy
- **AND** codec conversion SHALL use the qualified hardware-only path
- **AND** the result SHALL use the same native Range descriptor as direct media
- **AND** no CPU video fallback or MSE transport SHALL be used

### Requirement: Paused seek preserves a valid picture

Cut SHALL delegate same-Clip random access to the retained native video element
and SHALL use a latest-only prepared generation only when the target changes
the active Clip or playback mapping.

#### Scenario: User seeks inside the retained Clip

- **WHEN** the user moves the playhead to another position in the retained Clip
- **THEN** every seek control, Timeline ruler gesture, and Timeline track click
  SHALL enter the same Webview media seek coordinator
- **AND** Cut SHALL update the native video element's `currentTime`
- **AND** Chromium SHALL perform any required Range reads and decoder pre-roll
- **AND** Cut SHALL NOT reconnect the video or create a Host preview generation
- **AND** SHALL NOT start audible PCM

#### Scenario: User seeks to another Clip

- **WHEN** the user moves the playhead outside the retained Clip or mapping
- **THEN** Cut SHALL keep the last valid picture mounted while preparing the
  requested position
- **AND** SHALL atomically replace it with the requested paused frame
- **AND** SHALL NOT start audible PCM

#### Scenario: User seeks repeatedly

- **WHEN** a newer cross-Clip paused seek supersedes an in-flight seek
- **THEN** only the newest generation SHALL be eligible for promotion
- **AND** the superseded generation SHALL release its Host and browser
  resources without reporting a playback failure

### Requirement: Realtime PCM remains within peak bounds

Cut SHALL apply channel conversion before realtime loudness normalization and
final peak safety after resampling.

#### Scenario: Multichannel source is previewed

- **WHEN** a 5.1 or other multichannel source is mixed into stereo preview PCM
- **THEN** stereo downmix SHALL occur before dynamic `loudnorm`
- **AND** `alimiter` SHALL run after resampling
- **AND** emitted float32 PCM SHALL not exceed full scale

#### Scenario: PCM generation changes

- **WHEN** adjacent PCM generations hand off on one Timeline
- **THEN** they SHALL use the same `AudioContext` clock
- **AND** the replacement SHALL buffer at least 100 ms of schedulable PCM
  before reporting readiness
- **AND** Cut SHALL NOT stop the old generation at an arbitrary sample before
  the replacement is ready
- **AND** retirement SHALL use a bounded gain ramp that prevents a discontinuity

### Requirement: Thumbnail derivation is virtualized and fingerprint cached

Cut SHALL derive only bounded viewport thumbnail tiles and SHALL reuse unchanged
hardware-derived tiles across Webview sessions.

#### Scenario: Viewport requests an unchanged tile

- **WHEN** a tile with the same source fingerprint, timestamp, dimensions, and
  quality was previously captured
- **THEN** the Node adapter SHALL return the cached JPEG
- **AND** SHALL NOT launch another frame-capture command

#### Scenario: Source media changes

- **WHEN** the source size or modification time changes
- **THEN** the previous thumbnail cache entry SHALL NOT match
- **AND** Cut SHALL capture a new hardware-derived tile

#### Scenario: Timeline scrolls or changes density

- **WHEN** the visible range or selected thumbnail density changes
- **THEN** Cut SHALL request only the viewport plus bounded overscan
- **AND** previous in-memory density tiles MAY remain disposable cache entries
- **AND** the Webview SHALL NOT read or write workspace files directly
