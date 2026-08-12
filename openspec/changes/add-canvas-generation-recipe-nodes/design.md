## Context

当前实现已经由 `@neko/generation` 提供 Workspace-qualified GenerationJob owner，并允许 Agent Tool 与 direct operation 共用媒体 Job；但 Canvas 尚无可持久编辑和重复运行的生成节点。现有路径存在以下 gap：

| Gap             | Current behavior                                                      | Required behavior                                                                              |
| --------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Add catalog     | Text/Table 直接创建 Markdown；Image/Audio/Video 创建或导入 Media      | 目录只保留 Text/Image/Audio/Video，并创建对应 Generation Node；Table/3D 不再暴露为基础节点入口 |
| Canvas contract | canonical node type 只有 `markdown/media/group/job/file/canvas-embed` | 增加一个严格 union 的 `generation` node type                                                   |
| Creation        | `requestDraft?` 是可选 media-only port，生产 runtime 不提交新 Job     | exact Canvas authoring command 创建/编辑/运行节点                                              |
| Projection      | 每个 Job 创建一个 Job 节点，成功后再创建 Media/File 节点              | Job 状态和当前结果投影回发起的 Generation Node                                                 |
| Prompt          | GenerationJob request/result/committer 只支持媒体                     | Prompt/Text 使用同一 Job owner 并提交 durable text artifact                                    |
| Agent UI        | Agent composer 暴露 Image/Video/Audio direct modes 和独立状态         | composer 只保留 Agent 对话；媒体仍通过 typed Tool 生成                                         |
| Recovery        | JobRef 在提交后才产生，Canvas 无 durable submission correlation       | 先持久化 exact run request，再幂等绑定一个 JobRef                                              |
| Inputs          | 现有 summary 只有历史 prompt 和 Canvas node IDs                       | 运行时解析 typed ports 为稳定文本快照或授权 ContentLocator                                     |
| History         | 历史由分散 Job/Media 节点表达                                         | 原节点保存输出关系和当前选择，Job/Asset 保持事实 owner                                         |

### Five-layer analysis

| Layer          | Decision                                                                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Canvas owns Recipe, graph inputs, exact-node run binding and current-output selection; Generation owns execution, Job persistence and artifact commit; Agent owns Turn/Tool scheduling; Desktop owns Electron trust/config/resource adapters.   |
| Dependency     | Canvas Domain remains host-neutral; Canvas Node depends on public Canvas/Generation/Content ports; Webview consumes typed Canvas host messages; Generation never imports Canvas/Agent/Electron/React.                                           |
| Interface      | One canonical Canvas Generation application port creates, updates, runs, observes, cancels and selects output for one exact node; one Workspace GenerationJob port executes all supported kinds.                                                |
| Extension      | New generation kinds require a real typed Recipe, purpose/model capability, executor and renderer; no wildcard kind, JSON parameter bag, default provider or dormant Agent mode is introduced.                                                  |
| Test           | Domain tests prove codecs/state transitions; delegation tests prove one Job owner; Electron tests prove sender/target/resource boundaries; Agent Evaluation proves the retained natural-language Tool path and absence of direct-mode fallback. |

## Goals / Non-Goals

**Goals:**

- Make the Canvas Generation Node the only parameterized direct-generation surface.
- Persist reusable Text/Prompt, Image, Audio and Video recipes without making Canvas a Job or Asset owner.
- Fill successful results into the originating node while preserving immutable Jobs, output history and current selection.
- Keep Agent natural-language generation on the canonical Turn -> Tool Call -> GenerationJob path while removing direct media modes from the Agent composer.
- Recover safely across renderer unmount, Canvas reopen and application restart without duplicate provider submissions or cross-document writes.
- Fail visibly and locally for invalid recipes, stale identities, missing inputs, unavailable models, failed Jobs and blocked result apply.

**Non-Goals:**

- World generation, 3D model generation, 3D Director redesign or placeholder future model kinds.
- Automatic downstream execution, whole-graph scheduling, cycle planning, batch workflow techniques or implicit cost-producing reruns.
- A new generic Job manager, provider fallback, Agent-specific generation session or Canvas-owned provider/config registry.
- Automatic migration of historical Job/Media nodes into Generation Nodes, or deletion of their durable content.
- Replacing the existing Media Node used for imported, dragged or Agent-delivered assets.

## Decisions

### Canvas owns one persistent Generation Node contract

`@neko/canvas-domain` adds one canonical `generation` node whose data is a strict discriminated union for `prompt`, `image`, `audio` and `video`. The node persists:

- an authoring-oriented Recipe with explicit kind, prompt/instruction, exact model selection and kind-specific parameters;
- one latest run binding containing a stable submission request identity, optional canonical JobRef and a content fingerprint of the submitted Recipe/input snapshot;
- stable output bindings containing JobRef, generated-output locator, output kind and source Recipe/input fingerprint;
- the exact currently selected output identity.

Canvas connections remain the authority for graph relationships; the Recipe does not duplicate connected node IDs in a second input list. Job phase, provider task state, generated bytes and asset metadata are never copied into `.nkc`. The node contains no schema/contract version or generation number. Output/Job identities are user-visible generation history facts, not internal format versions.

The source Recipe/input fingerprint is consumed only to show whether the current editable Recipe still matches a result and to fence result apply. It is not node identity, schema dispatch or migration state. It can be removed only if the system can otherwise prove that a terminal result belongs to the exact submitted Recipe/input snapshot after concurrent user edits.

Alternatives considered: four node types would duplicate codec/render/authoring paths; storing a generic JSON parameter bag would weaken validation; keeping Recipe and output as separate default nodes would recreate the cluttered Job/Media graph the change replaces.

### The add menu creates the direct-generation surface

The package-owned Canvas add catalog exposes only Text, Image, Audio and Video and creates their matching empty Generation Nodes. Selection opens one Canvas-owned editor surface that exposes prompt/reference inputs, purpose-qualified model selection and only parameters legal for that kind. Table and 3D Director remain outside this basic-node catalog; existing Markdown/File records stay readable and no historical content is converted.

There is no second Canvas quick-generate dialog, transient direct form or “save as Recipe” flow. A Generation Node is already both the direct control and the saved Recipe. Imported/dragged assets continue to create Media nodes and never acquire Recipe authority.

The renderer sends typed authoring intents through the existing browser-safe Canvas host runtime. It never reads credentials, configuration files, local paths, Job stores or provider APIs.

Default node density is a Canvas Domain authoring contract rather than a Webview-only style constant. One canonical compact size catalog is consumed by Webview creation, Headless authoring and Generation authoring, with content-kind resolution for audio and Generation recipes. Workspace Board projection uses the same compact media width while preserving intrinsic image aspect ratio. Minimum resize bounds remain smaller than the defaults so creators can deliberately compact a node further without losing pointer targets. Existing persisted node sizes remain authoritative and are never rewritten merely because the canonical defaults change.

### Selection presentation separates actions, content and generation input

Canvas selection uses three presentation layers with one durable node identity:

1. the existing selection context toolbar owns node actions, identifies the exact selected node kind and keeps common actions directly reachable as compact icon controls above the selected content;
2. the Canvas node owns only its Text/Image/Audio/Video content presentation and current generated output, using the same visual grammar as an ordinary referenced node of that content kind;
3. a package-owned Generation input composer appears only for one selected Generation Node, remains anchored to that node's current screen-space bounds as a compact adjacent control surface, and edits that node's Recipe, connected-reference summary, exact model, legal parameters, output selection and run/cancel state.

The input composer is derived from the exact selected Generation Node, current connections and Host runtime projection. It is not stored as a Canvas node, does not duplicate Recipe or Job facts in a presentation store, and unmounts when selection changes. It does not repeat a generation heading or phase. The selection toolbar, content node and composer share one screen-space attachment contract: the toolbar remains above and the composer remains below the exact node during drag, pan and zoom. If the complete stack cannot fit at the current viewport position, Canvas pans the viewport to contain the stack instead of independently clamping, flipping or detaching either accessory. The empty node uses a kind-specific content placeholder on a white/light-glass neutral node surface with one shared subtle border and shadow, running state is a lightweight local overlay, and a successful result replaces that content area. Ordinary imported/referenced Media, Markdown and File nodes therefore render only the labeled action toolbar and content node.

All four kinds share one composer skeleton: a functional reference-add control, reference summary, one proportionate prompt area, one compact footer for exact model and legal kind-specific parameters, output history when present, and a fixed run/cancel icon control. The composer follows node movement, Canvas pan and zoom at a fixed gap below the node and shares its horizontal center; it never independently flips above or clamps away from that node. Its body, footer, selection toolbar and popovers use one elevated white/light-glass surface family instead of reusing the tinted Canvas background or introducing separate gray bands. Their individual buttons and option rows are transparent at rest, with borders and restrained neutral hover/selected/focus states; destructive actions use danger foreground plus a soft interaction tint rather than a saturated fill. This keeps surface hierarchy in the container instead of stacking conflicting backgrounds on every child control. The reference-add control sends one typed Host intent that authorizes a Workspace source, creates exactly one material node and one `reference` connection to the selected Generation Node in the serial Canvas command stream; cancellation or invalid selection changes neither. Differences remain typed Recipe fields rather than separate cards or alternate UI flows.

The reference area accepts the existing Resource Browser `ContentLocator` drag contract. A Workspace locator is attached as a reference without copying. External-directory content is never retained by raw path: the explicit import action first asks the Host to create a durable Workspace locator and then authors the material node plus exact Generation reference. The two origins remain visible in the source chooser and share the same Canvas material authoring owner.

The footer never asks the user to type provider IDs, model IDs, aspect ratios or resolutions. Desktop projects a secret-free model catalog from the exact Workspace `ConfigManager`; each entry contains only display labels and an exact purpose/provider/model binding. Canvas Webview filters that catalog by the selected Recipe mode, presents model and provider inline in each option, and leaves an unavailable persisted binding visible as invalid instead of replacing it with another configured model. Kind parameters use a bounded Canvas-owned presentation catalog backed by existing typed Recipe fields: aspect ratio, image quality/count, video resolution/duration/fps and audio duration/format. Portal-rendered model and parameter overlays carry the owning composer's measured width context, are clamped to the owning Canvas viewport rather than the Desktop window, and use a multi-column grouped grid with bounded internal scrolling. This catalog is presentation metadata, not provider truth, and provider-specific unsupported combinations still fail visibly at the canonical Generation boundary.

The image composer follows the compact reference layout rather than treating every Recipe field as one generic settings menu. Its body has a fixed reference row, a prompt region that expands to consume remaining editor height and one non-wrapping footer. Model and provider remain one selector; aspect ratio, resolution and quality share one summary and a bounded `380px`-class parameter surface; output count is a separate compact summary with a narrow vertical `1..4` popover. This is presentation decomposition only: both popovers update the same canonical Image Recipe, commit through the same Host intent and never create a second parameter owner. The image ratio catalog includes common square, landscape, portrait and wide formats in a five-column card grid, while resolution uses explicit 1K/2K/4K choices and quality presents low/medium/high labels mapped to the existing typed quality states.

Selected-node operations use one ownership split. The action toolbar owns content editing, Canvas-local full-screen image preview and duplicate controls. The node context menu retains only graph/layout/workflow operations such as grouping, layer order, playback entry and sending context to Agent; it does not repeat copy, cut, duplicate or media editing. Resource-browser operations, including revealing files in Finder and project/global Media Library archival, remain outside Canvas entirely. Canvas-local image preview is an immersive overlay over the Canvas viewport using the exact selected output locator; closing it restores the unchanged selection and viewport instead of navigating to the main Preview scene.

The immersive Image preview is one Canvas-owned gallery presentation rather than a second editor or durable result selector. An ordinary Image contributes one gallery item; a Generation Image contributes every committed Image output from the selected output's exact Job, opens at the selected or directly activated item and keeps gallery navigation local to the overlay. Previous/next controls, Left/Right keys and a compact thumbnail strip change only the overlay index, never the Generation Node's canonical selected-output identity. The overlay owns fit-relative zoom and pan, resets that transform when the active item changes, and intercepts wheel, pointer and navigation-key input so the covered Canvas viewport cannot move underneath it. Double-clicking exact Image content opens the same canonical overlay request while the selected-node toolbar remains the explicit accessible entry point.

Local whole-document mutations such as duplicate/paste commit their updated document and presentation into the canonical per-session Host command queue before selected-node capability resolution runs. This ordering is established by the Canvas Root synchronization lifecycle, not by retrying stale node identities or suppressing action-resolution diagnostics. Once committed, a duplicated referenced or generated Image resolves actions from its own new node identity while retaining the immutable content locator.

New nodes are initialized once at Host authoring time. The exact configured purpose default, or the configured model-type default when no purpose override exists, is projected as a catalog fact and copied into the new Recipe together with canonical kind-specific typed defaults. A still-empty Recipe created before the default catalog was available may adopt the exact currently configured default once when its composer first becomes authorable; this is persisted through the same typed Recipe update and is not list-order fallback. Recipes with authored prompt/reference/output/run state or an existing model are never rewritten merely because the configured default changes. A missing or invalid configured default leaves the model unset and visible as unavailable; the Webview never picks the first model as fallback.

Audio and music remain one `audio` Recipe discriminant because they produce the same Canvas content kind and share the same Generation Job lifecycle. The typed `isMusic` field selects one of two explicit composer tabs. Speech/sound mode requires `audio.generate`; music mode requires `audio.music.generate`. Switching modes clears an incompatible exact model binding and applies only the explicitly configured default for the new purpose (or its configured audio-type default); when neither is valid it remains unset and never tries another provider or the first listed model.

Alternatives considered: keeping the form inside the node couples node dimensions to editor state and obscures the generated result; forcing the composer to the node's width makes it read as another graph node; creating a second "prompt node" duplicates Recipe authority; a global inspector or fixed viewport-bottom composer weakens the visible relationship to the current selection; independently flipping or clamping the toolbar/composer makes selection accessories appear detached. The adjacent composer remains wider than the content node for authoring, but follows the node without participating in graph layout or transform scaling.

### Webview and Host mutations share one ordered command stream

The Webview currently projects ordinary edits as a whole-document `replace-document` intent while Host-owned Generation/source actions use narrow typed intents. These are different intent shapes but they mutate the same authoritative Canvas and therefore must enter one per-session serial queue in user-observed order.

The Canvas Webview Host queues document status replacement, Generation creation/edit/run actions, material authoring and other Host effects behind the same operation tail. A narrow action never reads the Host snapshot until all earlier Webview document mutations have committed. Runtime projection events originating from the local command remain acknowledgement snapshots rather than an independent write path.

This ordering ensures that deleting a node and then adding a Generation Node produces `deleted document -> document plus new node`; the add action cannot execute against the pre-delete snapshot and restore removed nodes or connections. The fix does not add revision fallback, merge heuristics, dual authority or automatic repair. External commands remain authoritative projection events and are applied only through the existing exact session identity and monotonic event sequence.

### Material actions are capability-owned and media-specific

The selected-node toolbar presents one compact action grammar for referenced File/Media nodes and for the immutable selected output of a Generation Node. Canvas Domain owns stable action identities and the capability-owner catalog; Canvas Webview owns their icon and primary/overflow placement. A Generation Node without a selected successful output contributes no material target. Prompt output is projected as a document target; a generic File without a more specific `mediaKind` uses the canonical `document` meaning of the File node contract, while an explicit kind remains authoritative and file extensions never participate in capability identity. Workspace text files reuse the Text Editor owner, all stable content reuses Preview/Finder owners, and Audio/Video reuse the current Cut handoff. Resource archival actions such as Save Material or copying to project/global Media Library remain owned by Resource Management and are intentionally omitted from every Canvas toolbar position even when the Host contributes their descriptors. Canvas overflow is one flat ordered list of executable actions without category labels or nested action groups. Video audio separation is a Cut-owned compound handoff: the exact selected locator is imported into the exact Cut target once, then Cut applies its existing canonical `separate-audio` command to the imported Clip in the same owning application operation.

BaseNode owns one external content-label slot above the card. Ordinary Media, File and Generation renderers provide only the icon and resolved display name to that slot; they do not position labels inside preview/player content or append a footer below the card. Media labels use the authored title or source basename, while File labels resolve only the basename from durable path/title facts. This keeps title placement independent of preview chrome and prevents card overflow rules from hiding File names.

Advanced reference actions use explicit identities: Audio voice denoise; Video audio separation, enhance/frame interpolation, frame extraction, subtitle removal/generation, color grading and editor tools; Image crop, upscale, redraw, erase, outpaint, background removal, color grading, rotate, grid split and editor tools. These identities are presentation and dispatch contracts, not claims that an implementation exists. An action appears only when an active exact owner contributes its descriptor and can execute the same identity. Canvas never synthesizes disabled/no-op success actions from the selected file type and never reroutes an unavailable operation through Agent, Generation fallback or another provider.

Delete is intentionally absent from the selected-node toolbar and the flat overflow list for single and multiple selection. Canvas keyboard ownership remains canonical: Delete and Backspace remove the current selection only while the Canvas focus boundary owns the keystroke, and editable input boundaries continue to consume those keys locally. Duplicate and Group remain Canvas-local authoring actions because they have real Webview owners.

### Run submission is durable and idempotent across the Canvas/Generation boundary

Running a node is a two-owner operation and cannot rely on an in-memory callback:

1. Canvas validates the exact document/session/node, current document revision, Recipe and connected inputs.
2. Canvas resolves inputs to immutable text/digest facts or authorized ContentLocators and derives the exact generation purpose.
3. Canvas persists a run binding with a new stable submission request identity and Recipe/input fingerprint before external execution.
4. `@neko/canvas-node` submits the typed request to the exact Workspace GenerationJob owner using that submission identity.
5. Generation atomically returns the existing JobRef for an equivalent repeated submission identity or creates exactly one Job; a conflicting payload for the same identity is rejected.
6. Canvas binds the returned JobRef to the same run record and observes snapshot-first monotonic Job updates.

The stable submission identity is owned by Canvas authoring and consumed by Generation only as an idempotency key. It exists because Canvas document persistence and Generation Job persistence cannot share one transaction; without it, a crash after provider submission but before `.nkc` update can duplicate paid work. It is not a version field, routing generation or alternate success path.

A provider adapter may prove that a synchronous paid submission lost its transport only after the
request was sent while exposing no recoverable provider task identity. The adapter preserves that fact
as one provider-neutral execution outcome signal. Generation then terminates the exact Job as
`outcome-unknown` even though no provider task can be reconciled. It never converts the signal to an
ordinary retryable failure, invents a task identity, reports success or automatically resubmits paid
work. An explicit user rerun remains a distinct Job and retains the prior diagnostic.

One Generation Node permits one non-terminal run at a time in this change. A second run request is rejected visibly; the user may cancel the active Job or wait for terminal state. Editing the Recipe while a Job runs is allowed, but the UI marks the result as originating from an older fingerprint.

The Canvas Host runtime projection is one canonical package-owned contract across Node/Main, preload
and Webview. Its optional `recipeStale` fact is produced when the editable Recipe no longer matches the
submitted Recipe/input fingerprint and must be validated and preserved by the same snapshot decoder as
the other Generation projection fields. The decoder must still reject unknown fields and invalid boolean
values visibly; it must not strip the stale marker, accept an alternate shape or turn one valid projection
into a Canvas load failure. This projection contains no durable user data and requires no migration.

Alternatives considered: submitting before persisting the run can orphan paid Jobs; persisting a fabricated JobRef violates Generation ownership; a Canvas-local Job store duplicates authority; allowing concurrent runs adds selection races without a current product need.

### Terminal results update the originating node, not the graph topology

On successful Job commit, Canvas Node invokes one package-owned result-apply operation carrying exact document/session/node identity, submission identity, JobRef, Recipe/input fingerprint and committed output locators. Canvas verifies the run binding and atomically appends new output bindings, selects the newest output, and saves `.nkc`.

The operation does not create Job, Media, File or Group sibling nodes and does not enqueue a Workspace Board mirror. Multiple outputs remain selectable inside the Generation Node. A user may later drag the same durable asset from the Asset Library to create an ordinary Media Node, but that node contains no Recipe.

If a newer run owns the node, the node was deleted, the document target changed or the authoritative revision cannot be safely replanned, only that result apply is blocked. The Job and artifact remain durable, a diagnostic is recorded through the owning Canvas/Job projection, and no active/recent Canvas or new Media node is selected as fallback.

During rerun the node continues showing its prior selected output with a running overlay. Success selects the new output; failure or cancellation preserves the prior output and displays the current Job diagnostic. Selecting an older output changes the node’s downstream output without mutating or deleting any artifact version.

Generation progress is projected from the authoritative GenerationJob rather than inferred from animations. The Canvas runtime projection carries the Job phase, provider-derived progress and authoritative creation/update timestamps; the Webview derives a compact stage label and elapsed duration from those facts. Active nodes may use a restrained scanning treatment, but the animation is never presented as percentage progress or completion evidence. Completed, failed and cancelled runs use the same timestamps for final elapsed duration, without an estimated remaining time.

One Job's image outputs are presented as one result group inside the originating Generation Node. Before any output commits, an active multi-image request keeps one content surface and exposes only the requested count badge, scan state and authoritative progress; completed-result grid cells are not rendered in this pending state. After two or more outputs commit, the node presents every member from that Job simultaneously in a bounded two-column grid: two outputs form one side-by-side row, while three or four outputs form a compact two-row grid. The durable Canvas node size does not change. Each cell remains a direct selection target, and choosing one updates the existing canonical selected-output identity with a restrained selected outline while every sibling preview remains visible. The exact output count remains visible, but a collapsed stack, current-index carousel and separate comparison toggle are not required for discovery. Historical outputs from other Jobs remain available through the same output selection contract. Canvas does not fabricate per-output failure slots when the provider/GenerationJob contract reports only one Job-level terminal failure, and it does not automatically expand grouped results into sibling nodes.

Prompt/Text results are committed as immutable generated-output content with stable digest/locator. Rendering or selecting them does not turn Job storage into editable Canvas authority. An explicit text edit creates Canvas-owned authored text state derived from that output and preserves the original generated artifact/provenance; it never rewrites the generated output in place.

### Connections supply typed inputs and expose only the selected result

Generation Node ports use the existing Canvas `text/image/audio/video` data types. On run, Canvas resolves only explicitly connected inputs and the node’s own Recipe; it does not inspect active selections, nearby nodes, labels or recent resources. Text inputs are snapshotted with a digest, and media inputs become authorized stable ContentLocators. Runtime URLs, blob/data URLs, cache paths, raw paths, Window/View handles and missing locators are rejected before Job submission.

Downstream consumers read only the selected output of an upstream Generation Node. A node with no successful selected output is unavailable as an input. Upstream edits or output selection changes do not automatically execute downstream nodes; they only change what a later explicit run will resolve.

### Generation expands one canonical Job union without becoming Agent or Canvas

`@neko/generation` extends its strict Job request/execution/result union with Prompt/Text generation. The Host provides an exact `canvas.prompt` purpose binding and a narrow prompt completion execution adapter; Generation owns Job lifecycle and durable result commit without importing `@neko/agent-runtime` or creating a Pi Session/Conversation.

The existing image/audio/video request branches remain typed. The result committer accepts a strict generated-artifact union and returns stable generated-output locators for text or media. Provider-specific capabilities stay inside provider adapters, and unsupported kind/model combinations fail before Job creation. There is no wildcard executor, media fallback for prompt, or provider try-next behavior.

Canvas consumes Generation through `@neko/canvas-node` and its package-owned public application port. The current optional `requestDraft`, Job-node projection, material-result regeneration path and Agent Webview `DirectGenerationOperationPort` success path are replaced rather than retained alongside the new flow.

### Agent keeps Tool generation and removes direct composer modes

`@neko/agent-webview` exposes one Agent composer mode. `@neko/agent-contracts` no longer models Image/Video/Audio as Agent session modes, and Agent Draft/Conversation submit no longer branches to a direct generation provider. Purpose-qualified media model bindings remain available to the Agent Turn and typed Generation Tools.

Natural-language generation therefore remains:

```text
Conversation -> Agent Turn -> approved typed Tool Call -> Workspace GenerationJob -> artifact -> Conversation/Board projection
```

The exact purpose-model selections made in the Agent composer are part of the immutable Turn input.
They cross the Draft first-submit boundary, are retained with the pending Turn for restart-safe provider
execution, and are resolved against the same Workspace `ConfigManager` that owns the generation model.
Generation models enter the Agent model policy as domain-executed purpose bindings; they are not registered
as Pi chat models. Tool discovery consumes that policy, so a configured `image.generate` binding exposes the
approved image Tool even when `agent.main` is a text-only model such as DeepSeek. A missing, stale,
provider-mismatched or capability-mismatched binding fails the affected Turn visibly and never falls back to
another configured model.

The composer change does not remove Generation Tool registration, generated artifact records or Workspace Board delivery. Direct media controls are removed from the Agent consumer rather than hidden behind CSS, a feature flag or an unreachable handler. Future World/3D capabilities must enter through real capability/tool contracts or a later Canvas kind, not by reviving dormant SessionMode branches.

### Agent and Canvas use different result targets through one Job owner

Agent-created creator-visible artifacts with no explicit Canvas target continue through `workspace-board-artifact-delivery`. Canvas Generation runs already carry an exact document/node authoring target and update only that document through Canvas authoring; they do not enter the default Board delivery ledger.

The Generation Job never chooses a Canvas. Agent terminal collection and Canvas run binding independently retain their target/provenance relationship to the same JobRef. A missing target fails in the caller’s owning boundary and never causes Generation to select an active Workspace, recent Canvas or Conversation.

### Ownership and runtime boundaries

| Owner / package role                 | Canonical public path                                                                        | Producer -> consumer                                 | Runtime boundary and retained responsibility                                                                | Replaced path / user-data impact                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `@neko/canvas-domain` L0             | Canvas node/types, `.nkc` codec, authoring/application and Host runtime projection contracts | Node/Main projection -> preload/Webview              | Host-neutral Recipe validation, run binding, result apply, current selection and strict projection decode   | Replaces Generation Job/Media graph projection for new runs; existing documents remain readable |
| `@neko/canvas-node` L1               | Canvas Generation application runtime                                                        | Canvas session -> `@neko/generation/job`             | Resolves authorized inputs, submits/observes exact Jobs and delegates result apply                          | Replaces optional draft/regenerate material runtime; no config or Job store owner               |
| `@neko/canvas-webview` L2            | Canvas Root and package-owned host adapter                                                   | User controls -> typed Canvas intents                | Node editor/renderer, progress and diagnostic presentation, authorized previews                             | Replaces direct Media creation for Text/Image/Audio/Video add actions                           |
| `@neko/generation` L0/L1             | root contracts, `/job`, execution adapters                                                   | Canvas/Agent Tool -> Job owner -> artifact committer | Strict request/result, idempotent Job lifecycle, provider task and durable output                           | Extends media-only Job union; removes Agent-specific direct-operation consumer path             |
| Agent contracts/runtime/webview      | package public entries                                                                       | Composer/Turn -> Tool -> Generation                  | Conversation identity, Tool scheduling, transcript and purpose facts                                        | Removes direct media composer modes without removing Tool generation or artifacts               |
| `@neko/content` / Preview / Assets   | existing public locator/read/preview/index ports                                             | Generation/Canvas -> content and preview consumers   | Stable locator validation, authorized reads and media rendering                                             | No new file/path authority; generated assets remain independently durable                       |
| `apps/neko-desktop` Application root | package public composition only                                                              | preload/Main sender -> exact package ports           | Electron sender/Window identity, Workspace grant, config/credential adapter, resource registry and disposal | Removes app wiring for Agent direct mode; retains only logic requiring Electron trust objects   |

Production logic retained in `apps/neko-desktop` requires actual `webContents` sender identity, Workspace root authorization, Electron lifecycle, native configuration/credential adapters or opaque resource registration. Recipe mapping, run idempotency, input resolution, output selection and recovery are host-neutral business behavior and therefore remain in the owning packages.

## Agent Evaluation

Authoring disposition:

- `update` and reuse `agent-runtime.workflow-controller` for one real natural-language media request proving Agent Turn -> typed Generation Tool -> exact Workspace Job -> durable artifact/Board projection after direct composer modes are removed.
- `update` the same suite’s forbidden-path evidence so Agent direct-operation submit, generation-specific SessionMode, provider/model fallback and alternate Workspace owner counters remain zero.
- `excluded` for Canvas Generation Node authoring and result fill because it is a non-Agent typed Canvas operation; deterministic Canvas/Generation tests and a visible real Electron functional case are authoritative. No direct runtime or Evaluation-only Canvas control is permitted.
- `excluded` for the static absence of Agent media mode controls; Agent contract/Webview tests and visible UI validation prove this presentation fact, while the real Agent case proves natural-language generation still works.

The positive Agent case must record effective provider/model purpose, Conversation/Turn/ToolCall identity, GenerationJob identity and terminal revision, durable artifact identity, Board delivery target and zero forbidden direct/fallback path facts. A failure case must prove missing or stale generation binding fails the Tool Call in the same Conversation without invoking a direct Canvas path or another provider.

Because Generation persistence/projection changes, implementation acceptance audits the foundational matrix: basic/multi-turn conversation, compaction continuation, owner/application reopen, generation-record restoration, Conversation switching and transcript/queue/config/context/artifact isolation. Unaffected cells may reuse current evidence but must be listed; provider-backed claims require the complete Desktop session owner and explicit cost authorization.

## Risks / Trade-offs

- [A crash occurs between Canvas intent persistence and Job binding] -> Use one stable idempotent submission identity and recover the same JobRef; conflicting payloads fail visibly.
- [A result completes after Recipe edits] -> Fence apply with request identity and Recipe/input fingerprint; preserve the result while marking it as produced from older inputs.
- [A node is deleted while a paid Job runs] -> Let the Workspace Job finish or honor explicit cancellation; retain the artifact and expose blocked apply without recreating the node or selecting another Canvas.
- [Generated text becomes editable] -> Preserve immutable generated artifact/provenance and create Canvas-owned authored text state instead of rewriting source output.
- [One combined node hides output history] -> Keep explicit output selection/history in the node inspector and stable output bindings in `.nkc`.
- [Removing Agent direct modes increases steps for exact parameter control] -> Keep precise controls in the visible Canvas node editor while Agent remains optimized for natural-language collaboration.
- [Adding Prompt/Text broadens Generation] -> Use one explicit union branch and narrow execution adapter; do not generalize into arbitrary workflows or a generic AI task system.
- [Historical generated Media nodes lose regenerate action] -> Preserve their content and provenance, remove only the parallel regenerate success path, and let users explicitly use the material as input to a new Generation Node.
- [A narrow Host action races a pending whole-document edit] -> Serialize both through one per-session Webview Host command queue and test delete-then-add ordering without snapshot merge or stale-content recovery.
- [A detached Generation editor becomes a second node or authority] -> Derive it only from the selected durable node, connections and runtime projection; unmount it with selection and persist edits solely through the canonical Generation Recipe intent.
- [Compact defaults make existing layouts jump or lose creator intent] -> Apply the new density only at node authoring/projection time, preserve every persisted user size, retain image aspect ratio and keep explicit resize controls.

## Migration Plan

1. Update the single canonical Canvas node union, codec, validator, factory, sizing, renderer registry and authoring commands atomically; add `generation` without schema/version fields.
2. Add idempotent Generation submission and Prompt/Text Job/result support before exposing the new Canvas menu entries.
3. Replace Canvas `requestDraft`/Job-node projection/material regeneration with exact Generation Node run/observe/apply, then poison tests for the removed path.
4. Switch Text/Image/Audio/Video add actions and UI to the Generation Node editor; keep Table/3D and imported Media behavior unchanged.
5. Remove Agent Image/Video/Audio SessionMode UI, contracts, direct provider/context/wiring and tests; retain and requalify Agent Tool generation.
6. Validate existing `.nkc` documents containing Markdown, Media, File and historical Job nodes without rewriting them. New runs never create the historical graph shape and no automatic conversion is attempted.
7. Complete deterministic, visible Electron, UI visual and focused Agent Evaluation gates before implementation is considered releasable.

The contract switch is forward-only and does not dual-read or dual-write generation shapes. A pre-release rollback may revert the implementation only before user documents containing Generation Nodes are created. Once such documents can exist, recovery is fix-forward; an older build must not silently drop or rewrite unknown nodes.

## Open Questions

None. Table, 3D/World kinds, automatic graph execution, concurrent runs per node and broader workflow packaging require separate product evidence and OpenSpec changes.
