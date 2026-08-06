## MODIFIED Requirements

### Requirement: Consumer instances SHALL own independent state

Each Cut document, Canvas View, Preview session and Agent conversation SHALL own its playback state, subscriptions, requests and resource handles. Active selection MUST NOT be used as a fallback owner. Superseded operations and release events SHALL carry exact instance and request identity without a persisted generation, revision, or epoch discriminator.

#### Scenario: Two Canvas Views play media

- **WHEN** two Canvas instances play different sources
- **THEN** each controls and releases only its own elements and registrations
- **AND** selecting one does not retarget the other

### Requirement: Canonical OpenNeko paths are proven and replaced paths are absent

Producer/consumer tests and real Electron scenarios SHALL assert that the exact `openneko` resource handler, package-owned viewer/player and intended native or PCM consumer were reached. Loopback HTTP, `neko-app:`, `neko-media:`, `opennekomedia:`, `MediaTransport`, Desktop upstream proxy, Canvas ordinary PCM and private media schemes MUST be deleted from product registration and imports; no dedicated retired-path handler or compatibility route may remain.

#### Scenario: Cut playback succeeds

- **WHEN** real Electron Cut reaches changing video frames and advancing timeline PCM
- **THEN** evidence records `openneko` Range/stream handling and the Cut PCM client
- **AND** registry and import assertions prove alternate product paths are absent

#### Scenario: Canvas and Preview succeed

- **WHEN** real Electron fixtures load Canvas and Preview media/model/document content
- **THEN** evidence records package-owned consumers and exact resource registrations
- **AND** no loopback, alternate protocol, migration handler, or compatibility adapter is registered or imported

## RENAMED Requirements

- FROM: `### Requirement: Migration SHALL prove OpenNeko and poison replaced paths`
- TO: `### Requirement: Canonical OpenNeko paths are proven and replaced paths are absent`
