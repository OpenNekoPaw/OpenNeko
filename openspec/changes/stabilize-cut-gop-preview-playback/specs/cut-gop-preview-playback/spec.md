## ADDED Requirements

### Requirement: Compatible H.264 preparation is GOP-aware

Cut SHALL prepare compatible H.264 media from a preceding random-access frame
and SHALL expose the requested offset inside the decodable fragment.

#### Scenario: Seek begins between keyframes

- **WHEN** the requested source time is between two H.264 random-access frames
- **THEN** the adapter SHALL select the nearest usable preceding keyframe
- **AND** SHALL stream-copy a fragment that includes decoder pre-roll
- **AND** the Webview SHALL present the requested source time rather than the
  keyframe time
- **AND** the adapter SHALL NOT select video transcoding solely because the
  requested time is non-zero

#### Scenario: Keyframe metadata is reused

- **WHEN** multiple preview requests target the same unchanged source
- **THEN** the adapter SHALL reuse one source-fingerprint-owned keyframe index
- **AND** SHALL NOT persist full-GOP proxy media as durable project state

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

### Requirement: Paused seek preserves a valid picture

Cut SHALL treat paused seek as a latest-only prepared generation rather than a
stop-only transport operation.

#### Scenario: User seeks while paused

- **WHEN** the user moves the playhead while playback is paused
- **THEN** Cut SHALL keep the last valid picture mounted while preparing the
  requested position
- **AND** SHALL atomically replace it with the requested paused frame
- **AND** SHALL NOT start audible PCM

#### Scenario: User seeks repeatedly

- **WHEN** a newer paused seek supersedes an in-flight seek
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
