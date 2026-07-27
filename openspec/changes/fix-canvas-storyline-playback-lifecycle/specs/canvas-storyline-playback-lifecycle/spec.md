## ADDED Requirements

### Requirement: Host plan freshness does not own transport state

Canvas SHALL track Host Storyline plan freshness independently from an active Preview transport command.

#### Scenario: Successful Host plan arrives after playback starts

- **GIVEN** Storyline is visible and the user has started Preview playback
- **WHEN** the matching Host-enriched plan response arrives successfully
- **THEN** Canvas SHALL clear plan staleness without changing `playing` to `idle`
- **AND** the controlled Preview SHALL retain its active playback request

#### Scenario: Host plan becomes stale

- **WHEN** the Host plan request times out or the plan is invalidated
- **THEN** Canvas SHALL mark the playback session stale
- **AND** SHALL stop treating the previous transport request as active

#### Scenario: Stale plan recovers

- **GIVEN** the playback session is stale
- **WHEN** a current Host plan is accepted
- **THEN** Canvas SHALL recover the transport to `idle`
- **AND** SHALL require an explicit Play action instead of reporting implicit playback success

### Requirement: Storyline fullscreen preserves playback continuity

Canvas SHALL treat Storyline fullscreen as a presentation change of the same Preview surface.

#### Scenario: Fullscreen toggles during playback

- **GIVEN** Storyline Preview is playing
- **WHEN** the user enters or exits fullscreen
- **THEN** the mounted Preview instance, playback request identity, current unit, and playhead SHALL remain unchanged
- **AND** Canvas SHALL NOT start a parallel media playback path

### Requirement: Unsupported media remains fail-visible

Canvas SHALL NOT introduce CPU video transcoding, proxy generation, or legacy Engine fallback while recovering Storyline playback lifecycle.

#### Scenario: Hardware decoder is unavailable

- **WHEN** the selected media cannot use the required hardware decoder
- **THEN** Canvas SHALL present the existing explicit media diagnostic
- **AND** SHALL NOT continue by silently using CPU video processing
