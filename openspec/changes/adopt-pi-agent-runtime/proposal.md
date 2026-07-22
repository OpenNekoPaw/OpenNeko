## Why

The retained OpenNeko product should invest in Canvas, Cut, Assets, Preview, and creative tools instead of maintaining a second general-purpose Agent loop, provider protocol stack, Skill lifecycle engine, and transcript store. The accepted `docs/architecture/adr-pi-agent-runtime.md` selects Pi as the only canonical Agent/LLM/session/Skill path and requires the legacy paths to be removed rather than retained as fallback.

## What Changes

- Add `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` with normal compatible dependency ranges plus the repository lockfile, and make Pi Agent the only main-model loop and tool execution runtime.
- Replace the current Executor, Platform chat adapter registry, Vercel AI SDK chat glue, and duplicate stream aggregation with a thin OpenNeko product-runtime adapter around Pi events and tool hooks.
- Adopt Pi Skill discovery/formatting primitives while retaining only Host-owned source, trust, enablement, fingerprint, and opaque runtime locator records; actual model-visible Skill content and `read_skill` receipts remain in Pi transcript, evaluation observes those receipts rather than a legacy activation lifecycle, Skill locators never become project/cache paths, and no separate Skill cache is added.
- Adopt Pi Session JSONL/context/compaction primitives as the only transcript authority for each conversation branch; keep the user-global OpenNeko SQLite catalog, branch mapping, Run, Task, ResourceRef, permission facts, and UI projection as separate product authorities.
- Model Conversation as an OpenNeko aggregate with explicit branch-to-Pi-session mapping; `conversationId`, `branchId`, and Pi `sessionId` are distinct, and one active Pi Agent follows the active branch.
- Use a program-owned user storage root partitioned by workspace/conversation/branch, a virtual Pi `cwd`, turn-level idempotent checkpoints with delayed persistence, and Pi compaction driven by a minimal OpenNeko trigger/retention policy.
- Share one user-level CredentialStore between TUI and VS Code, enforce a fenced single-writer lease for a conversation across Hosts, and keep delayed checkpoint backfill process-local without a durable outbox.
- Introduce immutable per-turn model-policy snapshots as one flat `purpose -> model + resolved parameters` map, with required `agent.main` and explicitly bound generation/perception purposes but no nested main/type/purpose fallback hierarchy.
- Move retained Canvas prompt/judge, Character dialogue/profile, and embedding operations off generic Platform chat into explicit flat product purposes owned outside Agent. Canvas retains its adapters and only exposes semantic prompt/judge ports; it never receives LLM/provider/auth details and `@neko/agent` never owns Canvas execution. Pi-executed text operations use one neutral already-resolved purpose completion primitive; embedding remains domain-executed when Pi has no embedding protocol.
- Reuse Pi Provider, model, auth, OAuth refresh, and `CredentialStore` contracts while retaining OpenNeko-owned configuration sources, credential persistence/provenance/redaction, Host login interaction, and media-provider boundaries.
- Continue supporting configured NewAPI/OneAPI-compatible gateways: project main/chat and bounded understanding requests into Pi's OpenAI-compatible provider path, while moving NewAPI-specific image/video/speech/music and asynchronous-task execution into the owning OpenNeko media runtime instead of retaining legacy chat adapters.
- Limit the first migration gate to Pi built-in Provider OAuth and Radius when actually configured; arbitrary custom `OAuthAuth` remains a caller-driven extension rather than first-release scope.
- Keep long-running generation in the OpenNeko task runtime and return `TaskRef` promptly; return structured evidence from bounded perception tools.
- Add focused path-level Agent evaluations for Pi streaming/tool execution, distinct purpose models, cancellation/isolation, Skill trust, session reopen, and no-legacy-fallback evidence.
- **BREAKING**: remove the legacy `AgentExecutor -> IService -> Platform Service -> AdapterRegistry -> AI SDK` success path, Skill lifecycle/ToolGuard/model-override control plane, and self-authored transcript/journal authority.
- **BREAKING**: replace TUI, VS Code Extension, and Webview paths in one migration; discard prelaunch legacy transcripts and provide no legacy runtime flag, reader, or importer.

## Capabilities

### New Capabilities

- `pi-agent-runtime`: Pi Agent is the single main Agent loop, tool execution, streaming, cancellation, steering, and follow-up path.
- `pi-skill-host`: Pi Skill primitives provide discovery and progressive disclosure while OpenNeko owns trust, enablement, and opaque runtime locator facts outside the resource cache/path namespaces.
- `pi-session-authority`: Pi Session JSONL/context/compaction is the sole transcript authority and composes with OpenNeko product identities.
- `agent-model-policy`: Each turn freezes a flat purpose map containing model and resolved parameters, including required `agent.main` and explicit generation/perception bindings.

### Modified Capabilities

None. The pruned workspace has no surviving base OpenSpec capability catalog; this change establishes the replacement contracts as new capabilities.

## Impact

- Agent packages: `packages/neko-agent/packages/agent`, `platform`, `ai-sdk`, `agent-types`, `extension`, and `webview`.
- Hosts: `apps/neko-tui` and the VS Code Agent extension adapters.
- Shared product contracts: conversation/turn/run/task identities, permission/approval, Capability/MCP, ResourceRef, model configuration, and event projection.
- Dependencies and distribution: root lockfile, extension bundle size/startup, Pi/provider SDK licenses, secret handling, and provenance.
- Tests/evaluation: deterministic adapter/session/Skill/model-policy tests plus the external Agent evaluation suites and real TUI path.
- The first real-evaluation provider/model matrix is selected at implementation time from retained configured callers and available credentials; no test-only provider, purpose, OAuth flow, or credential is introduced.
