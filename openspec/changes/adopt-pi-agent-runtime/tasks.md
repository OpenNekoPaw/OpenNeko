## 1. Freeze boundaries and upstream contracts

- [x] 1.1 Inventory every retained consumer of Executor/Think/Act, Platform chat/auth adapters, Skill lifecycle/path handling, AgentSession transcript/journal, model configuration, credentials, and event projection; classify each as Pi-owned, OpenNeko product-owned, moved, or deleted.
- [x] 1.2 Record the explicit prelaunch discard policy for legacy transcripts and add removal checks proving no importer, legacy reader, or runtime fallback remains.
- [x] 1.3 Configure compatible `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` dependency ranges plus lockfile resolution, and add build-gated public-API characterization tests for Agent events, tools, Skills, Session reopen/branch/context, Auth, and cancellation.

## 2. Establish Pi runtime contracts

- [x] 2.1 Define and test a flat `AgentModelPolicy` of `purpose -> model + resolved parameters`, required `agent.main`, retained tool purposes, immutable turn/run snapshots, and fail-visible provider/model/capability/credential resolution directly to Pi AI models; remove nested main/purposes, type-default, first-compatible-model, and implicit-main fallback behavior.
- [x] 2.2 Implement and test the minimal Skill Host record plus Pi sourced discovery, project-first warning-based duplicate resolution, trust/enablement filtering, fingerprint-addressed process-local `SkillLocator`/relative-resource projection, explicit invocation, model-selected disclosure through the designated content-read boundary, real Skill input persistence in Pi transcript, process-only snapshot reuse without a separate cache, next-turn fingerprint refresh, and permission-scoped External Processor script execution; prove locators never enter `PathResolver`, ContentAccess, `ResourceCacheService`, persisted facts, non-designated file paths, or model-visible absolute/cache paths.
- [x] 2.3 Implement and test the program-owned user-global Pi Session/SQLite roots, virtual Pi workspace `cwd`, fenced cross-Host `ConversationExecutionLease`, Conversation aggregate, authoritative catalog/branch fields, replaceable listing projections, active/historical branch mapping, JSONL creation, turn checkpoints with process-local durability/backfill states and accepted crash loss, close/reopen, branch/rollback/history continuation, distinct identities, Pi `buildContext`/compaction under OpenNeko policy, and default workspace binding; do not add workspace transcript, durable outbox, or user-store recovery.
- [x] 2.4 Implement and test the domain Capability/tool-to-Pi bridge with strict schemas, explicit identities, permission/workspace-trust preflight, error propagation, and no authority from Skill `allowed-tools` metadata.
- [x] 2.5 Implement and test the Pi-event-to-product projector for streaming text, thinking, tool calls/results, usage, cancellation, confirmation, task observation, and terminal turn state.
- [x] 2.6 Compose a conversation-scoped Pi runtime owning Agent, Session, queues, abort state, immutable snapshot, tool bridge, and event projector without wrapping legacy AgentSession/Executor/IService.
- [x] 2.7 Implement and test one program-level user `CredentialStore` shared by TUI and VS Code plus Host-specific `AuthInteraction` adapters over Pi provider auth, covering API key provenance/redaction, built-in OAuth login/refresh/logout, cancellation, persistence failure, and Radius discovery only when Radius is actually configured; keep arbitrary custom `OAuthAuth` out of first-release scope.
- [x] 2.8 Preserve NewAPI/OneAPI-compatible configuration and account-gateway catalog support: project main/chat and bounded understanding models into Pi OpenAI-compatible providers with exact endpoint/protocol/credential facts, move NewAPI-specific image/video/speech/music/task execution into owning media runtimes, and poison legacy GenericAdapter/Vercel AI SDK chat participation and all implicit provider/account fallback.

## 3. Migrate host and product paths

- [x] 3.1 Route the real TUI session owner and input path through the Pi conversation runtime with explicit conversation/turn identities and no direct turn-runner test shortcut.
- [x] 3.2 Route the VS Code Agent Extension and Webview projection through the same host-neutral Pi runtime contract while preserving workspace trust, URI/resource, confirmation, and disposable lifecycle boundaries.
- [x] 3.3 Migrate builtin/project/personal Skills to Pi-compatible `SKILL.md` packages; move non-Skill business runtime from `@neko/skills` to owning Capability/domain modules.
- [x] 3.4 Project retained OpenNeko main-model settings, flat purpose entries, resolved parameters, NewAPI and direct/local provider configuration, and credentials into Pi AI registration/resolution; remove chat/auth use of the Platform adapter registry and Vercel AI SDK without replacing the whole OpenNeko product configuration with Pi config files.
- [x] 3.5 Migrate bounded perception tools to explicit purpose models returning structured evidence and stable resource locators.
- [x] 3.6 Migrate long-running generation tools to explicit purpose models that promptly return `TaskRef` and use OpenNeko durable progress/cancel/recovery/final-ResourceRef observation.
- [x] 3.7 Prove two purpose-model tools can run concurrently and that cancellation, usage, results, and later configuration changes remain isolated by conversation/turn/run snapshot.

## 4. Eliminate replaced paths

- [x] 4.1 Delete Executor, Think/Act/ReAct loop, duplicate generic model/message/tool-call/queue types, and tests that only characterize the removed kernel after retained consumers use Pi.
- [x] 4.2 Delete Platform chat adapters/registry/stream aggregator and obsolete Vercel AI SDK chat glue; retain only clearly owned media provider code with no chat fallback.
- [x] 4.3 Delete legacy Skill loader/registry/service/injector, three-track injection, lifecycle slots/store/projection/runtime, conflict policy, ToolGuard/ToolSet mutation, and Skill model override.
- [x] 4.4 Delete legacy ConversationManager, Journal reader/writer/projection, duplicate history hydration, custom compaction, AgentSession persistence, and all transcript import/read paths under the explicit prelaunch discard decision.
- [x] 4.5 Remove obsolete factories, facades, compatibility bridges, dependencies, configuration fields, commands, tests, and exports; add poison/no-import guards proving none can return success.

## 5. Evaluation and release gates

- [x] 5.1 Update the existing indexed `single-message-tui`, `stream-delivery`, `model-binding`, `perception-routing`, `creative-media-workflow`, `skill-runtime`, `prompt-composition`, and `workflow-controller` suites with the focused Pi canonical-path, flat model/parameter, Skill Host, distinct-purpose-model, task, cancellation, and session-resume evidence defined in `evaluation.md`; do not create an omnibus Pi suite.
- [x] 5.2 Run key-free Agent evaluation harness validation and the selected cases without provider behavior; verify hard gates cover Pi path, exact model/snapshot, conversation/branch/session mapping, cross-Host writer epoch, virtual workspace locator, turn durability state, Skill transcript/cache boundary, permission, TaskRef/ResourceRef, transcript/product-metadata authority, and forbidden legacy facts.
- [x] 5.3 Run the focused cases through the real TUI with available provider credentials/models, retain assertion-level reports and usage/cost evidence, and record exact blockers for any unexecuted real case.
- [x] 5.4 Run affected package tests/typechecks/build plus repository Agent boundary, legacy-debt, unused-dependency, and OpenSpec strict checks.
- [ ] 5.5 Measure the production VS Code Agent bundle and activation time; audit Pi/provider licenses, secrets/provenance, OAuth callback/port/cancellation, and absolute/cache-path disclosure boundaries; document residual risk before declaring migration complete.
