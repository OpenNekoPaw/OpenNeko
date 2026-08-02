## ADDED Requirements

### Requirement: Play uses hierarchical LLM and VLA model roles

Play SHALL use an LLM/AgentSession for character expression, rule understanding, long-horizon goals, strategy, collaboration, memory queries and replanning. Real-time visual control SHALL use a VLA or equivalent bounded low-latency control policy for short observation-to-action chunks. The VLA/control policy SHALL NOT own Character canon, durable memory, room timeline or game save state.

#### Scenario: Turn-based strategy game uses structured planning

- **WHEN** a qualified strategy game exposes structured state, legal actions and verifiable turn results
- **THEN** the `game.plan` LLM may select and explain a legal action without invoking a continuous VLA loop
- **AND** the Game Activity owner validates and commits the action at the expected game revision

#### Scenario: Action game requires a real-time loop

- **WHEN** a qualified action game requires reactions faster than the LLM planning budget
- **THEN** the LLM supplies a bounded short-horizon goal and the `game.control` VLA/control model produces action chunks from current observations
- **AND** the LLM replans only at event, goal, failure, timeout or verification boundaries rather than participating in every frame

### Requirement: Play supports game families through a generic capability profile

Game Activity SHALL describe each target through a versioned Game Capability Profile containing observation transport, action space, timing model, seat/team/visibility topology, reset/checkpoint behavior, verification and target qualification. Chara and Agent code SHALL consume this generic contract and SHALL NOT branch on game names to select a dedicated controller.

#### Scenario: Strategy game profile is activated

- **WHEN** a game declares turn-based timing, structured state and discrete semantic actions
- **THEN** the runtime selects the structured planning path and its verification policy from the profile
- **AND** it does not require a game-specific Character Agent implementation

#### Scenario: Multiplayer profile is activated

- **WHEN** a game declares multiple seats, teams or hidden information
- **THEN** the runtime applies per-seat leases, participant visibility and room coordination using the same participant and Activity contracts
- **AND** private team or seat observations remain excluded from ineligible Character contexts

### Requirement: New games adapt without routine model retraining

The normal onboarding path for a new game SHALL use target discovery and qualification, authorized rule/tutorial retrieval, safe observation/action calibration, optional user demonstrations, bounded trial episodes, outcome verification and retrieval-backed in-context adaptation. It SHALL NOT require new base-model training, fine-tuning or a game-specific Agent loop. Inability to adapt within the configured evidence and safety budget MUST remain fail-visible or assisted.

#### Scenario: Character encounters an unseen game

- **WHEN** a previously unseen game exposes a compatible generic observation/action profile and a safe tutorial or checkpoint
- **THEN** the runtime may calibrate controls, retrieve rules, observe a bounded user demonstration and attempt verified practice episodes
- **AND** it records versioned demonstrations and outcomes as removable Game Activity experience rather than modifying model weights or CharacterVersion

#### Scenario: New game cannot be calibrated safely

- **WHEN** target identity, action semantics, reset behavior or result verification cannot be established within the onboarding budget
- **THEN** the integration remains coach, assisted or unavailable according to verified read capability
- **AND** it does not fabricate a specialized profile, continue unbounded exploration or advertise autonomous Play

### Requirement: Game experience is separate from Character memory

Reusable rule summaries, action semantics, demonstrations, failure modes and episode outcomes SHALL belong to a versioned Game Activity experience/playbook projection. Character relationship or narrative memory MAY reference an accepted shared experience, but SHALL NOT become the authority for control policy, game rules or raw trajectories.

#### Scenario: Learned game experience is reused

- **WHEN** a later CharacterRun enters the same compatible game/profile version
- **THEN** Game Activity may retrieve relevant verified demonstrations and failure patterns into the planning context
- **AND** it filters them by profile/version/fingerprint and does not expose another Character's private room or relationship memory

#### Scenario: Game update invalidates experience

- **WHEN** the game version, UI profile, action schema or verification fingerprint changes incompatibly
- **THEN** affected demonstrations and playbook projections become stale and cannot authorize actions
- **AND** the runtime requires recalibration rather than silently replaying old controls

### Requirement: Play-use roles have bounded authority

A Character Play-use binding SHALL declare exactly one of `commentator`, `coach`, `co-player` or `delegate`. Commentator and coach bindings SHALL be read-only; co-player and delegate bindings SHALL require an explicit game seat, control policy and authorized ActivitySession.

#### Scenario: Coach participates without input authority

- **WHEN** a Character joins a Play-use room as a coach
- **THEN** it may consume authorized observations and publish advice to the room
- **AND** it cannot acquire a control lease or submit a state-changing game action

#### Scenario: Delegate controls the user's seat

- **WHEN** the user explicitly starts delegate mode for a qualified game seat
- **THEN** the Character receives a bounded, revocable control lease for that exact seat and ActivitySession
- **AND** the UI exposes Pause, Stop and Take over for the lease lifetime

### Requirement: Play-use reuses Agent, Activity and Host canonical paths

Play-use SHALL execute through the CharacterRun primary AgentSession, typed Tool Call/Activity request, owning Game Activity application service and a qualified structured or Computer Use adapter. Chara SHALL retain only stable Activity references, participation policy and filtered memory candidates; it SHALL NOT own game state, window handles or input injection.

#### Scenario: Character proposes a game action

- **WHEN** an operator Character proposes an action from an authorized observation
- **THEN** the action passes through the existing Agent Tool Call permission, approval, cancellation and transcript path to the Game Activity owner
- **AND** no Character-specific GUI Agent loop or direct Chara-to-OS input path is created

### Requirement: Every writable game seat has one controller lease

Each writable game seat SHALL have at most one active controller lease. Lease acquisition, transfer, pause, resume and release SHALL carry explicit ActivitySession, seat, controller, expected revision and lifecycle identity.

#### Scenario: Two characters request the same seat

- **WHEN** a second Character requests control of a seat whose lease is active
- **THEN** the Game Activity owner rejects the request or completes an explicit atomic transfer
- **AND** both AgentSessions are never allowed to inject actions concurrently for that seat

#### Scenario: Multiple co-players use different seats

- **WHEN** a qualified game exposes two independently addressable seats and two Characters join as co-players
- **THEN** each Character may receive a distinct seat lease with separate action ordering and evidence
- **AND** failure or takeover of one seat does not change the other seat's owner

### Requirement: User takeover and target loss pause automation

The Play-use Host path SHALL pause an active control lease when the user requests takeover, produces conflicting local input, or when application, process, window, seat, focus, visibility or permission binding becomes invalid. Resume SHALL require target revalidation and an allowed pending action state.

#### Scenario: User takes over during delegate play

- **WHEN** the user activates Take over or begins controlling the delegated seat
- **THEN** further Agent actions for that lease stop before the next state-changing input
- **AND** the Character may continue only in an allowed read-only role until the user explicitly reauthorizes control

#### Scenario: Game window identity changes

- **WHEN** the bound game process restarts or the target window can no longer be verified
- **THEN** the Computer Use session pauses with a target-mismatch diagnostic
- **AND** it does not continue against the focused window, a matching title or a recently active application

### Requirement: Play-use automation is bounded and explicitly qualified

A Computer Use-backed Play-use session SHALL bind the exact application, process, window, seat or region, allowed action traits, approval policy, timeout, step budget and evidence policy. It SHALL run a bounded observe, validate, propose, approve when required, act, observe and verify loop. Computer Use SHALL be selected explicitly and SHALL NOT be a silent fallback after a structured adapter failure.

#### Scenario: Structured game adapter fails

- **WHEN** the selected structured Game adapter returns a contract, target or schema failure
- **THEN** the Activity reports that diagnostic and stops the planned action
- **AND** it does not silently switch to arbitrary keyboard, mouse or controller input

#### Scenario: Step budget is exhausted

- **WHEN** a Play-use control loop reaches its configured step budget without verified completion
- **THEN** the session pauses or terminates with a bounded outcome and latest evidence
- **AND** it does not continue through unlimited visual retries

### Requirement: Play-use observations and evidence protect user context

The Host and Game Activity owner SHALL restrict observations to authorized game targets and SHALL redact or omit unrelated applications, secrets, notifications and private inputs. Raw screenshots and live handles SHALL be short-lived; durable records SHALL contain only necessary redacted evidence references, hashes, action summaries and diagnostics.

#### Scenario: Another application overlaps the game window

- **WHEN** an unauthorized application or sensitive surface obscures the bound game region
- **THEN** the Play-use session pauses or returns an unusable-observation diagnostic
- **AND** it does not expose that surface to Character context or persist it in the room transcript

### Requirement: Play-use availability requires real qualification

A game integration SHALL advertise Play-use only after its exact platform, game/application version, target profile, observation path, input path, takeover behavior and verification level have passed real Desktop qualification. Unsupported or unverified combinations SHALL remain unavailable.

#### Scenario: Installed game lacks a qualified profile

- **WHEN** the game is installed but its current version or platform has no qualified Play-use profile
- **THEN** the product may offer manual launch or read-only behavior only when separately supported
- **AND** it does not advertise delegate or co-player control as ready
