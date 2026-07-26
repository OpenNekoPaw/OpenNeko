# streaming-media-waveform Specification

## ADDED Requirements

### Requirement: Waveform aggregation does not retain decoded PCM

The Node media runtime SHALL aggregate peaks directly from the cancellable
FFmpeg stdout stream and SHALL keep only an incomplete sample suffix, one
current peak window, and the returned peak array.

#### Scenario: Long audio stream is decoded

- **WHEN** FFmpeg emits float32 PCM faster than waveform aggregation consumes it
- **THEN** complete samples are folded into peak windows and discarded
- **AND** decoded PCM working memory does not scale with source duration

#### Scenario: A float32 sample spans stream chunks

- **WHEN** an FFmpeg stdout chunk ends in the middle of a sample
- **THEN** only the incomplete bytes are retained for the next chunk
- **AND** the resulting peaks and available duration match contiguous input

### Requirement: Waveform failures preserve only proven results

Waveform generation SHALL retain completed prefix peaks when decoding fails
after valid PCM and SHALL otherwise propagate failure or cancellation.

#### Scenario: Decoder fails after valid PCM

- **WHEN** FFmpeg emits one or more complete samples and then exits with an error
- **THEN** the runtime returns a partial waveform with the valid prefix duration
- **AND** includes a compact decoder diagnostic

#### Scenario: Decoder fails before PCM

- **WHEN** FFmpeg exits with an error before producing a complete sample
- **THEN** waveform generation reports stream corruption
- **AND** does not return an empty partial success

#### Scenario: Caller cancels waveform generation

- **WHEN** the supplied abort signal is cancelled
- **THEN** the FFmpeg process and stdout consumption stop
- **AND** cancellation is propagated instead of being classified as partial
