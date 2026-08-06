## 1. Architecture and contracts

- [x] 1.1 Synchronize Chara domain and package-boundary documentation with the single/multi-character × dialogue/play product model, LLM/VLA split, memory/context ownership, generic game capability and unavailable status.
- [ ] 1.2 Define versioned Chara-owned participant, controller, CharacterRun binding, dialogue/play preset and room-event contracts with strict codecs and fixtures.
- [ ] 1.3 Define Game/Activity-owned GameCapabilityProfile, ActivitySession, observation/action space, seat, control-lease, verification and episode-experience contracts without importing Electron or Chara internals.
- [ ] 1.4 Define exact `character.dialogue`, `game.plan`, `game.observe` and `game.control` model-role contracts plus revisioned Context Materializer input/output contracts.
- [ ] 1.5 Add architecture tests proving Chara, Agent, Game/Activity, Desktop Host and Renderer dependency directions and rejecting shared responder/session/input-control or per-game Character controller ownership.

## 2. Character interaction application runtime

- [ ] 2.1 Implement Chara application services that validate the four product presets and create independent agent-controlled CharacterRun bindings while preserving human-controlled participants.
- [ ] 2.2 Implement a revisioned dialogue/play room timeline with explicit actor, visibility, source turn/action and expected-revision commits.
- [ ] 2.3 Implement participant Context Materializer orchestration over frozen profile, authorized memory, game playbook, room visibility, current observation, goal and effective model/permission/control receipts.
- [ ] 2.4 Implement bounded turn scheduling for mentioned, turn-based, autonomous and observer policies without feeding continuous raw frames into durable transcripts.
- [ ] 2.5 Add producer tests for independent CharacterVersion/profile/model/memory snapshots, stale context/room rejection and no cross-participant private information.

## 3. Agent, LLM and VLA composition

- [ ] 3.1 Add package-owned Agent adapter contracts that map each active agent-controlled CharacterRun to exactly one primary Pi AgentSession.
- [ ] 3.2 Resolve exact per-participant dialogue, planning, observation and control model bindings into immutable turn/action snapshots with capability and provenance receipts.
- [ ] 3.3 Implement the LLM planner boundary for character expression, long-horizon goals, strategy, collaboration, memory queries and bounded VLA goals.
- [ ] 3.4 Implement the VLA/control adapter boundary for cropped observations, short-horizon goals, allowed action spaces, bounded action chunks, cancellation and verification feedback.
- [ ] 3.5 Add tests for config revision, latency/step budgets, model capability/credential diagnostics, no cross-participant state and no purpose/default-model fallback.
- [ ] 3.6 Run focused Character dialogue, room scheduling, LLM/VLA handoff and Play Agent evaluations through the canonical Desktop/Pi path.

## 4. Generic Game Activity and rapid adaptation

- [ ] 4.1 Implement the owning Game Activity application service that validates generic strategy, real-time action and multiplayer GameCapabilityProfiles.
- [ ] 4.2 Implement target discovery, authorized rule/tutorial retrieval, safe observation/action calibration and version/fingerprint compatibility checks.
- [ ] 4.3 Implement structured turn-based planning and bounded real-time VLA action-chunk execution through the same Activity action/verification contract.
- [ ] 4.4 Implement optional user-demonstration capture, bounded practice episodes, outcome evaluation and retrieval-backed experience/playbook projection without changing model weights.
- [ ] 4.5 Implement commentator, coach, co-player and delegate policies with per-seat exclusive control leases and atomic transfer.
- [ ] 4.6 Implement bounded observe/validate/propose/approve/act/observe/verify orchestration over an explicit structured or qualified Computer Use transport.
- [ ] 4.7 Add tests for unseen-game calibration, incompatible profile invalidation, target mismatch, user input, Pause/Stop/Take over, lease conflict, step exhaustion, cancellation and resource disposal.
- [ ] 4.8 Prove that failed adapters/calibration do not fall back to arbitrary input, unbounded exploration, per-game Character controllers or hidden online model training.

## 5. Desktop and Webview composition

- [ ] 5.1 Add sender-bound Desktop Host adapters for exact app/process/window/seat binding, OS permissions, cropped observations, allowed input traits and lease lifecycle.
- [ ] 5.2 Add product projections for the four presets plus participant, model-role, visibility, learning/calibration and live Activity state without Renderer-owned authority.
- [ ] 5.3 Add product entry, role/model configuration and always-visible Pause/Stop/Take over controls only after the owning Chara, Agent and Game ports are available.
- [ ] 5.4 Keep unfinished, retired, per-game shortcut and active-conversation fallback routes unregistered; add consumer tests proving only the canonical generic path succeeds.

## 6. Qualification and delivery

- [ ] 6.1 Create isolated synthetic fixtures for all four product presets, a structured strategy game, a low-latency action game, multiplayer visibility, memory isolation and an unseen compatible game.
- [ ] 6.2 Qualify at least one exact game/application version for each claimed strategy/action/multiplayer capability and OS/architecture, including target binding, observation, input, takeover and evidence.
- [ ] 6.3 Measure planning latency, control-loop latency, context budgets, adaptation episode bounds and model/token cost; keep unsupported combinations assisted or unavailable.
- [ ] 6.4 Run affected package tests, `pnpm build`, `pnpm test`, `pnpm check`, focused Agent evaluations and real Electron scenarios; record commands, results and canonical-path evidence.
- [ ] 6.5 Run `pnpm check:legacy-debt` and `pnpm check:unused`, document unsupported games/platforms and residual generalization, privacy, latency and control risks.
