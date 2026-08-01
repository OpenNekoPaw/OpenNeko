# bounded-synchronized-pcm-playback Specification

## ADDED Requirements

### Requirement: Browser PCM scheduling is duration-independent

The browser PCM client SHALL keep decoded/scheduled audio within an explicit
bounded lead and SHALL stop pulling resource bytes until playback consumes
enough buffered audio.

#### Scenario: Long PCM stream is consumed

- **WHEN** FFmpeg can produce PCM faster than realtime for a long source
- **THEN** scheduled `AudioBufferSourceNode` count and media lead remain within
  the configured high-water bound
- **AND** resource-stream backpressure pauses further decode delivery

#### Scenario: Client is disposed

- **WHEN** preview stops, seeks, changes generation, or closes
- **THEN** fetch is aborted and every scheduled source is stopped/disconnected
- **AND** no audio continues in the background

#### Scenario: PCM input reaches EOF before queued audio finishes

- **WHEN** the OpenNeko resource response ends while one or more scheduled sources are
  still audible
- **THEN** playback completion is emitted only after the last scheduled source
  ends
- **AND** consumers do not dispose and truncate the queued tail

### Requirement: Cut publishes one generation-owned PCM master

Cut SHALL mix all audible inputs for the bounded interval in the Host and SHALL
publish exactly one PCM master whose PTS is the Timeline clock. Preview
start/prepare/activate/stop operations for one panel SHALL have one serialized
resource owner.

#### Scenario: Overlapping audible inputs are prepared

- **WHEN** multiple Video/Audio Clips are audible in the current interval
- **THEN** FFmpeg applies their source timing, speed, gain, and fades before
  producing one mixed PCM stream
- **AND** the Webview schedules only that master stream at one future
  `AudioContext` time
- **AND** a non-zero H.264 seek is emitted as a zero-origin VideoToolbox
  fragment rather than a stream-copy fragment whose first decodable keyframe
  starts after zero
- **AND** after Host activation the Webview starts muted video at that same
  future audio time rather than allowing PCM to run before video startup

#### Scenario: Rapid seek and stop supersede an in-flight generation

- **WHEN** a newer panel operation arrives while an older generation is
  preparing, activating, or stopping
- **THEN** the operations execute in order for that panel
- **AND** each session record is claimed before asynchronous cleanup and is
  stopped at most once
- **AND** a generation explicitly superseded during hardware preparation or
  before activation is treated as controlled cancellation, not a user error
- **AND** independent panels remain independently concurrent

#### Scenario: One preview attempt fails through multiple asynchronous clients

- **WHEN** video, audio, connection, or activation callbacks observe the same
  preview-attempt failure
- **THEN** the Webview accepts exactly one failure for that attempt
- **AND** the notice identifies the failing playback stage instead of stacking
  repeated generic preview-failed notices
- **AND** intentional cancellation of a superseded thumbnail request is not
  projected as a Cut error and does not stop playback
- **AND** a later user-started attempt can report its own failure independently

### Requirement: Preview and export share gain and loudness policy

Cut SHALL preserve clip gain, apply clip fades, sum tracks through one owned mix
graph, and apply the declared EBU R128 target in both realtime preview and
export. Peak limiting SHALL remain a separate safety stage and SHALL NOT be
reported as loudness normalization.

#### Scenario: Clip has positive gain

- **WHEN** a clip gain is above 0 dB
- **THEN** preview applies the corresponding linear gain without clamping it to
  unity
- **AND** export uses the same gain value

#### Scenario: Multiple loud tracks overlap

- **WHEN** summed samples could exceed full scale
- **THEN** Cut mixes the sources before applying one program loudness target
- **AND** neither path silently normalizes every input independently
- **AND** final peak protection prevents uncontrolled output clipping

#### Scenario: Realtime preview is prepared

- **WHEN** one or more audible Clips overlap the bounded preview interval
- **THEN** the Host emits one mixed PCM stream normalized with EBU R128
  `loudnorm` dynamic mode at `I=-14`, `TP=-1`, and `LRA=11`
- **AND** the Webview does not insert `DynamicsCompressorNode`
- **AND** it does not read future media beyond the bounded preview segment

#### Scenario: Export includes audio

- **WHEN** Cut exports a program with at least one audible source
- **THEN** FFmpeg measures the complete mixed program in a first `loudnorm`
  pass
- **AND** the render pass supplies all measured fields to linear `loudnorm`
- **AND** `alimiter` is applied only after normalization as final peak safety
- **AND** invalid or incomplete measurement output fails visibly rather than
  falling back to limiter-only export

#### Scenario: Playback begins inside a fade

- **WHEN** the requested preview interval starts partway through fade-in or
  fade-out
- **THEN** realtime gain automation begins at the envelope value for that
  source position
- **AND** progresses consistently with the clip playback rate.
