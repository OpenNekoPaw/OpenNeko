# desktop-ui-visual-coverage Specification

## Purpose
TBD - created by archiving change expand-agent-visual-ui-validation. Update Purpose after archive.
## Requirements
### Requirement: Application Shell visual states

The app-owned Desktop Workbench scenario SHALL capture focused visual evidence for the application Sidebar in compact and restored presentations and for the Settings Workbench after its canonical navigation and Main composition is visible.

#### Scenario: Sidebar cycle is visible

- **WHEN** the application Sidebar completes its compact and restored resize cycle
- **THEN** the scenario captures the compact and restored visual states so controls, content fit, and surrounding layout can be reviewed

#### Scenario: Settings composition is visible

- **WHEN** the Settings scene is active in the unified Workbench
- **THEN** the scenario captures its navigation and Main composition as a dedicated visual artifact

### Requirement: Cut visual states

The Cut Webview package-owned Desktop scenario SHALL capture stable visual evidence for the ready editor, active playback or seek feedback, and the post-authoring state after the scenario's canonical changes are visible.

#### Scenario: Cut editor visual cycle is captured

- **WHEN** the Cut scenario reaches ready, trusted playback/seek, and completed authoring states
- **THEN** it records focused screenshots for those states before reporting functional success

#### Scenario: Cut visual evidence uses the timeline midpoint

- **WHEN** the Cut scenario captures a stable editor, seek, or post-authoring video presentation
- **THEN** it derives one half of the current timeline duration, seeks there through the Cut ruler, verifies the displayed time, and only then settles and captures

### Requirement: Preview viewer visual matrix

The Preview Webview package-owned Desktop scenario SHALL capture the ready visual state of every supported viewer in its authoritative image, audio, video, PDF, GLB, and glTF matrix before closing the corresponding tab.

#### Scenario: Every viewer has current visual evidence

- **WHEN** a viewer in the supported matrix reaches its existing readiness condition
- **THEN** the scenario captures a viewer-specific screenshot before release and includes all six artifact references in the result

#### Scenario: Preview video evidence uses the media midpoint

- **WHEN** the Preview video has a finite positive duration and is ready for visual capture
- **THEN** the scenario pauses playback, seeks through the video progress control to one half of that duration, verifies the presented time, and only then settles and captures

### Requirement: Package-owned coverage path

Visual capture SHALL remain in the scenario owned by the UI surface, SHALL reuse the existing neutral Desktop runner, and SHALL NOT introduce a central feature-dispatch path, product test-only success route, or GUI execution in CI.

#### Scenario: Coverage grows without a parallel runner

- **WHEN** the focused Sidebar, Settings, Cut, and Preview states are added
- **THEN** the existing scenario registry and runner execute them through their current owners without a new runtime or product contract

### Requirement: Package-owned captures wait for visual settlement

Each owning Desktop scenario SHALL wait through a bounded visual-settlement window after the state's semantic readiness condition and before capturing the stable visual artifact.

#### Scenario: Asynchronous state reaches functional readiness

- **WHEN** Sidebar layout, Settings data, Cut media, or a Preview viewer reaches its functional readiness condition
- **THEN** the owning scenario allows pending presentation work to settle before taking the screenshot used for visual judgment

### Requirement: Local-only deterministic coverage contract

An explicit local UI contract SHALL verify the required focused screenshot states and SHALL fail visibly when an owner removes or stops returning the expected visual evidence. The contract and graphical scenarios SHALL remain unreachable from generic checks, code gates, CI aliases, and GitHub Actions; generic orchestration tests MAY verify only that separation.

#### Scenario: Required visual state is removed

- **WHEN** a package-owned scenario no longer captures a required Sidebar, Settings, Cut, or Preview state
- **THEN** the explicitly invoked local coverage contract fails and identifies the missing owner state without changing code-gate status
