## ADDED Requirements

### Requirement: DSH authoring does not expose content fingerprints

Canvas and Cut DSH Tools SHALL expose model intent without fingerprint algorithms or values. `ContentFingerprint`
SHALL remain an internal Content/authoring precondition and SHALL NOT be part of model-visible Tool input or output.

#### Scenario: Model queries a creative document

- **WHEN** Canvas or Cut returns bounded document facts
- **THEN** the result SHALL omit fingerprint strategy and value
- **AND** the document remains identified by its canonical Workspace-relative target

#### Scenario: Model submits a mutation

- **WHEN** the model supplies the exact document target and a valid Canvas or Cut mutation
- **THEN** the Host SHALL query the same exact document and pass the observed fingerprint internally to the owning
  CAS-protected authoring service
- **AND** the Tool input SHALL NOT require an `expectedFingerprint`

#### Scenario: Concurrent content changes after Host query

- **WHEN** the document changes between the Host-owned query and atomic write
- **THEN** the existing internal CAS SHALL reject the current mutation with a stale/conflict diagnostic
- **AND** the Host SHALL NOT retry with a newer fingerprint or another document

#### Scenario: Retired fingerprint input is submitted

- **WHEN** a Tool request contains `expectedFingerprint`, fingerprint strategy/value or another undeclared freshness
  field
- **THEN** the strict owning decoder SHALL reject that request locally
- **AND** no compatibility decoder or mutation SHALL run

### Requirement: ContentLocator remains separate from freshness

Cross-application content sources SHALL use canonical `ContentLocator`. Fingerprints SHALL NOT be added to the locator,
used as resource identity, or required from the model.

#### Scenario: Internal freshness changes

- **WHEN** the content at one canonical locator changes
- **THEN** internal consumers MAY refresh provenance, previews or CAS state
- **AND** the locator-backed resource identity SHALL remain unchanged
