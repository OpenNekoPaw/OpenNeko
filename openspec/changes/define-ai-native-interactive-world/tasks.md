## 0. 当前 World Foundation 交付切片

- [x] 0.1 定义单一 package-owned World Foundation host contract 与 strict codec，覆盖 snapshot、Project/Version authoring、确定性 preview Run、事实事件、Save branch 和 committed replay，不声明 WorldExperience。
- [x] 0.2 在 `@neko/world` 实现 Foundation query/command application service 和唯一确定性事实 action handler；所有命令携带精确 project/version/run/save/branch/revision identity，非法记录或 stale revision 必须 fail-local。
- [x] 0.3 在 `@neko/world-webview` 实现 World Library、Foundation Studio 和基础预览，复用共享设计 token，并明确展示完整 Experience、Story、Gameplay、游戏引擎和世界模型仍未启用。
- [x] 0.4 在 Desktop Main/preload/renderer 组合 World public services、sender-bound typed IPC 和当前 scene；Desktop 不解释 World 业务命令，不建立第二事实来源或保留隐藏 Root。
- [x] 0.5 添加 contract/application/Webview/Desktop delegation 测试，运行 focused typecheck/test、严格 OpenSpec、质量门禁、构建和真实 Electron UI 验收，并记录未覆盖的完整 Experience 风险。

## 0A. 下一交付切片：Content-to-Experience 与持续世界改造基础

- [x] 0A.1 修订 proposal/design/spec，删除所有 World 强制消费期 AI/Web/引擎/World Model 的假设，定义至少一个 Interaction Surface 与作品级 required/optional capability requirements。
- [x] 0A.2 在 `@neko/world` 定义 owner-qualified authoring/transformation candidate、semantic diff、capability requirement/resolution/gap 和 strict codec；不创建通用跨 owner 可写 document 或任意代码执行 contract。
- [x] 0A.3 实现 deterministic capability resolver 与 World transformation planning service：按 state、structure、Story/Quest、Gameplay/Interaction、Character canon、Presentation 分类，精确隔离 missing/stale/unauthorized candidate。
- [x] 0A.4 将当前 Foundation fact set/delete 接入 transformation state plan，证明最终仍只命中 canonical `WorldRuntimeService` handler/event/state 链，不建立第二 commit authority。
- [x] 0A.5 在 World Studio 增加 Sources/Candidates/Diff/Capability Diagnostics 的最小可操作投影，并保留完整 Experience unavailable，直到 composition 和至少一个正式 Interaction Surface producer 完成。
- [x] 0A.6 添加 contract/application/Webview/Desktop tests、严格 OpenSpec 与质量门禁；Agent authoring compiler/Intent Interpreter/Character/Director cases 在真实 provider 路径存在前记录为 Evaluation `create/update` 计划而不是用 mock 声明行为通过。

## 1. Ownership and topology convergence

- [ ] 1.1 Reuse the implemented `define-character-dialogue-chatroom-world-foundation` WorldVersion/Run/Intent/Event/State/View/Save/branch authority; keep Agent Play, Browser/Computer Use, VLA and Host control outside World facts while allowing authored in-World rules to live in the independent World Gameplay subcapability.
- [ ] 1.2 Decide the initial World workspace topology from real dependency closures, register its package role/product status in `quality/package-roles.json`, and document why a single `@neko/world` package or a domain/node/webview family is required.
- [ ] 1.3 Define the canonical public entries, producers, consumers, runtime boundaries and error taxonomy, and add architecture tests that forbid World core/application imports of Electron, React, Renderer, game engine, VLA, Computer Use and package internals.
- [ ] 1.4 Define the user-data inventory, canonical workspace locations and provisional file extensions for WorldProject, WorldVersion, WorldExperienceVersion and WorldSave before any writer is enabled.
- [ ] 1.5 Freeze the capability topology: World Definition/Runtime, World Story, World Gameplay, World Experience and World Presentation have independent aggregates/contracts; Chara owns Character and Character Story; Agent owns Play; creative tools own their artifacts; external games retain their own Game authority.
- [ ] 1.6 Add architecture and contract tests that poison Character mutation from World, World mutation from Character, latest/active Character rebinding and UI-owned Activity/Game state paths while valid sibling records remain usable.
- [ ] 1.7 Document and test the distinction between World product capability grouping and domain ownership so no unified World service, Session, store or Save can absorb Story, Gameplay, Character and presentation facts.

## 2. World contracts and codecs

- [ ] 2.1 Implement branded identities and refs for WorldProject, WorldVersion, WorldExperienceVersion, Run, Save, Branch, Participant, WorldActor, Scene, Intent, Event and revisions without unsafe assertions.
- [ ] 2.2 Implement one canonical codec and diagnostics for WorldDefinition, semantic SceneDefinition, WorldActorBinding, InteractionDefinition and WorldRule without internal codec generations or version dispatch.
- [ ] 2.3 Implement contracts for entry points, participant stance/controller binding, realtime presentation profiles, non-empty required realtime AI capabilities, latency budgets, stream continuity, interrupt/cancel and latency-miss semantics.
- [ ] 2.4 Implement typed WorldActionIntent, WorldEvent, WorldState snapshot and participant-scoped WorldView contracts with one canonical shape and strict unknown-field/action rejection.
- [ ] 2.5 Add contract tests for malformed payloads, unknown schemas, unsafe runtime values, mutable/name-only refs, missing identity and cross-run/branch mismatches.

## 3. Story and Gameplay ownership

- [ ] 3.1 Define `WorldStoryProject -> WorldStoryVersion -> WorldStoryRun` contracts and repositories independently from WorldProject/WorldRun, including chapter/beat/conflict progress and committed-source validation.
- [ ] 3.2 Consume Chara-owned `CharacterStorylineVersion -> CharacterStorylineRun` public refs/ports from World Experience without redeclaring the Chara aggregate shape.
- [ ] 3.3 Add isolation tests proving one CharacterVersion can participate in multiple WorldStoryVersions through distinct CharacterStorylineRuns without cross-World memory/progress leakage or active/latest fallback.
- [ ] 3.4 Define the explicit Chara-owned cross-World journey/transition operation with exact source/target Runs, reviewable candidates and no World-fact-to-Character-canon promotion.
- [ ] 3.5 Define `WorldGameplayDefinition -> WorldGameSession` contracts for authored Gameplay goals, seats, observation/action spaces, rules, state, outcome and result verification.
- [ ] 3.6 Define the shared Agent Play consumer boundary for WorldGameSession and external GameSession, proving Play owns planning/proposal/control while each Gameplay/Game owner validates actions and results.
- [ ] 3.7 Add headless Story and Gameplay fixtures plus path tests that forbid concrete Engine, VLA, Computer Use, Renderer and external game adapter dependencies from World Definition/Runtime core.

## 4. Authoring and publication

- [ ] 4.1 Implement separate headless authoring services for WorldProject, WorldStoryProject, WorldGameplayDefinition and WorldExperienceProject with explicit target identity, revision CAS, source provenance and no Renderer dependency.
- [ ] 4.2 Implement creative-intent/content compilation into owner-qualified World/Scene, Story/Quest, Character binding, Gameplay/Interaction and Presentation candidates with provenance, semantic diff, capability gaps and explicit accept/reject/merge routed to the exact owning aggregate.
- [ ] 4.3 Implement WorldVersion and WorldStoryVersion publication and consume published CharacterVersion/CharacterStorylineVersion refs without copying another owner's facts.
- [ ] 4.4 Implement WorldExperienceVersion publication from an Experience composition that pins exact World, World Story, Character, Character Story, optional World Gameplay, entry, mapping, interaction/director, required/optional capabilities and interaction/execution/presentation references without forcing consumption-time AI.
- [ ] 4.5 Add producer tests proving publication rejects mutable dependencies, local paths, cache/runtime URLs, secrets, preview Runs, Saves and transcripts.
- [ ] 4.6 Add install/catalog contracts that register an immutable Experience without creating a Run, Save, StoryRun or GameSession and preserve older installed versions used by existing Saves.
- [ ] 4.7 Implement World Studio actor/story/gameplay binding as exact published selection only; provide typed handoffs to Character Studio and creative tools and prove no World-local CharacterProject, copied Story definition or tool-owned World fact path exists.
- [ ] 4.8 Add Canvas/Cut/Text/Assets/Generation/Preview boundary tests proving tools retain artifact ownership and all accepted semantic mutation enters through the exact World subcapability authoring service.

## 5. Runtime and state authority

- [ ] 5.1 Implement WorldExperienceRun as a composition binding over exact WorldRun, WorldStoryRun, CharacterRun/CharacterStorylineRun, participant, optional WorldGameSession and execution/presentation identities without copying their state or lifecycle.
- [ ] 5.2 Implement owner-qualified intent pipelines and prove WorldActionIntent, Story progress intents and Gameplay actions cannot be decoded or committed by the wrong owner.
- [ ] 5.3 Implement atomic ordered WorldEvent commit and revisioned WorldState transition with typed rejection for stale, unknown, unauthorized and non-visible actions.
- [ ] 5.4 Implement committed-event-to-progress-candidate flow so World Story and Character Story independently accept progress without distributed transactions or candidate-as-success projection.
- [ ] 5.5 Implement participant- and actor-scoped WorldView materialization across branch ancestry, time, location, visibility, knowledge and committed revision.
- [ ] 5.6 Model Character utterance, Narration and generated presentation evidence separately from objective World facts and state-changing events.
- [ ] 5.7 Add concurrency and isolation tests proving different WorldRun, WorldStoryRun, CharacterStorylineRun, GameSession, branch and participant states never leak or fall back to active selection.
- [ ] 5.8 Add a synthetic headless Experience fixture demonstrating Story opportunity, user action, Character response, World state transition, independent Character/World Story progress and optional Gameplay result without Electron or Renderer.
- [ ] 5.9 Add runtime tests proving `WorldActorBinding -> WorldActorInstance -> CharacterRun -> primary AgentSession` uses one exact CharacterVersion, keeps World-local actor state in WorldSave and fails locally when the binding is unavailable without latest-version fallback.

## 6. Save, branch and replay

- [ ] 6.1 Implement the WorldSave repository port and World-owned codec for immutable Experience baseline, Run/branch ancestry, participant/actor bindings, ordered events, checkpoints and current revision without embedding Story/Game/Character facts.
- [ ] 6.2 Implement Node atomic file adapters for project/release/save facts using workspace-relative paths and explicit canonical-payload corruption, dependency-baseline and concurrent-write diagnostics without format dispatch.
- [ ] 6.3 Implement periodic checkpoint creation and restore only from a checkpoint bound to the exact Save and immutable Experience baseline plus subsequent events, including integrity validation.
- [ ] 6.4 Implement branch creation from an earlier checkpoint/event without rewriting parent history and provide explicit branch navigation projections.
- [ ] 6.5 Implement replay from committed events without any model call and verify replay remains available when all AI providers are absent.
- [ ] 6.6 Define and test WorldExperienceVersion-to-Save baseline mismatch refusal; if a user-facing version upgrade is supported, create a new Save/branch identity and preserve the source Save without compatibility readers, migrators or implicit rebasing.
- [ ] 6.7 Add owner-qualified Experience restoration over exact WorldSave, WorldStoryRun, CharacterStorylineRun and WorldGameSession persistence identities, with fail-local invalid-record diagnostics and no merged Save.
- [ ] 6.8 Add local-metadata adapters for installed catalog, recent Run, attention, recovery and search projections, and test that projection failure marks stale without overwriting committed project facts.

## 7. Chara, Agent and AI capability composition

- [ ] 7.1 Define narrow World consumer ports for CharacterVersion/CharacterRun/CharacterStorylineRun, Entity/Content/Asset resolution, Agent Play and AI capability execution without importing owning implementations.
- [ ] 7.2 Implement `WorldActorInstance -> CharacterRun -> primary AgentSession` composition and prove an embodied user-controlled actor does not create a hidden Character Agent.
- [ ] 7.3 Implement isolated Intent Interpreter, Character Agent, World Director, Rule Evaluator, Agent Play and Narrator scopes over the existing Pi/AgentSession canonical path; do not create a World-specific Agent loop.
- [ ] 7.4 Implement immutable per-turn context materialization and exact provider/model/parameter receipts while keeping credentials, hidden model state and unrelated participant facts out of WorldSave and prompts.
- [ ] 7.5 Implement exact required/optional capability resolution across deterministic actions, Agent/AI roles, adapters and presentation; only selected realtime capabilities require measured qualification receipts, and silent handler/model/purpose/adapter/profile fallback paths cannot participate.
- [ ] 7.6 Add adversarial evaluation cases for prompt injection in imported World content, identity/stance spoofing, hidden-knowledge leakage, Director canon mutation, false utterance promotion, illegal Play action and cross-run session contamination.
- [ ] 7.7 Run focused real Agent evaluations for intent interpretation, multi-character response, World Director proposal, Agent Play planning and failure recovery, and record scenario IDs, model bindings, evidence and residual risks.
- [ ] 7.8 Implement the World-owned typed Agent launch binding/context port only after the required Experience producers exist; prove owner-qualified absent-provider unavailability without disabling valid Foundation/sibling capabilities, and forbid model-text, active-Scene or Agent-owned World/Story/Game commit fallback.

## 8. Optional realtime capability qualification

- [ ] 8.1 Implement target-environment qualification for input acknowledgement, first streamed response, stream continuity/heartbeat, interruption, cancellation, state commit, presentation update, concurrency and resource budgets.
- [ ] 8.2 Require a valid qualification receipt before using only the selected profile's required realtime capabilities; deterministic Experiences and sibling actions remain available without AI while package/Save inspection and committed replay always remain available.
- [ ] 8.3 Implement bound stream lifecycles for Intent Interpreter, Character Agent, World Director, Narrator and required presentation providers using explicit Run/branch/participant/turn/Scene/source-revision identity.
- [ ] 8.4 Implement interruption, cancellation and newer-intent supersession so obsolete chunks, proposals and presentation results cannot commit or render.
- [ ] 8.5 Implement deadline, stream-loss and resource-budget diagnostics that pause/fail the affected capability without changing model, purpose, profile or execution path.
- [ ] 8.6 Add sustained-latency and adversarial tests for provider jitter, first-response timeout, broken heartbeat, cancellation refusal, late chunks, Scene/revision changes and multi-role concurrency.
- [ ] 8.7 Keep ordinary GenerationJob/offline render APIs unregistered for active Runs and add path tests proving non-realtime image/video creation exists only in authoring, publication preparation or post-Run export.

## 9. World experience and presentation

- [ ] 9.1 Implement the package-owned World Webview host contract for snapshot-first attach, participant WorldView/Story/Game projections, bound user intents, exact renderer session and request identity, interruption, cancellation and disposal.
- [ ] 9.2 Build the first streaming-text plus illustrated-2D realtime Experience surface using shared UI primitives, including scene, visible characters, narration/dialogue, independent story progress, optional gameplay, suggested affordances, free-form input and event/branch access.
- [ ] 9.3 Define Text/Conversation, Web/2D, Game Engine, generative World Model and other interaction/execution/presentation profile contracts and explicit selection/qualification without making one profile mandatory, creating parallel facts or allowing silent profile fallback.
- [ ] 9.4 Implement explicit transition between separately qualified realtime profiles so they preserve exact Run/Session identities and consume the same owner-qualified semantic contracts without copying state.
- [ ] 9.5 Integrate durable Entity/Asset/Content grounding and representation plus qualified realtime Voice/Live2D descriptors through owning public ports; keep ordinary GenerationJob, local paths, provider payloads and runtime URLs out of World runtime and facts.
- [ ] 9.6 Add Webview/adapter tests for rapid input, interruption, stale views, reload, StrictMode, explicit profile transitions, missing representation, capability loss and late AI/engine responses without duplicate intents, commits or presentation overwrite.

## 10. Desktop composition and World Library

- [ ] 10.1 Add sender-bound Desktop World contracts and preload projection for Library, work detail, realtime qualification, launch, independent Run/Session attachment, Save/branch selection and World Webview lifecycle.
- [ ] 10.2 Compose package-owned Definition/Runtime, World Story, World Gameplay, Experience and persistence services in Desktop Main with explicit Chara, Agent Play, Content/Asset, realtime AI, Engine/profile, settings and resource adapters; retain no host-neutral workflow in `apps/neko-desktop`.
- [ ] 10.3 Add the lightweight World Library to Desktop Home for installed/authored works, associated Stories, optional Gameplay, recent Runs, Saves, branches, profile qualification status and attention without making Game Hub the World information architecture.
- [ ] 10.4 Add independent World Studio and World Runtime scenes. Character Studio/Runtime links may navigate to exact World identities but cannot mount writable World editors; World surfaces may navigate to Character Studio and creative tools but cannot assume their authority.
- [ ] 10.5 Add work detail and launch setup for exact version, entry point, stance, optional embodied Character, new/existing Save or branch and a qualified author-supported execution/presentation profile.
- [ ] 10.6 Replace the current complete-World unavailable projection only after the full package producer/consumer, capability resolver and at least one supported Interaction Surface path are registered; add consumer/path tests proving empty-view, mock-repository, no-op-handler, mandatory-AI inference, app-owned World and silent fallback success paths are absent or cannot participate.
- [ ] 10.7 Add a real Electron isolated-fixture scenario covering Home -> World detail -> qualification -> new ExperienceRun -> Character/World Story interaction -> optional Gameplay -> Save -> reload -> continue -> branch -> close, including independent lifecycle, latency, IPC identity, resource revocation and disposal assertions.
- [ ] 10.8 Compose World New Interaction through the canonical Agent bound Draft and exact Scene handoff without a World-specific Agent runtime or Desktop-owned binding policy.
- [ ] 10.9 If the first Experience has independent authored game rules, compose it through World Gameplay and add path tests proving World Definition/Runtime, Character, Agent Play and Renderer do not own GameSession state; test external Game bindings separately.

## 11. Documentation and quality gates

- [ ] 11.1 Add `docs/domains/world/README.md` and `architecture.md`, update domain navigation, package boundaries, application composition and roadmap status only after the implemented realtime path matches this design.
- [ ] 11.2 Document the creator/user mental model for World capability family, authoring/runtime separation, independent Character/World Story, World Gameplay versus Agent Play, Experience composition/binding and Web/Engine/World Model profiles.
- [ ] 11.3 Run focused World/Chara/Agent package tests/typecheck, content compiler/transformation/capability resolver producer-consumer tests, applicable realtime qualification tests and Node persistence tests and record the exact commands and results.
- [ ] 11.4 Run `pnpm test:agent:eval` plus focused real Agent scripts only for Experiences/cases that declare Agent/AI capabilities; state explicitly which deterministic compiler/runtime cases are excluded, which evidence is harness-only and which exercises a real model path with measured latency/interruption.
- [ ] 11.5 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:application-boundaries`, `pnpm check:legacy-debt` and `pnpm check:unused`, fixing canonical-path failures rather than adding compatibility fallback.
- [ ] 11.6 Run the sustained real Electron World functional scenario outside CI and `pnpm package:desktop` where applicable, then record host/version, model/provider/Engine binding, latency percentiles, interruption/cancellation evidence, sanitized artifacts, unexecuted gates and residual risks.
- [ ] 11.7 Complete `neko-quality-review` against the final diff and verify producer tests, Desktop delegation tests, realtime runtime path evidence and deletion, registration-absence or fail-closed proof for every replaced or newly enabled route.
