## ADDED Requirements

### Requirement: DSH context pressure follows one authoritative projection path

OpenNeko SHALL display context occupancy from the exact DSH Session's `contextPressure` projection and SHALL NOT recalculate pressure from transcript content or maintain a second compaction state.

#### Scenario: provider usage is available

- **WHEN** DSH projects `projectedTokens`, `pressureTokens` and `contextWindow` for a Session
- **THEN** the exact OpenNeko Conversation snapshot carries that whole value
- **AND** the existing composer usage indicator displays projected occupancy against that context window.

#### Scenario: compaction changes the visible surface

- **WHEN** DSH compaction reduces `projectedTokens` without a new provider usage sample
- **THEN** the next pressure projection replaces the previous whole value
- **AND** OpenNeko reflects the reduced next-request pressure without reconstructing the transcript.

#### Scenario: pressure capability is absent

- **WHEN** an Agent preset exposes no `contextPressure` projection
- **THEN** transcript, tools, queue and submission remain available
- **AND** OpenNeko does not invent a non-zero pressure value.

#### Scenario: one pressure notification is invalid or stale

- **WHEN** one context-pressure notification has an invalid field or an older source sequence
- **THEN** only that notification is rejected with a local diagnostic
- **AND** sibling Sessions and existing projections remain available.
