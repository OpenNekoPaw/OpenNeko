# bounded-synchronized-pcm-playback Specification

## ADDED Requirements

### Requirement: Browser PCM scheduling is duration-independent

The browser PCM client SHALL keep decoded/scheduled audio within an explicit
bounded lead and SHALL stop pulling loopback bytes until playback consumes
enough buffered audio.

#### Scenario: Long PCM stream is consumed

- **WHEN** FFmpeg can produce PCM faster than realtime for a long source
- **THEN** scheduled `AudioBufferSourceNode` count and media lead remain within
  the configured high-water bound
- **AND** HTTP/stream backpressure pauses further decode delivery

#### Scenario: Client is disposed

- **WHEN** preview stops, seeks, changes generation, or closes
- **THEN** fetch is aborted and every scheduled source is stopped/disconnected
- **AND** no audio continues in the background

#### Scenario: PCM input reaches EOF before queued audio finishes

- **WHEN** the loopback response ends while one or more scheduled sources are
  still audible
- **THEN** playback completion is emitted only after the last scheduled source
  ends
- **AND** consumers do not dispose and truncate the queued tail

### Requirement: Multi-track PCM starts from one barrier

Cut SHALL prepare every audible input before choosing one shared future
`AudioContext` start time.

#### Scenario: PCM first packets arrive at different times

- **WHEN** concurrent tracks finish first-packet preparation at different wall
  times
- **THEN** all tracks receive the same `startAt` context time
- **AND** arrival jitter does not become an audible track offset

#### Scenario: Secondary track drifts

- **WHEN** a secondary PCM clock differs from the primary beyond the declared
  tolerance
- **THEN** preview fails visibly or rebuilds the interval
- **AND** it does not continue while monitoring only the first track

### Requirement: Preview and export share gain and peak policy

Cut SHALL preserve clip gain, apply clip fades, sum tracks through one owned mix
bus, and apply explicit peak protection in both realtime preview and export.

#### Scenario: Clip has positive gain

- **WHEN** a clip gain is above 0 dB
- **THEN** preview applies the corresponding linear gain without clamping it to
  unity
- **AND** export uses the same gain value

#### Scenario: Multiple loud tracks overlap

- **WHEN** summed samples could exceed full scale
- **THEN** the preview mix bus and FFmpeg export apply their declared limiter
- **AND** neither path silently normalizes every input or allows uncontrolled
  output clipping

#### Scenario: Playback begins inside a fade

- **WHEN** the requested preview interval starts partway through fade-in or
  fade-out
- **THEN** realtime gain automation begins at the envelope value for that
  source position
- **AND** progresses consistently with the clip playback rate.
