## ADDED Requirements

### Requirement: Real Agent evaluation uses the canonical Desktop session owner

Provider-backed Agent Evaluation MUST launch Electron Desktop and enter the same sender-bound Agent
controller, Pi conversation runtime, Pi Session, permission, Tool/Skill and projection composition used by
the product. It MUST NOT restore TUI/VS Code hosts, import a direct turn runner, construct a legacy
`AgentSession`, or substitute mock/final-text success.

#### Scenario: Canonical Desktop turn executes

- **WHEN** an indexed real case submits a user message for an explicit fixture Project, Workspace and Conversation
- **THEN** the message enters through the Desktop renderer/preload Agent bridge and sender-bound controller
- **AND** facts prove the Pi conversation, Pi Session, Product Turn, permission and authoritative projection path
- **AND** retired hosts, direct runtime calls, active-object inference and mock providers did not participate

#### Scenario: Complete-session driver is unavailable

- **WHEN** the Desktop driver, required facts, credentials, network or selected provider/model is unavailable
- **THEN** the case returns an exact infrastructure-blocked or infrastructure-fail diagnostic as applicable
- **AND** it does not fall back to key-free output, a direct runtime call, another Host or default success

### Requirement: Evaluation samples use isolated Desktop application lifecycles

Every real sample MUST own an isolated fixture home, Electron `userData`, Workspace, global storage, Pi Session,
SQLite catalog, Conversation, control/debug port and report identity. Unrelated samples MUST NOT share mutable
Desktop application state.

#### Scenario: Two samples run concurrently

- **WHEN** the matrix schedules two Desktop samples at the same time
- **THEN** each process uses distinct application/user/workspace/conversation identities and storage roots
- **AND** single-instance locking, credentials, settings, session data, ports, caches and reports do not collide

#### Scenario: A sample finishes

- **WHEN** the case reaches success, behavior failure, timeout, cancellation or infrastructure failure
- **THEN** Desktop detaches renderer bindings, reaches or diagnoses terminal state, releases leases and handles,
  closes the application process and records disposal evidence
- **AND** cleanup failure remains visible and cannot be reported as a successful sample

### Requirement: Hidden and visible execution share one Desktop path

The system MUST support hidden Desktop Session Matrix execution and visible Desktop Acceptance execution through
the same executable, preload, Agent bridge, AppHost composition, configuration and facts contract for a given
comparable target. Hidden execution does not require visual assertions; visible execution may display and interact
with the window when the Scenario requires graphical evidence.

#### Scenario: Hidden matrix sample executes

- **WHEN** a non-visual Agent scenario is selected for batch execution
- **THEN** Desktop loads the real renderer and fixed preload without showing the window
- **AND** user-equivalent Agent messages, approval and lifecycle operations still traverse the ordinary bridge

#### Scenario: Visible protected scenario executes

- **WHEN** a case requires focus, approval UI, Timeline rendering, reload or window lifecycle evidence
- **THEN** the same driver runs it with a visible Electron window and explicit UI/runtime assertions
- **AND** browser-only, Main-only or hidden-output evidence does not replace the required visible acceptance

### Requirement: Desktop exposes bounded evaluation-neutral facts

Desktop MUST expose versioned, bounded facts from authoritative owners for execution identity, effective
configuration, Prompt/Skill/Tool receipt, permission, process state, projection, persistence, usage, diagnostics
and disposal. Facts MUST NOT contain suite, case, variant, baseline, score, pass/fail, secret, absolute user path,
raw Host object or arbitrary runtime handle.

#### Scenario: Runner reads terminal facts

- **WHEN** a turn, Tool/Skill workflow and persistence checkpoint reach terminal state
- **THEN** the driver can read matching application/window/workspace/conversation/session/turn/run/tool identities,
  configuration digest, projection revision, terminal state and zero-fallback evidence
- **AND** the external Evaluation platform alone evaluates assertions and assigns the outcome

#### Scenario: Required facts are missing or truncated

- **WHEN** a required owner fact is absent, its identity does not match, or a bounded collection reports dropped data
- **THEN** the case is blocked, failed or configuration-invalid according to the owning phase
- **AND** final answer text, DOM inference, logs or weak metadata cannot replace the missing evidence

### Requirement: Complete-session controls preserve product identity and security

Automation controls MUST be fixed, typed, enabled only by an explicit isolated fixture launch and bound to the
current Desktop sender/session identities. They MUST NOT expose arbitrary IPC, arbitrary commands, filesystem,
shell, credentials, SQLite paths or owner selection.

#### Scenario: Driver confirms a Tool request

- **WHEN** the selected case approves or denies a pending Tool Call
- **THEN** the action is bound to the exact Workspace, Conversation, turn/run and tool-call identity through the
  normal Desktop approval path
- **AND** stale, missing or mismatched identity fails visibly without approving another request

#### Scenario: Non-fixture Desktop is launched

- **WHEN** ordinary Desktop starts without the explicit isolated automation launch contract
- **THEN** automation-only controls and fact retrieval are unavailable
- **AND** production renderer code cannot enable them or acquire broader Host access

### Requirement: Full lifecycle cases prove persistence and recovery

The driver MUST support multi-turn submit/queue/cancel/confirm, terminal idle, renderer reload, conversation resume,
application restart where required, and final disposal without bypassing the owning Desktop lifecycle.

#### Scenario: Conversation reloads and resumes

- **WHEN** a case completes a durable turn, reloads the renderer or restarts the fixture Desktop, restores the exact
  Conversation and submits a continuation
- **THEN** Pi Session and SQLite catalog restore matching identities and history before the continuation executes
- **AND** renderer state, active-conversation fallback or a second transcript does not hydrate the session

#### Scenario: Foreground run is cancelled

- **WHEN** a case cancels an explicitly identified active run and waits for complete idle
- **THEN** the Pi run, continuation queue, Tool/Job projection and durable checkpoint reach an asserted terminal state
- **AND** application shutdown does not claim success while resources or persistence remain unknown

### Requirement: The Desktop driver exposes operations, not case semantics

The Desktop driver MUST expose fixed typed product-equivalent operations and bounded neutral facts. It MUST NOT own
suite discovery, Scenario ids, Skill authoring, assertion selection, ablation variants, scores or outcomes. Package-
specific visible checks MUST remain in owning functional scenarios or validators while reusing the common Desktop
process and interaction primitives.

#### Scenario: A new workflow case is authored

- **WHEN** the Scenario uses submit, queue, cancel, confirm, resume, idle, reload or disposal operations already
  supported by the public Desktop path
- **THEN** the common workflow interpreter invokes the existing driver operations in declared order
- **AND** the Desktop driver is unchanged and does not branch on the case id

#### Scenario: A new product operation is required

- **WHEN** no current public product operation or neutral fact can express required user behavior or evidence
- **THEN** the owning product contract is reviewed and minimally extended before the case can execute
- **AND** Evaluation remains blocked instead of generating direct IPC, DOM inference or a case-specific bypass
