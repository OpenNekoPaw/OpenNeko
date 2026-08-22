## ADDED Requirements

### Requirement: Consumption-time AI is required only when declared by the Experience

Starting or continuing a WorldExperienceRun SHALL resolve and qualify only the selected WorldExperienceVersion's required realtime AI capabilities. An Experience with no consumption-time AI requirement MAY accept new interaction through its registered deterministic actions and supported Interaction Surface. When a declared required AI capability is unavailable, package/Save inspection, deterministic sibling capabilities and committed replay SHALL remain available, but the system MUST NOT substitute a deterministic, pre-rendered or different-provider success path for that required AI operation.

#### Scenario: Continue a profile with realtime AI available

- **WHEN** a user continues a Save and all required realtime AI bindings for the selected profile remain qualified
- **THEN** runtime creates or resumes the live inference scopes and accepts new interaction

#### Scenario: Continue a deterministic Experience without realtime AI

- **WHEN** a user continues a Save whose Experience declares only registered deterministic actions and a supported Interaction Surface
- **THEN** runtime accepts those interactions without resolving a provider/model binding

#### Scenario: Required realtime AI is unavailable

- **WHEN** a user attempts an operation whose exact required realtime AI binding is absent or unqualified
- **THEN** only that operation or dependent profile remains unavailable with a diagnostic while deterministic sibling interaction, inspection and committed replay remain unchanged

### Requirement: Experience declares a testable realtime contract

Each realtime Experience profile SHALL declare input acknowledgement, first meaningful streamed response, stream continuity or heartbeat, interruption, cancellation, state-commit, presentation-update, concurrency and latency-miss semantics in a machine-readable contract. Concrete budgets SHALL be qualified on explicit target hardware and provider bindings rather than accepted from provider metadata alone.

#### Scenario: Qualify a realtime profile

- **WHEN** a Host evaluates a candidate provider/model/presentation binding on a supported target
- **THEN** it records measured qualification evidence for every required realtime dimension before the profile can launch

#### Scenario: Reject an incomplete realtime contract

- **WHEN** a WorldExperienceVersion omits interruption, cancellation, deadline or latency-miss behavior for a required realtime capability
- **THEN** publication or launch qualification fails visibly

### Requirement: Realtime generation is streamed and interruptible

AI roles declared required by the selected Experience SHALL produce bounded streaming progress or heartbeat and SHALL support interruption and cancellation tied to Run, branch, participant, turn and source World revision. User interruption or a newer authoritative intent SHALL revoke obsolete generation before another result can commit.

#### Scenario: User interrupts a Character response

- **WHEN** the user interrupts an in-progress Character or Narrator stream
- **THEN** runtime cancels the bound generation, prevents later chunks from committing or rendering, and re-materializes context for the next intent

### Requirement: Deadline violations fail visibly

When a required AI or presentation binding misses its declared realtime deadline, loses its stream, violates its resource budget or cannot honor cancellation, runtime SHALL mark the affected capability unavailable or paused and return a typed diagnostic; it MUST NOT silently change model, purpose, profile or execution path.

#### Scenario: Realtime provider exceeds the deadline

- **WHEN** a required provider produces no qualifying response within the selected profile's deadline
- **THEN** the active operation fails or pauses visibly, no success event is fabricated, and retry requires a fresh binding to the current revision

### Requirement: Late AI output cannot change the current World

Every streamed proposal and presentation chunk SHALL remain bound to its original Run, branch, participant, turn, Scene and source World revision. Output received after cancellation, deadline, identity change or revision advance MUST be rejected before commit or projection.

#### Scenario: Scene changes before image completion

- **WHEN** a realtime image candidate completes after the participant has moved to another Scene or the source World revision advanced
- **THEN** the candidate is rejected from the active presentation and cannot overwrite the current Scene or become a World fact

### Requirement: Non-realtime generation belongs to traditional creation

Ordinary image/video GenerationJob, offline rendering and other creation that cannot satisfy the realtime contract SHALL run only in World authoring, publication asset preparation or post-Run traditional export paths. Such jobs MUST NOT be required, awaited or attached later as an enhancement success path for an active World Run.

#### Scenario: Prepare a cinematic asset during authoring

- **WHEN** an author generates a video that cannot meet realtime qualification
- **THEN** Generation owns the Job and output until it is durably accepted as a published reference asset, and active World runtime never invokes that Job path

#### Scenario: Export a completed World branch

- **WHEN** a user exports committed WorldSave history as a video, comic, script or other traditional work
- **THEN** the export runs as a separate creation Job and cannot modify the source Run, Save or WorldExperienceVersion
