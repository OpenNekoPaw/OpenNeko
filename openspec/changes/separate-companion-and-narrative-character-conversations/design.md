## Context

`@neko/chara` 当前已经拥有 CharacterProject/Version、CharacterStorylineVersion/Run、CharacterMemoryScope、UserCharacterRelationship、CharacterRun、Dialogue/Room、Presentation 和严格 codecs，Desktop 也已有 Character Entry、AgentSession adapter、Character Interaction Scene、VRM Main、Runtime Manager 与 RoomEvent Timeline 原型。现有设计仍存在四个结构性冲突：

1. `companion | narrative` 被建模成运行标签，但 Narrative launch 依赖尚不存在的外部 Composition，并在 Chara 内创建 StorylineRun/MemoryScope；
2. `CharacterStorylineVersion` 没有稳定 Storyline identity，多个独立故事和同一故事的多个发布版本无法区分；
3. CharacterMemoryScope 绑定一次性 CharacterRun，不能表达日常模式跨 Conversation 的稳定角色人生，而 Narrative 又可读取/写入同一类运行记忆；
4. Character Workbench 将 Main 固定为 Avatar，把 StorylineRun 数量当作 Runtime 状态，同时 package 内已经出现独立 Companion Assistant lane，导致同一角色场景拥有第二套 Conversation/AgentSession owner；现有 Character Agent runtime 还没有按模式约束有效能力，也没有让角色/参与者管理器拥有精确的每参与者 Agent 配置入口。

本变更发生在 Character 产品 P0 promotion gate 仍关闭时，允许原子替换包内 canonical contract 而不开放生产双路径。现有用户内容、Conversation transcript 和 Character records 仍可能存在，必须保留原始数据并让失效记录局部可见；不能以“尚未晋级”为理由静默删除。

### Ownership and runtime boundaries

| Responsibility                                                                                                  | Owner/package                                               | Canonical producer                                    | Consumer/runtime boundary                                            |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| Character/Storyline authoring facts                                                                             | `@neko/chara`                                               | Character authoring/storyline application services    | Chara Webview、Agent context projector                               |
| Companion continuity and accepted memories                                                                      | `@neko/chara`                                               | CharacterMemory/UserCharacterRelationship services    | Character turn context materializer                                  |
| Conversation, Turn, transcript, compaction, participant model/Skill/Tool/Approval/permission/provider execution | `@neko/agent-runtime`                                       | Agent application/session/configuration owner         | Agent Webview、Chara domain-binding/context provider                 |
| Assistant/Workspace Character creation/preview/validation                                                       | `@neko/chara` public authoring primitives composed by Agent | owner-qualified Chara authoring capability operations | Agent turn artifact and confirmation-gated CharacterProject mutation |
| External material bytes and access                                                                              | Workspace/Content/Assets/Host owner                         | owner-qualified context provider                      | Agent turn context only                                              |
| Character/Room Scene contract                                                                                   | `@neko/host`                                                | Desktop Shell application service                     | Desktop Renderer composition                                         |
| Browser-only Character surfaces                                                                                 | `@neko/chara-webview`                                       | Chara projections                                     | Desktop portal slots                                                 |
| Local persistence                                                                                               | `@neko/chara-node`                                          | Chara repository ports                                | Node filesystem boundary                                             |
| Electron sender, Window, resource lease and native path authorization                                           | `apps/neko-desktop`                                         | Main/preload concrete adapters                        | Electron Main/preload/Renderer trust boundary                        |

`apps/neko-desktop` 保留的生产逻辑必须真实依赖 Electron sender/WebContents、Window/Scene identity、preload IPC、本地路径授权或资源 lease。Conversation mode、Storyline selection、memory eligibility、context filtering、participant scheduling 和 Presentation selection policy 都是 host-neutral 业务行为，必须位于 owning package；Desktop 只验证 sender-bound request、调用 public port 并投影结果。

## Goals / Non-Goals

**Goals:**

- 冻结 Companion 与 Narrative 的唯一、可测试语义，并让 Dialogue/Room 共享同一模式 contract。
- 让 Companion 拥有跨 Conversation 的稳定角色主观/关系记忆，同时保持 transcript 只是证据。
- 让 Companion 与 Narrative 作为标准 Neko Agent domain binding 执行；Chara 只提供角色/模式/记忆/Storyline/Room 上下文，Agent 继续唯一拥有 Conversation、Turn、模型、Skill、Tool、Approval 与权限。
- 让 Companion 在精确参与者 Agent 配置和标准授权策略下调用 Agent Skill/Tool，并让 Narrative 在同一 Agent 运行链上强制不注入、不暴露和不执行任何 Skill/Tool。
- 让 Character/Room Workbench 的角色/参与者管理器管理每个精确 Agent Conversation 的 provider/model 与 Companion 能力，而不是读取一个全局 Character 模型设置。
- 让 Assistant 与 Workspace Agent 通过标准 capability 与 authoring-only `character-creator` Skill 创建可审阅的 standalone 或 project-local CharacterProject draft，并保留预览、验证和改进辅助操作，而不切换 Entry 模式、重绑 Conversation 或复制 Character runtime。
- 允许 Companion Character turn 使用授权外部资料，同时保持资料、模型输出、角色事实和长期记忆的 owner 分离。
- 将 Storyline 收敛为稳定 authoring identity、draft、不可变 publication 和节点叙事上下文；运行时只读消费。
- 删除 Runtime StorylineRun/transition/CAS 与 Narrative external Composition 路径，不保留兼容或 fallback。
- 提供可重建的 Storyline Timeline、节点背景、多角色上下文和 owner-qualified Presentation Main。
- 保持 Agent、Chara、Host、Presentation provider 和用户数据 ownership 清晰，并让单条失效局部可见。

**Non-Goals:**

- 不开放 Character 产品 promotion gate。
- 不实现 World/Experience/Save/branch、Storyline runtime progress、自动节点推进或跨会话叙事存档。
- 不把外部 Web、World、Gameplay、Computer Use、Play-use 或 Renderer 状态纳入 Chara facts。
- 不在 Character Workbench 内实现“原生模型对话”选择、第二个 Assistant Conversation 或通用 AssistantRoom；角色扮演始终是 Character-bound Agent Conversation，裸模型基础能力由通用 Agent Assistant/Evaluation 负责。
- 不实现 Character 专用 Agent controller、provider runner、Skill/Tool registry、permission policy 或 direct AgentWorkspace turn path。
- 不让 Workspace 对 Chara capability 的调用绕过 Character publication、模式、上下文、候选确认或正式 Conversation lifecycle。
- 不允许 Narrative 注入任意外部资料或读取 CompanionMemory。
- 不让角色创建 Skill 自动发布 CharacterVersion、创建 Storyline/Conversation/Room、写入 Companion continuity，或把未经用户确认的模型推断标记为角色事实。
- 不让 model output、transcript summary、Timeline UI 或 context cache 成为 Character/Storyline/memory authority。

## Decisions

### 1. Conversation mode uses one discriminated launch contract

Canonical selection is a strict union rather than `runtimeKind` plus optional bags:

```ts
type CharacterConversationSelection =
  | {
      readonly mode: 'companion';
      readonly characters: readonly CompanionCharacterSelection[];
    }
  | {
      readonly mode: 'narrative';
      readonly characters: readonly NarrativeCharacterSelection[];
    };
```

Companion participant selection carries only exact CharacterVersion and continuity identity resolved by Chara. Narrative participant selection carries exact CharacterVersion and optional exact Storyline/Version/Node ref. Fields belonging to one mode are invalid in the other; no optional `memoryPolicy`, `compositionRef` or catch-all metadata permits alternate semantics.

The mode is frozen in the Dialogue/Room conversation owner receipt before first submit. A user request to change mode creates a new launch Draft and new Conversation. This keeps old transcript meaning stable and avoids mode switching inside AgentSession.

Alternative considered: keep `runtimeKind` mutable on CharacterRun. Rejected because an existing transcript would acquire different memory/story context and because provider failure or UI state could accidentally select a different successful path.

### 2. Character is an Agent domain binding, not an execution path

Companion and Narrative expose one Character submission path backed by the canonical Neko Agent Conversation/Turn lifecycle. Agent owns Conversation identity allocation, per-Conversation/per-participant provider/model configuration, transcript, compaction, Skill activation, Tool catalog, Approval, permission checks, cancellation and provider execution. Chara owns the exact CharacterRun/Dialogue/Room binding, declares the frozen mode constraint and materializes bounded CharacterVersion, continuity or Narrative node, and visibility-filtered RoomView context through the Agent domain-binding/context provider contract.

A minimal ordinary CharacterVersion may contain only the author-confirmed identity, summary, speech/behavior constraints and knowledge boundary required for roleplay. It is not a different Agent runtime. Each CharacterRun or Room participant binds one exact Agent Conversation configuration; the selected provider/model and any permitted Skill/Tool activation are frozen by Agent receipts and projected into the Character Workbench. The role/participant manager edits that exact Agent configuration through an Agent public port. It never writes a global Character model, changes sibling participants or republishes the CharacterVersion.

The current `CharacterRunPresentationConfiguration.chat` and chat portion of `CharacterTurnPresentationReceipt` duplicate Agent configuration authority and must be removed. Chara Presentation continues to own TTS, representation and voice timing only. Workbench joins the Agent-owned effective configuration/turn receipt with Chara-owned presentation projection by exact Conversation/participant/turn identity; neither side writes the other's facts.

The effective Agent capability policy is the intersection of the exact participant's Agent configuration and the frozen Chara mode constraint. Companion permits the configured standard Agent Skills/Tools, so a Character can act as an identity-bearing assistant for authorized operations such as gameplay. Narrative contributes a strict `no Skills, no Tools` constraint: Agent omits Skill content and Tool definitions from prompt assembly, rejects stale or fabricated activation requests before provider/tool execution, and records the effective empty capability receipt. This is one mode condition inside the canonical Agent path, not a second runner or Chara-owned policy engine.

Agent performs exact capability discovery, schema exposure, permission/approval and execution. Chara may expose an opaque Agent-owned configuration/profile reference when a stable character default is later required, but it must not copy tool names, schemas, permission decisions or runtime state into Character facts. Absence of such a reference uses the canonical Agent configuration semantics rather than a Character-specific fallback.

The canonical producer/consumer chain is:

```text
Character Entry / Workbench input
  -> Agent launch or turn application service
  -> exact Character/Room domain binding
  -> Chara context provider
  -> standard Agent prompt/Skill/Tool/permission/provider execution
  -> Agent transcript and turn projection
```

The current `DesktopAgentRuntimeEntryService.executeInitialInput` Character/Room provider branch and `CharacterPrimaryAgentSessionAdapter` direct `AgentWorkspaceRuntime.startTurn` path are duplicate execution paths. They must be replaced by Agent public application ports. Room scheduling remains Chara-owned, but every scheduled participant turn must be submitted through the same Agent-owned participant Conversation/Turn service; Chara never calls AgentWorkspace or provider runtime directly.

The already introduced `CharacterCompanionAssistantLane`, its AssistantSession service, repository/table and fixtures are also replaced paths and must be deleted atomically. No persisted lane, feature flag or UI state may recreate a hidden Assistant owner.

Alternative considered: create a restricted role-only Agent runtime. Rejected because it would still be a Character-specific execution path and would prevent qualified Characters from using standard Agent Skill/Tool capabilities. Model comparison instead records the exact standard Agent configuration used for each independent Character Conversation.

Assistant and Workspace Agent Conversations may discover one authoring-only `character-creator` Skill and Chara-contributed authoring capability through the normal Agent catalog. Selecting or directly typing the Skill preserves the complete `$character-creator <prompt>` input and opens a compact operation-level destination chooser without changing the top-level Entry mode or Conversation binding. The user explicitly chooses a standalone Character library or an authorized Content Project and supplies the new draft identity label; Desktop authorizes that exact root, Chara creates one exact fresh CharacterProject, and Agent freezes the resulting authoring-target receipt for the creation operation. The chooser never infers active/recent Workspace, and cancellation creates no target, Conversation or model turn.

The exact target receipt is mutation authority, not Conversation ownership. A global Assistant remains bound to its Assistant space when creating a standalone or explicitly selected project-local draft. A Workspace Conversation remains bound to its original Workspace when creating a local or standalone draft. The selected target root may therefore differ from the Conversation context root, but the standard authoring mutation authority validates the exact Host grant and CharacterProject again when the Tool executes. This is one target-qualified Tool path, not a second Character creation runner or hidden Conversation rebind.

An exact creation invocation consumes only the preserved user prompt text and Agent-authorized reference projections, produces one proposed Character definition with confirmed facts separated from inferred suggestions, and submits the resulting `fillDraft` mutation through the standard identity-bound Tool approval. That Tool approval is the single mutation confirmation: the Skill must not add a preceding natural-language confirmation that creates a second gate. The originating Workspace Conversation keeps its owner; creation never publishes CharacterVersion, creates CharacterRun/Room/continuity, or promotes model output to canon automatically.

Creation is the primary Chara Skill workflow. Preview, validation and improvement remain secondary, explicit authoring operations over an exact CharacterProject or authoring-test snapshot. They do not create a second roleplay runtime or turn Workspace Agent into the formal Character Conversation owner.

Agent-owned `CharacterRoleSkillPrimitivePorts` therefore start with `proposeCreation` and confirmation-gated `fillDraft`, backed by the exact bound CharacterProject and narrow Chara public authoring operations. Optional profile/evidence/dialogue/evaluation/artifact/confirmation operations support preview, validation and improvement without promoting the testing-only `CharacterDialogueRuntimeService`. Automated validation keeps one tool-free Character responder plus an independent Probe Agent; evidence remains turn-scoped, reports stay project-local when permitted, and suggestions remain unconfirmed until the existing Chara owning command applies them.

### 3. External material is a turn context reference, not Character data

Companion Draft uses the existing Agent reference/resource-grant contract. At submit, Agent materializes bounded payloads through its canonical context providers under exact authority. Desktop implements only Host path/grant adapters; raw paths and bytes stay outside Chara and Renderer contracts. Chara does not define another external-material ref or materialization port.

External material may be sent only to the selected Companion Character turn. Agent combines the authorized material projection with the Chara-owned Character context for that turn. Material and output can become Character authoring or memory candidates only through an explicit owning operation.

Narrative parser and UI reject external refs before Chara/Agent execution. This is a mode contract, not a missing-provider fallback.

Alternative considered: save external refs on CharacterRun for later reuse. Rejected because attachment is per-turn user intent and persistence would silently broaden later context.

### 4. Companion continuity is stable across Conversations and Character publications

Introduce a Chara-owned stable continuity identity derived or stored under exact `userId + characterProjectId`, with separate collections/refs for Character-subjective memory and UserCharacterRelationship. CharacterRun references the resolved continuity for Companion only; it does not own the continuity lifecycle.

Accepted memory entries retain exact source CharacterVersion and Conversation/Turn or RoomEvent refs. A later CharacterVersion published by the same CharacterProject can consume compatible accepted entries through one canonical projector. Compatibility is determined against the exact new CharacterVersion's knowledge/behavior boundary; incompatible entries remain stored and visible with local diagnostics rather than being rewritten or silently dropped.

Narrative creates no Companion continuity binding and never receives its projection. Authored `narrativeMemories` inside StorylineNode are immutable story context, not CharacterMemoryEntry.

Alternative considered: reuse UserCharacterRelationship as the only daily memory. Rejected because relationship facts and the Character's subjective experiences have different correction, deletion, sensitivity and authorial meanings.

Alternative considered: keep CharacterMemoryScope bound to each CharacterRun and import old entries. Rejected because import would be an implicit cross-run copy path and could diverge from one authoritative continuity.

### 5. Storyline has stable identity, draft, publication and immutable nodes

The authoring model becomes:

```text
CharacterProject
  -> CharacterStoryline
       -> mutable CharacterStorylineDraft
       -> immutable CharacterStorylineVersion
            -> immutable StorylineNode snapshots
```

`CharacterStoryline` identifies one personal arc. Each publication pins one exact CharacterVersion. A stable StorylineNode identity may appear in multiple StorylineVersions when it remains the same conceptual node, but every runtime ref includes StorylineVersion so revised content cannot reinterpret an old Conversation.

Node content owns author-reviewed narrative context: situation, time/location, Character/relationship state, allowed/forbidden story facts, narrative memories, knowledge boundary and behavior/expression constraints. Author-only notes and spoiler visibility remain separate from the character turn projection.

Alternative considered: treat every CharacterStorylineVersion as a distinct Storyline. Rejected because users cannot distinguish independent arcs from revisions, manage history or reopen exact old content coherently.

### 6. Storyline runtime state is removed

Delete `CharacterStorylineRun`, observation candidates, accepted transitions, storyline revision, CharacterRun-to-StorylineRun and CharacterMemoryScope-to-StorylineRun fields from the canonical success path. Narrative Conversation stores a frozen exact selection receipt; each turn projects the same authored node context. Dialogue content that suggests another node has no runtime effect.

If a creator asks to change a Storyline based on a Conversation, Agent/Chara may create a sourced authoring candidate. Only an explicit draft edit and publication creates new Storyline facts. No Experience provider participates.

Alternative considered: retain StorylineRun as a session-local cache. Rejected because its name and transition API express business progress, while a cache would be redundant with Conversation binding and violate the single canonical path.

### 7. Agent transcript stores messages; a compact receipt supports node grouping

AgentSession remains the only full-message owner. Narrative started turns freeze a small typed receipt containing ConversationId, TurnId, CharacterVersionId and optional Storyline/Version/Node identities. The receipt supports audit and read-only grouping; it does not copy node content or claim progress. Current full `CharacterStorylineRun` JSON context payload is replaced by a bounded authored node projection plus receipt.

Compaction may discard model context text but cannot remove the transcript record or Chara authoring facts. Reopening rematerializes node context from exact immutable StorylineVersion and verifies the receipt. If the source publication is unavailable, the affected Conversation shows a local diagnostic and does not select a newer version.

Alternative considered: persist a second StorylineDialogueSegment aggregate. Deferred because current consumers only need per-turn node grouping; adding another durable record would duplicate Agent transcript lifecycle without an independent owner.

### 8. Narrative context has separate user and character projections

Chara produces two projections from the selected node:

- user Timeline/context projection: Storyline structure and consumer-visible background, subject to author/consumer spoiler policy;
- character turn projection: only current situation, allowed predecessor summary, narrative memories and knowledge/behavior boundaries.

Forbidden future facts and author-only notes never enter the character Agent context. Narrative does not read CompanionMemory or arbitrary attachments. In Room, each Character participant receives its own projection plus visibility-filtered RoomView.

Alternative considered: send the full StorylineVersion to the model. Rejected because it leaks future facts, wastes context and makes authored UI visibility equivalent to Character knowledge.

### 9. Workbench composes exact surfaces without a universal Chara renderer

The Character Interaction Scene keeps bounded slots:

```text
interaction -> Agent/Room conversation
main        -> one exact Character Presentation surface
right       -> Companion or Narrative context / Room participant manager
bottom      -> optional Storyline Timeline and/or RoomEvent Timeline
status      -> local diagnostics
```

Main ref is a strict owner-qualified union. Chara may select a representation ref; an owning provider supplies the authorized Surface ref. Host registry maps exact identity to one handler, with duplicate registration and unknown surface rejected. No first-compatible renderer, provider fallback or raw Webview/Game handle is permitted.

Storyline Timeline is authoring structure; RoomEvent Timeline is shared runtime event order. They are rendered separately even when both occupy the bounded bottom region. Clicking a Storyline node inspects it or starts an explicit new Conversation; it never mutates current binding.

Alternative considered: preserve fixed Avatar Main and embed other surfaces inside it. Rejected because Avatar would become a wrapper/authority for unrelated Web, World or Gameplay runtimes.

### 10. Desktop remains a thin trust-boundary adapter

`packages/host` owns version-free Scene/slot validation. `packages/chara-webview` owns Character context, participant and Timeline rendering. `apps/neko-desktop` retains only:

- sender/renderer-session/Window/Scene matching;
- preload exposure of minimal typed ports;
- local resource and path authorization into opaque descriptors;
- concrete public-port wiring and React portal composition;
- Electron Window detach/dispose handling.

It must not select mode, resolve continuity compatibility, filter Narrative facts, choose Storyline nodes or decide memory promotion. Those rules remain testable without Electron in `@neko/chara` or Agent application services.

### 11. Product promotion remains an independent gate

All new package paths and isolated fixtures remain unreachable from the production Character Entry until the existing promotion contract is satisfied by a later change. The gate is not a feature flag and no legacy Character route remains as fallback. Visible unavailable behavior and durable-record preservation continue to be tested at Desktop Host and Agent Entry boundaries.

### 12. Builtin Agent input descriptions are localized only at the Webview presentation boundary

The canonical Skill and command catalogs keep their exact portable descriptions used for discovery, execution and Agent behavior. Agent Webview maps an exact OpenNeko builtin Skill or command identity to a locale-owned presentation key when rendering Entry cards or composer suggestions. Locale switching therefore rebuilds display text without changing command names, Skill content, catalog identity, invocation arguments, prompt injection or execution receipts.

Personal, project and plugin Skills plus project and plugin commands retain the description authored by their package and are never overwritten by a name-only OpenNeko translation. An unknown builtin description also remains visible as its canonical source text; missing presentation coverage cannot make an input unavailable or substitute another input. This is a bounded presentation projection, not a localized command alias, Skill protocol, package mutation or second catalog authority.

Agent Evaluation disposition is `excluded`: this change does not alter command or Skill selection, activation, prompt composition, Tool routing or model behavior. Deterministic Webview presenter, menu, locale-bundle and Entry-card tests prove the affected presentation path; real provider execution cannot observe a different Agent behavior from this projection-only change.

### 13. Composer candidate selection uses background and border without a leading accent bar

Composer command, Skill and mention candidates share one row presentation. Hover, focus and keyboard selection retain their existing background, border, text contrast, `aria` state and navigation behavior, but do not render an inset leading-edge accent. This is a visual-only change at the Webview boundary and does not alter candidate ranking, selected identity or invocation.

## Risks / Trade-offs

- [Stable continuity crosses CharacterVersion boundaries incorrectly] → every memory keeps exact source version; the canonical projector validates compatibility against the selected publication and exposes local diagnostics without rewriting facts.
- [Character introduces another Agent execution path] → register Chara as an Agent domain-context provider and submit every single/Room participant turn through Agent public application services; poison Desktop special branches, direct AgentWorkspace calls and Character-owned provider/tool policy.
- [A Character tool call bypasses Agent authorization] → Character context may influence intent but Agent remains the only Skill/Tool catalog, Approval and permission owner; validate exact Conversation configuration and standard tool lifecycle in producer/consumer tests.
- [Narrative accidentally inherits Companion capabilities] → Agent intersects the exact participant configuration with the frozen mode constraint, freezes an empty Narrative Skill/Tool receipt and rejects activation or tool requests before prompt exposure/provider execution.
- [One role's model or capabilities leak to Room siblings] → role/participant manager commands name the exact participant Agent Conversation; receipts and tests prove updates affect only later turns for that owner and never a global Character setting.
- [Assistant/Workspace Chara invocation becomes a hidden roleplay path] → expose only owner-qualified Chara capability operations through the Agent catalog, keep Conversation binding unchanged, return explicit artifacts/Conversation handoff refs and poison direct responder/runtime calls outside the public primitives.
- [Global and project-local destinations become implicit routing] → require an explicit operation-level destination and fresh CharacterProject label, freeze the exact Host grant/target receipt, and create nothing on cancellation; never choose active/recent Workspace.
- [Character validation mutates facts or gains Workspace tools] → validation responder always uses no tools, evidence stays turn-scoped, reports are project-local and every suggestion requires the existing confirmation path.
- [Removed Assistant lane remains reachable through stored rows or package exports] → delete its contract/service/repository/table/exports and add source/decode poison tests; preserve any pre-promotion fixture rows only as invalid local diagnostics or explicit offline cleanup data.
- [External material silently becomes memory or canon] → per-turn owner refs only; promotion requires an explicit Chara candidate/authoring command and provenance receipt.
- [Narrative loses useful personal context] → StorylineNode authors the exact narrative memories and relationship state; CompanionMemory remains deliberately unavailable to preserve the closed story premise.
- [Timeline is mistaken for progress] → remove Run/completion fields, label it authored structure, and limit actions to inspect/new Conversation.
- [Storyline publication replacement breaks old Conversations] → freeze exact version/node receipt and fail locally when unavailable; never resolve latest.
- [Presentation extensibility becomes arbitrary plugin execution] → strict public Surface union, exact provider identity, Host authorization and no wildcard/default registry.
- [Large Character/Room context exceeds model budget] → package-owned bounded projection selects current node, accepted memory view and visibility-filtered RoomView; full Timeline and author notes remain UI-only.
- [Old StorylineRun records are lost] → preserve stored bytes and catalog diagnostics; provide explicit offline export/cleanup or author reconstruction, with no silent conversion into new Storyline facts.
- [Overlapping active OpenSpec changes encode opposite behavior] → update or supersede conflicting requirements before implementation and run cross-change OpenSpec checks; no code lands while both canonical paths are claimed.
- [A third-party Skill reuses an OpenNeko builtin name] → localize only entries whose Host source is exactly `builtin`; personal, project and plugin entries keep their package-authored description.
- [A third-party command reuses an OpenNeko builtin name] → localize only entries whose Host source is exactly `builtin`; command artifacts and plugin commands keep their package-authored description and exact executable identity.

## Migration Plan

1. Align active OpenSpec and Chara domain documentation, marking this change as the sole successor for Conversation modes, Storyline runtime, memory continuity and Workbench context. Remove conflicting future-Composition and runtime-Storyline requirements/tasks before code changes.
2. Introduce the new single canonical Storyline/Version/Node and Conversation mode contracts, strict codecs and poisoned-old-shape tests. Update all producers, consumers and fixtures atomically; do not add optional compatibility fields.
3. Replace Storyline runtime repositories/services with Storyline authoring repositories/services. Preserve old raw records outside the new reader's success set and expose record-local diagnostics plus explicit offline export/cleanup tooling.
4. Introduce stable Companion continuity and exact memory provenance, then atomically replace CharacterRun-owned memory scope reads. Validate existing accepted memory data without rewriting source content.
5. Replace Narrative external Composition rejection with independent exact Narrative launch and bounded node context. Delete StorylineRun creation/transition/CAS and poison the removed public operations.
6. Delete the package-only Companion Assistant lane and migrate Character/Room execution from Desktop special branches and direct AgentWorkspace calls to the canonical Agent launch/turn/domain-binding path. Register Chara context and mode-constraint providers, keep Agent-owned per-participant model/Skill/Tool/permission receipts, prove Companion tool calls use the normal Agent lifecycle and Narrative exposes none.
7. Register the authoring-only `character-creator` Skill and owner-qualified creation/preview/validation primitives as a standard Assistant/Workspace Agent capability. Preserve direct typed invocation arguments, collect an explicit standalone/project-local destination and create an exact fresh CharacterProject before model execution, keep the originating Conversation binding stable, use the standard Tool approval as the single mutation confirmation, keep validation responders tool-free, and remove any direct package/runtime shortcut or legacy Skill alias.
8. Replace fixed Avatar Main/Runtime summary with strict Presentation Main, Companion/Narrative context manager, participant manager and separate Timeline projections. Make provider/model and Companion capability controls target an exact participant through Agent public configuration ports. Update Host Scene, preload and Desktop composition atomically.
9. Run focused package, Node persistence, Agent, Host, Webview and Desktop tests/typechecks plus boundary, internal-versioning, legacy-debt and unused-code gates. Run visible isolated Electron flows for every reachable prototype state.
10. Add provider-backed Agent Evaluation covering prompt/material-driven Character draft creation, explicit confirmation, no implicit publication/runtime creation, the same minimal CharacterVersion across exact per-participant Agent configurations, a Companion tool call, Narrative no-tool enforcement, Companion memory/material context, validation and Room participant isolation. Keep unavailable provider/capability/permission failures blocked rather than adding Character fallback execution.
11. Keep the product promotion gate closed; a later dedicated promotion change may remove it only after real visible repeated-behavior evidence and user-data review.

Rollback is performed by reverting the complete change before any product promotion. No runtime dual-read or mode fallback is retained. Because old records remain preserved rather than rewritten, rollback can restore the old reader without having overwritten authoritative user bytes; records created only under the new canonical contract remain locally invalid under the old reader and must not be silently converted.

## Open Questions

- Which existing Content/Workspace context providers are qualified for the first Companion external-material allowlist? Unsupported kinds must remain unavailable instead of using generic raw payloads.
- Should the first model-comparison action duplicate a Conversation automatically or require an explicit “new Conversation with this model” confirmation? Configuration editing remains in the exact role/participant manager either way, and comparison must preserve separate transcript owners and the same CharacterVersion receipt.
- Should Storyline user Timeline expose future-node titles by default in consumer mode, or require an author-defined spoiler visibility field? Character turn projection remains restricted in either case.
- What explicit user workflow should handle preserved legacy StorylineRun records: read-only JSON export, authoring reconstruction candidate, deletion, or a bounded combination? No option may auto-create new Storyline facts.
