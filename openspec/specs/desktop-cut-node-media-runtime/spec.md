# desktop-cut-node-media-runtime Specification

## Purpose

Define the Cut-owned editing workflow over the canonical Node/FFmpeg media runtime and sandboxed presentation.
## Requirements
### Requirement: Cut media ports remain runtime-neutral

The system SHALL expose Cut media operations through domain-owned ports that do
not import Engine, Node, FFmpeg, Electron, browser transport, or generated Engine
DTO types.

#### Scenario: Desktop composes the runtime

- **WHEN** a Cut document is opened
- **THEN** the composition root provides exactly one implementation of the
  frozen Cut media ports
- **AND** the document and Webview consume only the port contract

#### Scenario: Adapter contract violation

- **WHEN** an adapter returns an invalid descriptor or stale session identity
- **THEN** the consumer fails with an explicit diagnostic
- **AND** it does not substitute another adapter or empty result

### Requirement: Node/FFmpeg owns trusted media preparation

Desktop Main SHALL resolve authorized workspace media paths and use
ffprobe/FFmpeg to implement probe, frame capture, waveform, preview preparation,
PCM decoding, and export.

#### Scenario: Probe common media

- **WHEN** a referenced media file is authorized and readable
- **THEN** the probe result reports duration, video dimensions/rate/codec/pixel
  format/color metadata, and audio stream/channel/sample-rate metadata where
  present

#### Scenario: Capture a frame

- **WHEN** Cut requests a timestamp and maximum dimensions
- **THEN** FFmpeg seeks and returns one bounded image result
- **AND** cancellation terminates the child process

#### Scenario: Render a waveform

- **WHEN** Cut requests waveform peaks
- **THEN** FFmpeg decodes the requested audio stream and the adapter returns
  normalized peaks at the requested density

#### Scenario: Media contains localized corruption

- **WHEN** the container and selected stream are readable but one or more
  requested packets, frames, or bounded intervals are damaged
- **THEN** the adapter classifies the failure as localized media corruption
- **AND** successfully decoded frames or waveform intervals remain available
- **AND** the operation does not classify the complete source as unavailable

#### Scenario: Source or stream is unusable

- **WHEN** the container cannot be opened or the selected stream cannot produce
  any usable bounded result
- **THEN** the adapter reports source-level or stream-level unavailability
- **AND** it does not fabricate an empty successful representation

#### Scenario: FFmpeg runtime lacks a required capability

- **WHEN** the selected preparation profile requires a filter or encoder that
  the discovered FFmpeg executable does not provide
- **THEN** the adapter reports a runtime-capability diagnostic before preparing
  the proxy
- **AND** it does not report the input media as corrupt or unsupported

### Requirement: Preview uses declared native Range preparation

Video preview SHALL use an explicit native video descriptor and one
opaque transient OpenNeko resource URL. The Webview SHALL assign it directly to a muted
`<video>` element without application-level video byte fetching or buffering.

#### Scenario: H.264 input

- **WHEN** an H.264 source is compatible with the preview profile
- **THEN** the adapter publishes the original compatible MP4 without video
  re-encoding or Clip-scoped preprocessing
- **AND** reports an H.264 video MIME type and source-time origin

#### Scenario: Long Clip or locally corrupt suffix

- **WHEN** the next OTIO input boundary is farther than the current PCM window
- **THEN** the active native video resource remains connected through that
  input boundary
- **AND** only the PCM generation rolls forward
- **AND** Chromium bounds video reads through native Range requests

#### Scenario: Unsupported input codec

- **WHEN** the input codec is not qualified for direct Webview playback
- **THEN** the adapter explicitly transcodes it to the H.264 SDR preview profile
- **AND** diagnostics identify the transcode profile
- **AND** the system does not attempt an Engine fallback

#### Scenario: VP8 qualification

- **WHEN** the target Electron renderer supports VP8 WebM native `<video src>` playback
- **THEN** VP8 may use the direct WebM preparation profile
- **ELSE** VP8 uses the explicit H.264 transcode profile

#### Scenario: 10-bit or HDR input

- **WHEN** the source requires conversion for the initial preview profile
- **THEN** the adapter uses an explicit SDR tone-map/conversion filter
- **AND** the UI does not claim native HDR monitoring

### Requirement: All audible inputs use PCM

The system SHALL decode and mix every audible timeline input, including video-embedded audio, into
one framed float32 PCM registration per owning Cut operation. PCM bytes SHALL be
delivered through the unified OpenNeko resource handler.

#### Scenario: Start synchronized audio

- **WHEN** a preview interval contains audible inputs
- **THEN** Desktop Main creates one owning mixed PCM registration for the Cut generation
- **AND** its descriptor reports sample rate, channels, and an opaque transient
  resource URL
- **AND** the video element remains muted

#### Scenario: Start barrier for audible preview

- **WHEN** the Webview connects an audible preview interval
- **THEN** the host primes the paused PCM transport so that bounded bytes can reach the Webview without activating video playback
- **THEN** connection does not complete until every authoritative PCM client has scheduled its first valid packet and exposes a ready media clock
- **AND** the muted video does not start before that barrier

#### Scenario: Stop PCM

- **WHEN** the preview is stopped, replaced, or disposed
- **THEN** all FFmpeg children, resource responses, audio nodes, and registration entries owned by that preview are released

### Requirement: OpenNeko owns preview synchronization

The system SHALL map the selected media clock to OTIO timeline time using an
explicit timeline origin, media origin, playback rate, and active interval.

#### Scenario: PCM clock ready

- **WHEN** a primary PCM stream has a ready playback clock
- **THEN** OpenNeko uses it as the authoritative preview clock
- **AND** video is corrected against that clock

#### Scenario: Video-only interval

- **WHEN** no audible PCM clock exists
- **THEN** OpenNeko uses the `<video>` media clock

#### Scenario: Discontinuity

- **WHEN** drift exceeds the recoverable correction threshold or a seek crosses
  a prepared interval
- **THEN** the system performs an explicit stop/reprepare/seek transition
- **AND** it disposes all local video and PCM clients before stopping their host
  sessions
- **AND** it does not conceal the discontinuity with an unrelated clock

### Requirement: Media bytes stay outside typed IPC

The system SHALL transfer seekable media segments and PCM bytes through owner- and sender-scoped
`openneko://resource` URLs rather than Desktop typed IPC.

#### Scenario: Webview consumes media

- **WHEN** the Webview receives a preview descriptor
- **THEN** it receives no local filesystem path
- **AND** it consumes only opaque transient OpenNeko resource URLs

#### Scenario: Unknown session URL

- **WHEN** a request targets an expired, stopped, or unknown media session
- **THEN** the resource handler returns an explicit non-success response
- **AND** it does not resolve any workspace path from request text

### Requirement: Cut export is an FFmpeg job

The Node adapter SHALL export the accepted lightweight Cut timeline through an
owned cancellable FFmpeg job with staged output and post-write validation.

#### Scenario: Successful export

- **WHEN** the selected OTIO timeline is supported and FFmpeg completes
- **THEN** the adapter validates the staged media
- **AND** publishes it atomically to the requested target

#### Scenario: Failed or cancelled export

- **WHEN** FFmpeg fails, validation fails, or the job is cancelled
- **THEN** incomplete output is not published as a successful export
- **AND** the caller receives an actionable diagnostic

### Requirement: Cut uses one canonical composition path

The Cut composition root SHALL select only the Node/FFmpeg adapter.

#### Scenario: Canonical adapter selected

- **WHEN** a Cut document is opened
- **THEN** the composition root constructs the Node/FFmpeg adapter
- **AND** no alternate media runtime is invoked

#### Scenario: Node adapter cannot initialize

- **WHEN** FFmpeg binaries, the injected media publisher, or the Desktop resource registry is unavailable
- **THEN** Cut reports initialization failure
- **AND** it does not retry with another adapter
