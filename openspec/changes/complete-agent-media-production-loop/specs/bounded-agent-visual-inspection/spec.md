## ADDED Requirements

### Requirement: Agent can inspect one authorized video through bounded frame evidence

The Content capability SHALL expose one video-reading Tool that accepts one exact authorized video ContentLocator and returns either one overview contact sheet or one bounded time-window frame strip with measured media metadata. It MUST NOT return a raw local path, full decoded video, unbounded frame sequence or a hidden-model judgment.

#### Scenario: Inspect a video overview

- **WHEN** an image-capable Agent requests overview inspection of one authorized video
- **THEN** Content returns measured duration, dimensions, frame rate and audio presence with one bounded representative-frame contact sheet
- **AND** every frame remains mapped to its source timestamp and exact video locator

#### Scenario: Inspect a suspected defect window

- **WHEN** the Agent requests a supported short time window inside the same video
- **THEN** Content returns one bounded ordered frame strip covering that window
- **AND** the Agent can compare those pixels without loading the full video into model context

### Requirement: Video inspection remains transient and fail-local

Video metadata, overview sheets and frame strips SHALL remain transient DSH Tool evidence. A failed probe, unsupported stream, invalid time window or unauthorized source MUST fail only the current inspection and MUST NOT select another source, model, provider or Workspace.

#### Scenario: Inspection succeeds without adoption

- **WHEN** video inspection completes and the creator has not adopted the candidate
- **THEN** no Canvas node, Asset, Markdown result binding or Cut clip is created
- **AND** the original video remains unchanged

#### Scenario: Requested window is invalid

- **WHEN** the requested time window is outside measured duration or exceeds the bounded policy
- **THEN** the current Tool request fails with an exact diagnostic before frame extraction
- **AND** no alternate overview or timestamp is substituted
