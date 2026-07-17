## Context

`docs/architecture/adr-pi-agent-runtime.md` is the accepted target architecture. The retained repository still implements its own general Agent kernel across `@neko/agent`, `@neko/platform`, `@neko/ai-sdk`, Extension adapters, and TUI adapters: the current path owns Think/Act/ReAct execution, provider chat adapters, message/tool DTOs, streaming aggregation, Skill lifecycle, journal/history hydration, and compaction. This duplicates the responsibilities of Pi and leaves several mutable singleton/configuration paths that are difficult to isolate per conversation.

The migration affects prompts, Skills, capability/tool routing, providers/models, AgentSession, queues, cancellation, task observation, and TUI/Webview event projection. It therefore requires both deterministic path tests and focused real Agent evaluation under `.codex/skills/neko-agent-evaluation/SKILL.md`.

### Five-layer analysis

- **Responsibility:** Pi owns the generic Agent loop, main-model protocol, tool scheduling, transient Agent state, Skill parsing/formatting, provider-specific auth/refresh, and transcript/context primitives. OpenNeko owns conversation/turn/run/task identity, Capability/MCP, permission/trust, Skill locators, configuration projection, credential persistence/interaction, ResourceRef, durable media tasks, creative apply, and host projections.
- **Dependency:** VS Code and TUI depend on the host-neutral OpenNeko product runtime; that runtime composes Pi directly. Domain tools depend inward on small product ports. Pi never imports VS Code, Webview, React, Canvas, Cut, or Asset implementations.
- **Interface:** the public runtime surface remains conversation-oriented (`execute`, `cancel`, `steer`, `followUp`, confirmation, task observation, event subscription). Internally, Pi message/tool/session types are used directly. Translation exists only at the product identity, permission, domain-tool, and UI projection boundaries.
- **Extension:** new providers/models use Pi AI registration; new creative capabilities register semantic tools and purpose-specific executors. New model purposes require a real caller and an explicit configuration contract.
- **Testing:** characterization tests freeze Pi event ordering and session behavior; path tests poison the old loop/adapters/session; evaluation proves a real TUI session selects and executes tools through Pi with no fallback.

## Goals / Non-Goals

**Goals:**

- Make Pi the only successful main Agent and chat-provider path.
- Preserve OpenNeko product identities, permissions, capabilities, ResourceRefs, durable media tasks, and UI behavior without preserving a second generic Agent kernel.
- Use Pi Skill and Session primitives directly and establish a single transcript authority per conversation branch.
- Freeze one flat purpose-to-model-use policy per turn/run and support explicit purpose models for generation/perception without a nested fallback hierarchy.
- Reuse Pi Provider/Auth/CredentialStore contracts while retaining only product configuration, credential persistence/provenance, and Host interaction ownership.
- Delete or poison every replaced legacy success path and prove that it cannot participate.
- Reduce the retained Agent code surface enough that adding a creative tool does not require editing a general loop or provider adapter.

**Non-Goals:**

- Adopt Pi Coding Agent, Pi TUI, coding-oriented shell/file tools, or `AgentHarness`.
- Move Canvas, Cut, Assets, Preview, Capability, permission, ResourceRef, or durable task ownership into Pi.
- Preserve legacy Skill activation slots, ToolGuard/ToolSet mutation, Skill model overrides, journal/event-sourcing APIs, or adapter compatibility aliases.
- Add planner/subagent/model-graph purposes without a retained caller. Canvas judging is retained and therefore uses the explicit `canvas.judge` purpose rather than a generic judge hierarchy.
- Make Pi Session custom entries the sole authority for durable runs, provider task IDs, generated assets, or permissions.

## Decisions

### Upgrade Pi through the build compatibility gate

Use normal compatible dependency ranges and the repository lockfile for `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai`; do not establish an additional manual exact-version pin policy. Dependency updates are accepted through the build path only after public API, event, Skill, model/Auth, Session reopen/branch, bundle/startup, and focused Evaluation checks pass. Contract drift fails the build and cannot select a legacy runtime fallback.

Alternative: use the deprecated `@mariozechner/*` packages. Rejected because the maintained package namespace is `@earendil-works/*`.

Alternative: put Pi under the existing Platform service adapter. Rejected because that preserves two model/message/tool/stream contracts and the legacy fallback.

### Replace the kernel at the configured-conversation boundary

The canonical runtime is one conversation-scoped object composed from a Pi `Agent`, Pi `Session`, immutable turn snapshot, OpenNeko permission preflight, semantic tools, and one event projector. It implements the existing host-facing execution/cancellation/queue intent but does not wrap `AgentSession`, `AgentExecutor`, or `IService`.

Each conversation exclusively owns:

- Pi Agent and the `agent.main` model use;
- one active Pi Agent and the active branch's Pi Session/transcript tree;
- steering/follow-up queues and abort state;
- immutable in-flight `AgentModelPolicy` snapshot;
- event subscription and save-point lifecycle.

No active conversation is selected through a mutable global runtime singleton. Host registries may index conversation runtimes by explicit identity, but active UI selection only chooses a projection.

### Keep only boundary translations

Pi types are canonical inside the new runtime. Translation is limited to four real boundaries:

1. OpenNeko model configuration to a Pi AI model;
2. OpenNeko domain Capability/tool definition to a Pi `AgentTool` with schema and permission preflight;
3. Pi events to versioned OpenNeko product/UI events carrying conversation and turn identity;
4. OpenNeko Conversation/Branch metadata to explicit Pi session bindings and replaceable listing projections.

There is no generic Pi facade, parallel model DTO registry, second event bus, or compatibility stream aggregator.

### Permission and tool execution use Pi preflight/postprocess hooks

Tool registration first filters unavailable purpose bindings and host requirements. Pi `beforeToolCall` invokes the OpenNeko permission/workspace-trust policy with explicit conversation/turn identity and can block with a diagnostic. The tool executor invokes the owning domain capability and returns evidence, `ResourceRef`, or `TaskRef`. Pi `afterToolCall` projects durable observations without converting failures into success.

Existing domain schemas are converted once at registration. Invalid schema or arguments fail visibly. Experimental Skill `allowed-tools` metadata is preserved for display/round-trip only and does not mutate the runtime registry or permission result.

Domain tool names remain OpenNeko identities and may contain package separators such as `.` or `:`. The Pi boundary projects only incompatible names to stable, distinct OpenAI-compatible wire names of at most 64 characters. Permission, execution, diagnostics, and product events resolve the wire name back to the original domain identity. A projection collision or unknown wire name fails visibly; owning packages do not learn provider naming rules and no parallel tool registry is introduced.

### Skill Host is metadata plus Pi Skill

Builtin, project, and personal roots are discovered with Pi `loadSourcedSkills`; OpenNeko adds only source, trust, enablement, a content fingerprint, and an opaque process-local `SkillLocator`. Before Pi formats catalog or invocation content, the Host replaces the physical `Skill.filePath` with a fingerprint-addressed locator such as `/__neko_skills/<fingerprint>/SKILL.md`; only the Skill Host can resolve it and no cross-session locator stability is promised.

`SkillLocator` is not a workspace-relative or `${VAR}` path, `ResourceRef`, cache key, cache-relative path, Webview URI, or durable project fact. It never enters `PathResolver`, ContentAccess, `ResourceCacheService`, or persisted configuration. One designated Agent content-read boundary recognizes the Skill namespace and delegates to the Host. Relative `references/`, `assets/`, and `scripts/` become contained `SkillResourceLocator` values under the same virtual root. This is a single namespace resolver, not a virtual filesystem or general cache abstraction.

Explicit `$skill-name` resolves the project-first trusted/enabled record and calls Pi invocation formatting immediately. Model-selected progressive disclosure receives only catalog metadata and virtual location, then reads through the same Host resolver. Duplicate names produce warnings and the project record shadows others. A fingerprint change affects the next turn while an in-flight turn keeps its snapshot; conversations do not pin old fingerprints.

Skill text that is actually injected or returned by the designated content-read path is real model input and remains in Pi Session message/tool-result history for faithful reopen, branch, and context construction. The transcript records source/fingerprint receipt but never physical paths, binary assets, or script copies. Turn scope removes activation state; it does not rewrite historical input. Pi's loaded resource snapshot is the only process-memory reuse, with no separate Skill cache manager or persistent Skill cache.

Skill scripts execute only through user/workspace allow/ask/deny policy, workspace trust, and the existing External Processor, PathAccessPolicy, sandbox, and ResourceRef contracts. Permission is bound to workspace, Skill fingerprint, and script/processor identity; Skill metadata never self-authorizes and no arbitrary shell is added.

Legacy activation/deactivation state, slot ownership, conflict resolution, ToolGuard, ToolSet activation, lifecycle projection, and Skill model override are removed. `@neko/skills` remains an independent content-only `SKILL.md` package; business runtime previously hidden there moves to its owning Capability/domain. The Agent extension surface owns only the Skill Host/runtime boundary. Canvas and other domain extensions keep their adapters, model-call ports, execution, apply, and UI lifecycle outside `@neko/agent`; the Agent tool bridge only consumes their generic host projection.

### Pi Session is the only transcript and context authority per branch

Conversation is an OpenNeko product aggregate. It has a default workspace binding, one active branch, and zero or more historical/alternative branches. Each branch maps explicitly to its own Pi `sessionId`; `conversationId`, `branchId`, and `sessionId` are distinct identities. One conversation has one active Pi Agent bound to its active branch. Branching, rollback, or continuation from a historical entry creates or selects the corresponding branch/session mapping rather than reusing an identity.

Pi `JsonlSessionRepo`/`JsonlSessionStorage` owns durable branch entries; `buildContext` and Pi compaction own branch model context. The thin conversation runtime persists ordered entries through one terminal checkpoint per turn and reopens the selected branch. The default workspace binding remains stable; authorized attachments, Tool inputs, and ResourceRefs may add inputs without rebinding the conversation.

The program owns one user-global Pi session root and SQLite metadata root shared by TUI and VS Code, partitioned by `workspaceId`, conversation, and branch. The workspace stores only stable workspace identity and project facts. Pi receives a virtual `cwd` such as `/__neko_workspaces/<workspaceId>` for session partition/header use; it is not a physical path or an input to `PathResolver`, Skill Host, ContentAccess, or generic file tools.

Cross-Host execution is single-writer. A minimal SQLite `ConversationExecutionLease` carries conversation, holder, monotonically increasing epoch, and expiry. Only the current epoch holder may advance the Agent or commit checkpoints; other Hosts consume read-only projections. Explicit takeover increments the epoch, and stale holder writes fail fencing checks. The lease coordinates cross-process storage access only and never becomes Agent state or global active selection.

SQLite is authoritative for product metadata: conversation identity, default workspace binding, title/lifecycle, active branch, branch-to-session and parent/fork mapping, and timestamps. Listing fields such as message count, preview, last model/activity, and compaction status are rebuildable projections. Pi Session owns only transcript/context data and cannot reconstruct the product aggregate; loss of the user-global store is not recovered from workspace files or orphan Pi JSONL.

At a turn terminal point the runtime creates one idempotent `TurnCheckpoint` containing that turn's ordered Pi entries. UI may display the completed result before persistence, but exposes a durability state (`volatile`, `persisting`, `durable`, or `persistence-delayed`). A failed checkpoint is queued for process-local backfill and is never reported as durable. Graceful shutdown attempts a final flush; crash/exit may lose an unsaved turn. No durable outbox, second WAL authority, or replacement journal is introduced.

Pi remains the sole compaction engine, context builder, and compaction-entry writer. A minimal OpenNeko `CompactionPolicy` may decide trigger timing, budget, and product references that must survive; it cannot implement a second summarizer, context builder, or persistence path. Diagnostic logs are non-authoritative. Legacy journal/history/conversation hydration code is deleted or poisoned in migration tests.

### Model routing is flat, explicit, and snapshot-based

The minimal contract is a flat `AgentModelPolicy` map from purpose to `{ model, parameters }`. `agent.main` is required and is not a separate top-level field; retained tool purposes such as `image.generate`, `image.understand`, `video.generate`, `video.understand`, `audio.generate`, `audio.tts`, and `audio.asr` are added only where a caller exists. `llm.chat` remains a model capability, not a purpose.

At turn start, the runtime normalizes model-catalog defaults, user configuration, and conversation overrides once, then freezes the resulting flat map. The Pi Agent reads `agent.main`; tools close over their exact purpose entry. Runtime resolution has no nested purpose lookup, type default, first-capability match, or main-model fallback. Missing bindings prevent tool registration; a binding that becomes invalid during execution fails. Tools cannot mutate the Pi Agent main model.

TUI and VS Code project the same flat `default_model_purposes` entries and apply the same provider/model availability and capability checks. Legacy type defaults such as `default_models.image` do not synthesize Pi turn purposes. Pi-executed main/understanding entries register the provider wire model name, while domain-executed generation/edit/TTS entries retain the OpenNeko catalog model id consumed by the owning media runtime; the snapshot records both facts where they differ.

Retained product-side model calls are real callers and use the same flat namespace: `canvas.prompt`, `canvas.judge`, `character.dialogue`, `character.profile`, and `text.embed`. These are five sibling entries, not a `main -> product -> operation` tree. The Canvas prompt entry covers both generation and optimization because they have one model-use lifecycle; Character dialogue covers test-bench and embody turns for the same reason. Profile inference is separate because its structured extraction budget and lifecycle differ. The same model may be explicitly bound to several entries.

Pi-executed product text calls share one pure completion primitive in a neutral product model runtime outside `@neko/agent`. It accepts only an already-resolved model use, Pi `Models`, bounded context, and cancellation; it cannot look up configuration, select another model, own history, or fall back. Canvas exposes only a semantic `generate(shotData) -> prompt` port: Canvas code does not receive chat messages, token options, provider/model identity, credentials, Pi objects, or a generic LLM service. A Canvas-owned adapter constructs its domain prompt and receives the neutral purpose runtime from the application composition root. Character follows the same owning-domain-port rule. `text.embed` is domain-executed until Pi exposes an embedding protocol; the retained embedding owner receives an exact frozen binding and cannot reuse the deleted chat registry. Agent runtime never owns or exports Canvas/Character completion adapters.

### Pi Provider/Auth is reused behind OpenNeko product ownership

OpenNeko keeps its user/workspace configuration format, flat purpose bindings, conversation overrides, and media-domain settings. A thin projection registers Pi-supported main/chat providers and models with Pi `Models`; OpenNeko does not replace its whole product configuration with a Pi config file and does not keep the legacy Platform provider registry as fallback.

NewAPI/OneAPI-compatible gateway support remains a first-release product capability. Configured `type = "newapi"` endpoints, explicit protocol profiles, model catalogs, bearer credentials, and the Neko account-gateway catalog/entitlement projection remain valid. Main/chat and bounded multimodal-understanding uses become Pi OpenAI-compatible providers/models with the configured `baseUrl`, credential, headers, and explicit compatibility flags. NewAPI-specific image, video, speech, music, and asynchronous task protocols remain OpenNeko media-runtime responsibilities and move out of any deleted generic AI SDK/Platform chat layer. Neko account login/catalog/entitlement/usage remains product auth; only its resolved gateway credential is projected through the shared CredentialStore/provider request path. No NewAPI request may fall back to a different provider, account source, main model, or legacy adapter.

Pi provider factories, model contracts, provider-specific credential interpretation, OAuth login/refresh/logout, and `CredentialStore` interface are canonical. OpenNeko implements one program-level user CredentialStore shared by TUI and VS Code plus Host-specific `AuthInteraction`; it owns persistence, deletion, provenance, redaction, consent/error UI, and workspace/user policy. Host-local login authorities and Pi's default in-memory credential store are not production persistence strategies. Secret values never enter workspace facts, conversation SQLite, Pi Session, logs, or Evaluation facts.

Credential projection is provider-scoped. A CLI key or provider-agnostic environment key applies only to the selected `agent.main` provider and cannot populate another purpose provider. Other purpose providers require their own configured/provider-specific environment credential, account-gateway result, or same-identity shared-store record. Conflicting endpoint, auth, or credential projections for one provider fail visibly.

The first migration validates Pi built-in Provider OAuth and Radius `/v1/oauth` discovery only when Radius is an actual configured provider. Arbitrary OAuth/OIDC endpoints would require a minimal Pi `OAuthAuth` implementation because Pi has no generic data-only authorization/token-endpoint factory, but this remains deferred until a real provider caller exists. It is not a first-release gate or a reason to add an OpenNeko auth platform.

### Media tasks retain product-specific semantics

Bounded perception completes inside a tool call and returns structured evidence tied to a stable resource locator. Long generation submits through the existing durable OpenNeko task owner and promptly returns `TaskRef`; provider task ID, progress, cancellation, recovery, and final `ResourceRef` remain outside Pi transcript authority. Completion is fed back through the canonical observation/follow-up path.

The flat snapshot has one purpose namespace with two explicit execution owners, not a fallback hierarchy. `agent.main` and bounded understanding entries carry Pi-executable model contracts. Generation/edit/TTS entries carry the minimal provider/model identity consumed by the owning domain runtime and are not fabricated into Pi chat models with fake context windows or token limits. Both kinds are resolved, capability-checked, and frozen together at turn start; the Pi Tool bridge forwards a domain entry's identity and parameters but never calls Pi completion for it.

Model-visible schemas for `GenerateImage`, `TransformImage`, `GenerateVideo`, `GenerateMusic`, and `GenerateTTS` omit provider/model routing. Missing purpose entries omit the Tool and legacy routing arguments fail visibly. Submission returns a product `{ source: "media-task", sourceTaskId }` `TaskRef` immediately while the existing task scope continues to own cancellation, progress, recovery, terminal delivery, and final generated-output `ResourceRef`.

For bounded understanding only, the Pi tool bridge derives a turn-scoped `ToolPurposeModelRuntime` from the frozen purpose entry. The port exposes one constrained multimodal completion operation and exact provider/model facts; it does not expose registry lookup, model selection, generic chat history, or main-model mutation. The port is process-only and never appears in model-authored arguments, model-visible metadata, transcript, or persisted facts. An absent binding omits a model-only tool. A mixed tool that also owns a project-facade or local-analysis path may retain that non-model path, but it cannot run the missing perception evaluator or fall back to `agent.main`.

The first canonical bounded-perception Tool is `perception.image.understand`. Its schema accepts only a stable `ResourceRef` and an optional focus; the implementation materializes bytes through ContentAccess, uses the frozen `image.understand` runtime, and returns `neko.image-understanding.v1` evidence with the original stable reference and exact usage/model facts. Provider/model ids, absolute paths, and cache locators are not model-authored inputs. Legacy `perception.perceive` understanding-model overrides fail visibly and remain only inside the AgentSession deletion boundary.

Pi AI's generic message content currently models text and images, not generic audio/video payloads. OpenNeko therefore retains CLIP, Whisper, shot detection, and provider-specific media protocols in domain runtimes instead of inventing a Pi media abstraction. A retained domain capability may be projected as a Pi Tool only after it accepts stable resources, keeps model selection in program configuration, and returns structured evidence. Missing audio/video capability is an explicit unsupported result, never main-model guessing or Platform-chat fallback.

Media generation implementations may retain provider SDK code that Pi does not cover, but chat generation, main-model streaming, and generic provider routing cannot use the legacy Vercel AI SDK/Platform path.

### Evaluation authoring decision

Decision: **update** the existing target-owned Agent runtime suites rather than create one omnibus Pi suite. The coverage index already maps the affected behaviors:

- `agent-runtime.single-message-tui` and `agent-runtime.stream-delivery` prove the canonical Pi turn, streaming/tool path, event order, and forbidden legacy executor/adapter path;
- `agent-runtime.model-binding` proves the flat `agent.main` model/parameter snapshot, effective Pi provider/credential path, and no default/global fallback;
- `agent-runtime.perception-routing` and `agent-runtime.creative-media-workflow` prove distinct tool-purpose models, evidence, generation `TaskRef`, and no main-model fallback;
- `agent-runtime.skill-runtime` and `agent-runtime.prompt-composition` prove Pi Skill injection, Host identity/fingerprint, real transcript input, no second cache, opaque locator projection, and no legacy lifecycle; deterministic formatter tests own absolute/cache-path non-disclosure;
- `agent-runtime.workflow-controller` proves Pi queues, cancellation, task continuation, cross-Host lease fencing, process-local delayed persistence, close/reopen, conversation/session identity, and Pi Session authority.

Shared credential persistence, built-in OAuth login/refresh/logout state transitions, conditional Radius discovery, redaction, and failure writes are deterministic provider/Host adapter contracts. They are excluded from separate real Agent scenarios; the updated model-binding real case proves that a configured credential reaches the effective Pi provider/model without exposing the secret. Arbitrary `OAuthAuth` is outside first-release scope, and no Evaluation-only OAuth flow or credential is introduced.

Deterministic hard gates own path, identity, model, permission, TaskRef/ResourceRef, and no-fallback assertions. A Judge is not required for the migration gate because output quality is not the disputed contract.

## Risks / Trade-offs

- [Pi APIs and JSONL semantics change quickly] → Resolve upgrades through the lockfile and fail the build unless public API, event/session/branch, Skill/Auth characterization and focused real Evaluation pass.
- [Pi AI pulls many provider SDKs and increases VS Code bundle/startup cost] → Measure production bundle and activation; externalize or lazily load supported provider modules where packaging permits; remove superseded AI SDK dependencies in the same migration.
- [Deleting the old kernel can strand product responsibilities embedded in it] → Classify every legacy module as Pi-owned, retained product-owned, moved to a domain owner, or deleted before removal; require consumer/path tests for retained owners.
- [A broad compatibility adapter would make migration appear complete] → Poison legacy executor, Platform chat adapter, Skill lifecycle, and journal/session entry points in tests; prohibit fallback and compatibility aliases.
- [Stale prelaunch transcript code can preserve a hidden second authority] → Apply the explicit discard decision, delete readers/importers, and poison legacy hydration so old data cannot re-enter the canonical path.
- [Tool schema conversion can weaken validation] → Use Pi's public schema type, strict conversion tests, and fail on unsupported schema constructs rather than coercing or dropping constraints.
- [Real provider credentials may be unavailable in CI] → Keep key-free harness/schema tests mandatory and record real evaluation as blocked with exact provider/model/configuration evidence; do not describe mock/dry-run results as Agent acceptance.

## Migration Plan

1. Record a module/consumer inventory and freeze characterization tests for the current host-facing runtime contract, Pi events, Pi Session/Skill primitives, and selected model providers.
2. Add Pi dependencies under the repository's normal compatible-range and lockfile policy, then implement model policy, Skill Host, Session authority, domain-tool bridge, permission hook, and event projector as one conversation-scoped composition root.
3. Route TUI, VS Code Extension, and Webview through Pi as one replacement boundary; poison and remove the legacy path without a development runtime switch.
4. Migrate generation/perception tools and durable task observation to immutable purpose snapshots.
5. Migrate all retained hosts, authoritative Conversation/Branch metadata, replaceable listing projections, and UI projections; run deterministic and real evaluation gates.
6. Delete legacy Executor/Think/Act/ReAct, Platform chat adapters/stream aggregation, Skill lifecycle control plane, and self-authored transcript/journal/hydration. Remove obsolete dependencies and tests that only characterize deleted behavior.
7. Run package tests/typechecks/build, Agent evaluation, bundle/startup/license/security/provenance audits, and no-legacy path checks.

Rollback is a source-control/build rollback of the whole migration, never a runtime fallback. Existing prelaunch transcripts have no retained user value and are explicitly discarded; no importer or legacy reader is implemented.

## Implementation-time selection

The first real-evaluation provider/model matrix is derived from retained configured callers and credentials available to the implementation environment. It MUST NOT introduce a test-only provider, purpose, OAuth flow, or credential merely to fill a matrix cell; unavailable real cases are recorded as blocked with exact evidence.
