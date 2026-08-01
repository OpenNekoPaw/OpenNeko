## MODIFIED Requirements

### Requirement: Preview uses declared native Range preparation

Video preview SHALL use an explicit versioned native video descriptor and one
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

- **WHEN** the target Electron renderer passes the real VP8 WebM native
  `<video src>` fixture
- **THEN** VP8 may use the direct WebM preparation profile
- **ELSE** VP8 uses the explicit H.264 transcode profile

#### Scenario: 10-bit or HDR input

- **WHEN** the source requires conversion for the initial preview profile
- **THEN** the adapter uses an explicit SDR tone-map/conversion filter
- **AND** the UI does not claim native HDR monitoring

### Requirement: All audible inputs use PCM

The system SHALL decode and mix every audible timeline input, including video-embedded audio, into
one versioned framed float32 PCM registration per owning Cut generation. PCM bytes SHALL be
delivered through the unified OpenNeko resource handler.

#### Scenario: Start synchronized audio

- **WHEN** a preview interval contains audible inputs
- **THEN** Desktop Main creates one owning mixed PCM registration for the Cut generation
- **AND** its descriptor reports protocol version, sample rate, channels, and an opaque transient
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

### Requirement: Cut switches through one canonical composition path

The Cut composition root SHALL select only the Node/FFmpeg adapter after the switch.

#### Scenario: Canonical adapter selected

- **WHEN** a Cut document is opened after migration
- **THEN** tests observe construction of the Node/FFmpeg adapter
- **AND** a poisoned legacy Engine Cut entry is not invoked

#### Scenario: Node adapter cannot initialize

- **WHEN** FFmpeg binaries, the injected media publisher, or the Desktop resource registry is unavailable
- **THEN** Cut reports initialization failure
- **AND** it does not retry with the Engine adapter
