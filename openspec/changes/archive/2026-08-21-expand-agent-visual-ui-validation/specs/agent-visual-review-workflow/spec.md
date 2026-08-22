## ADDED Requirements

### Requirement: Direct visual artifact inspection

The repository UI validation workflow SHALL require an image-capable development Agent to inspect the actual current visual artifact for every required visual acceptance state and SHALL prohibit inferring visual success from artifact existence, filename, scenario status, DOM facts, or prior evidence.

#### Scenario: Current screenshot is reviewed

- **WHEN** a required UI state has been reached and captured
- **THEN** the Agent opens that exact artifact, confirms it depicts the intended state, and records its visual judgment against the matching acceptance item

#### Scenario: Screenshot existence is insufficient

- **WHEN** a runtime report lists a screenshot but the Agent has not inspected its pixels
- **THEN** visual validation for that item remains unexecuted and the overall UI result cannot pass

### Requirement: Observable visual findings

The visual review SHALL evaluate applicable fit, clipping, overlap, text containment, hierarchy, spacing, alignment, readability, contrast, layering, focus visibility, feedback clarity, density, and media or canvas visibility, and SHALL record concrete observed findings rather than an unsupported aesthetic score.

#### Scenario: Defect is visible in the artifact

- **WHEN** the inspected artifact contains an overlapping control, clipped text, blank render surface, unreadable content, or another violated acceptance condition
- **THEN** the Agent records the artifact and observable defect and classifies the item as failed

#### Scenario: No defect is observed

- **WHEN** the artifact visibly satisfies every applicable condition for its acceptance item
- **THEN** the Agent may classify the visual item as passed while keeping functional and lifecycle evidence separate

### Requirement: Visual evidence is captured after settlement

The repository UI validation workflow SHALL distinguish functional readiness from visual settlement and SHALL wait for asynchronous data, media decode, layout, animation, and rendering presentation to settle before capturing or judging the intended stable state.

#### Scenario: Ready state still has transient presentation

- **WHEN** the functional readiness condition succeeds but the visible state may still be loading, animating, decoding media, or applying layout
- **THEN** the owning scenario waits through its bounded visual-settlement window before capturing the artifact

#### Scenario: Media starts with black content

- **WHEN** a captured media frame is black or blank-looking after settlement
- **THEN** the Agent considers fixture timing and expected source content before classifying it, and preserves unresolved timing ambiguity as blocked rather than assuming a rendering failure

#### Scenario: Seekable video has a representative stable state

- **WHEN** stable visual evidence is required for a seekable video or video timeline and the acceptance item does not target a specific start or end state
- **THEN** the owning scenario derives one half of the current finite duration, reaches that timestamp through the user-operable seek path, verifies the presented time, and captures after settlement

### Requirement: Visual uncertainty remains fail visible

The visual review SHALL classify missing, stale, corrupted, blank, unreadable, incomplete, or state-mismatched evidence as blocked unless an observable defect already establishes failure, and SHALL preserve uncertainty in the report.

#### Scenario: Artifact cannot prove the required state

- **WHEN** the Agent cannot reliably identify or inspect the required state in the supplied artifact
- **THEN** the item is blocked with the missing or ambiguous evidence identified and cannot contribute to a passing result

### Requirement: Execution capability separation

The visual review workflow SHALL consume evidence from the authoritative package-owned runtime; supplemental browser or desktop interaction capabilities MAY help observe transient states but SHALL NOT own coverage, replace the authoritative scenario, or define pass criteria.

#### Scenario: Dynamic state needs supplemental observation

- **WHEN** hover, focus, motion, drag, or another transient state cannot be judged from the stable capture alone
- **THEN** the Agent may use an available interaction capability to inspect that state while retaining the package-owned runtime and acceptance inventory as authoritative

### Requirement: Traceable visual report

The UI validation report SHALL map every required visual acceptance item to its current artifact, inspected state, concrete findings, uncertainty, and outcome, and SHALL prevent that report from being marked passed while any required visual item is failed, blocked, missing, or unexecuted.

#### Scenario: Visual report is complete

- **WHEN** all required visual states have been reviewed
- **THEN** the report identifies each artifact and finding and derives the overall result without hiding non-passing items

### Requirement: UI evidence is advisory rather than a code gate

The repository SHALL treat UI validation results as non-blocking reference evidence. A `failed`, `blocked`, missing, or unexecuted UI item SHALL remain visible in the UI report but SHALL NOT change code-quality gate status or block implementation completion, commit, merge, or release.

#### Scenario: UI report contains a failure

- **WHEN** direct visual review identifies a user-visible defect
- **THEN** the UI report remains failed and records the defect while code-gate status remains determined only by independent blocking checks

#### Scenario: UI evidence cannot be produced

- **WHEN** an authoritative graphical runtime or required artifact is unavailable
- **THEN** the UI report records the affected item as blocked without converting that status into a code-gate failure
