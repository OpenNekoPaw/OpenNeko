## 1. Ownership and topology convergence

- [ ] 1.1 Reconcile `define-character-chatroom-play-use` so World core owns only participant, observation, intent, event, state, save and branch semantics, while Game/VLA/seat/Computer Use remains an independent future Activity/Host direction.
- [ ] 1.2 Decide the initial World workspace topology from real dependency closures, register its package role/product status in `quality/package-roles.json`, and document why a single `@neko/world` package or a domain/node/webview family is required.
- [ ] 1.3 Define the canonical public entries, producers, consumers, runtime boundaries and error taxonomy, and add architecture tests that forbid World core/application imports of Electron, React, Renderer, game engine, VLA, Computer Use and package internals.
- [ ] 1.4 Define the user-data inventory, canonical workspace locations and provisional file extensions for WorldProject, WorldVersion, WorldExperienceVersion and WorldSave before any writer is enabled.

## 2. World contracts and codecs

- [ ] 2.1 Implement branded identities and refs for WorldProject, WorldVersion, WorldExperienceVersion, Run, Save, Branch, Participant, WorldActor, Scene, Intent, Event and revisions without unsafe assertions.
- [ ] 2.2 Implement versioned codecs and diagnostics for WorldDefinition, semantic SceneDefinition, StoryScenarioDefinition, WorldCharacterBinding, InteractionDefinition and WorldRule.
- [ ] 2.3 Implement contracts for entry points, participant stance/controller binding, realtime presentation profiles, non-empty required realtime AI capabilities, latency budgets, stream continuity, interrupt/cancel and latency-miss semantics.
- [ ] 2.4 Implement typed WorldActionIntent, WorldEvent, WorldState snapshot and participant-scoped WorldView contracts with strict unknown-version/action rejection.
- [ ] 2.5 Add contract tests for malformed payloads, unknown schemas, unsafe runtime values, mutable/name-only refs, missing identity and cross-run/branch mismatches.

## 3. Authoring and publication

- [ ] 3.1 Implement a headless WorldProject authoring service with explicit target identity, revision CAS, atomic commit, source provenance and no Renderer dependency.
- [ ] 3.2 Implement AI/import authoring candidate lifecycle, material-to-grounding compilation and explicit accept, reject and merge operations that cannot mutate accepted facts implicitly.
- [ ] 3.3 Implement WorldVersion publication that freezes accepted definitions and exact CharacterVersion, Entity, Asset and Content dependencies.
- [ ] 3.4 Implement WorldExperienceVersion publication as an AI-executable generative specification with Story Scenario, Character bindings, entry points, interaction/director policies, realtime presentation profiles, non-empty realtime capability contract, dependency lock, integrity and license/provenance metadata.
- [ ] 3.5 Add producer tests proving publication rejects mutable dependencies, local paths, cache/runtime URLs, secrets, preview Runs, Saves and transcripts.
- [ ] 3.6 Add install/catalog contracts that register an immutable Experience without creating a Run or Save and preserve older installed versions used by existing Saves.

## 4. Runtime and state authority

- [ ] 4.1 Implement WorldExperienceRun creation from an exact Experience version and entry point with explicit participant/controller/stance, actor and initial branch bindings.
- [ ] 4.2 Implement the canonical intent pipeline: strict decode, Host-bound identity, visibility, stance, permission, precondition, registered resolver, rule, approval and expected-revision validation.
- [ ] 4.3 Implement atomic ordered WorldEvent commit and revisioned WorldState transition with typed rejection for stale, unknown, unauthorized and non-visible actions.
- [ ] 4.4 Implement participant- and actor-scoped WorldView materialization across branch ancestry, time, location, visibility, knowledge and committed revision.
- [ ] 4.5 Model Character utterance, Narration and generated presentation evidence separately from objective World facts and state-changing events.
- [ ] 4.6 Add concurrency and isolation tests proving two intents at one revision serialize, stale intents fail, and different Run/branch/participant state never leaks or falls back to an active selection.
- [ ] 4.7 Add a synthetic headless World fixture demonstrating Story opportunity, user action, Character response, state transition and distinct participant WorldViews without Electron or a Renderer.

## 5. Save, branch and replay

- [ ] 5.1 Implement the WorldSave repository port and World-owned codec for immutable Experience baseline, Run/branch ancestry, participant/actor bindings, ordered events, checkpoints and current revision.
- [ ] 5.2 Implement Node atomic file adapters for project/release/save facts using workspace-relative paths and explicit corruption, unknown-version and concurrent-write diagnostics.
- [ ] 5.3 Implement periodic checkpoint creation and restore from compatible checkpoint plus subsequent events, including integrity and baseline validation.
- [ ] 5.4 Implement branch creation from an earlier checkpoint/event without rewriting parent history and provide explicit branch navigation projections.
- [ ] 5.5 Implement replay from committed events without any model call and verify replay remains available when all AI providers are absent.
- [ ] 5.6 Define and test explicit WorldExperienceVersion-to-Save compatibility/migration refusal; do not introduce implicit rebasing or fallback readers.
- [ ] 5.7 Add local-metadata adapters for installed catalog, recent Run, attention, recovery and search projections, and test that projection failure marks stale without overwriting committed project facts.

## 6. Chara, Agent and AI capability composition

- [ ] 6.1 Define narrow World consumer ports for CharacterVersion/CharacterRun, Entity/Content/Asset resolution and AI capability execution without importing owning implementations.
- [ ] 6.2 Implement `WorldActorInstance -> CharacterRun -> primary AgentSession` composition and prove an embodied user-controlled actor does not create a hidden Character Agent.
- [ ] 6.3 Implement isolated Intent Interpreter, Character Agent, World Director, Rule Evaluator and Narrator scopes over the existing Pi/AgentSession canonical path; do not create a World-specific Agent loop.
- [ ] 6.4 Implement immutable per-turn context materialization and exact provider/model/parameter receipts while keeping credentials, hidden model state and unrelated participant facts out of WorldSave and prompts.
- [ ] 6.5 Implement required realtime AI capability resolution with explicit unavailable diagnostics, measured qualification receipts and only explicitly selected author-declared realtime profiles; delete silent model/purpose/profile fallback paths and prove they cannot participate.
- [ ] 6.6 Add adversarial evaluation cases for prompt injection in imported World content, identity/stance spoofing, hidden-knowledge leakage, Director canon mutation, false utterance promotion and cross-run session contamination.
- [ ] 6.7 Run focused real Agent evaluations for intent interpretation, multi-character response, World Director proposal and failure recovery, and record scenario IDs, model bindings, evidence and residual risks.

## 7. Realtime consumption qualification

- [ ] 7.1 Implement target-environment qualification for input acknowledgement, first streamed response, stream continuity/heartbeat, interruption, cancellation, state commit, presentation update, concurrency and resource budgets.
- [ ] 7.2 Require a valid qualification receipt before Run creation or continuation and keep package/Save inspection and committed replay available when realtime AI is absent.
- [ ] 7.3 Implement bound stream lifecycles for Intent Interpreter, Character Agent, World Director, Narrator and required presentation providers using explicit Run/branch/participant/turn/Scene/source-revision identity.
- [ ] 7.4 Implement interruption, cancellation and newer-intent supersession so obsolete chunks, proposals and presentation results cannot commit or render.
- [ ] 7.5 Implement deadline, stream-loss and resource-budget diagnostics that pause/fail the affected capability without changing model, purpose, profile or execution path.
- [ ] 7.6 Add sustained-latency and adversarial tests for provider jitter, first-response timeout, broken heartbeat, cancellation refusal, late chunks, Scene/revision changes and multi-role concurrency.
- [ ] 7.7 Keep ordinary GenerationJob/offline render APIs unregistered for active Runs and add path tests proving non-realtime image/video creation exists only in authoring, publication preparation or post-Run export.

## 8. World experience and presentation

- [ ] 8.1 Implement the package-owned World Webview host contract for snapshot-first attach, participant WorldView streams, bound user intents, exact renderer session and request identity, interruption, cancellation and disposal.
- [ ] 8.2 Build the first streaming-text plus illustrated-2D realtime Experience surface using shared UI primitives, including scene, visible characters, narration/dialogue, world context, suggested affordances, free-form input and event/branch access.
- [ ] 8.3 Implement explicit transition between separately qualified realtime presentation profiles so they consume one WorldView and intent path without copying state or silently degrading.
- [ ] 8.4 Integrate durable Entity/Asset/Content grounding and representation plus qualified realtime Voice/Live2D descriptors through owning public ports; keep ordinary GenerationJob, local paths, provider payloads and runtime URLs out of World runtime and facts.
- [ ] 8.5 Add Webview tests for rapid input, interruption, stale views, reload, StrictMode, explicit profile transitions, missing representation, capability loss and late AI responses without duplicate intents, commits or presentation overwrite.

## 9. Desktop composition and World Library

- [ ] 9.1 Add sender-bound Desktop World contracts and preload projection for Library, work detail, realtime qualification, launch, Run attachment, Save/branch selection and World Webview lifecycle.
- [ ] 9.2 Compose package-owned World authoring/publication/runtime/persistence services in Desktop Main with explicit repository, Chara, Agent, Content/Asset, realtime AI, settings and resource adapters; retain no host-neutral World workflow in `apps/neko-desktop`.
- [ ] 9.3 Add the lightweight World Library to Desktop Home for installed/authored works, recent Runs, Saves, branches, realtime capability/qualification status and attention without game lobby/achievement/engine settings.
- [ ] 9.4 Add work detail and launch setup for exact version, entry point, stance, optional embodied Character, new/existing Save or branch and a qualified author-supported realtime presentation profile.
- [ ] 9.5 Replace the current World unavailable projection only after the full package producer/consumer and realtime qualification path is registered; add consumer/path tests proving empty-view, mock-repository, no-op-handler, inference-free continuation and app-owned World success paths are absent or cannot participate.
- [ ] 9.6 Add a real Electron isolated-fixture scenario covering Home -> World detail -> qualification -> new Run -> realtime user interaction -> interrupted Character response -> Save -> reload -> continue -> branch -> close, including latency evidence, IPC identity, resource revocation and disposal assertions.

## 10. Documentation and quality gates

- [ ] 10.1 Add `docs/domains/world/README.md` and `architecture.md`, update domain navigation, package boundaries, application composition and roadmap status only after the implemented realtime path matches this design.
- [ ] 10.2 Document the creator/user mental model for WorldProject, WorldVersion, WorldExperienceVersion, Run and Save; distinguish traditional inference-free works from consumption-time AI Worlds and exclude Game Engine, VLA, Computer Use, asynchronous runtime Generation and generated-media fact ownership.
- [ ] 10.3 Run focused World package tests/typecheck, producer/consumer contract tests, realtime qualification tests and Node persistence tests and record the exact commands and results.
- [ ] 10.4 Run `pnpm test:agent:eval` plus the focused real Agent realtime evaluation scripts; state explicitly which evidence is harness-only and which exercises a real model path with measured latency/interruption.
- [ ] 10.5 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:application-boundaries`, `pnpm check:legacy-debt` and `pnpm check:unused`, fixing canonical-path failures rather than adding compatibility fallback.
- [ ] 10.6 Run the sustained real Electron World functional scenario outside CI and `pnpm package:desktop` where applicable, then record host/version, model/provider binding, latency percentiles, interruption/cancellation evidence, sanitized artifacts, unexecuted gates and residual risks.
- [ ] 10.7 Complete `neko-quality-review` against the final diff and verify producer tests, Desktop delegation tests, realtime runtime path evidence and deletion, registration-absence or fail-closed proof for every replaced or newly enabled route.
