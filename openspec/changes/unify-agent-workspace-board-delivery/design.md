## Context

Workspace Board 已具备共享 `CanvasWorkspaceProjectionRequest`、纯 `planCanvasWorkspaceBoardProjection()` 和 VS Code `NekoCanvasAPI.boards.project()`，但当前运行时存在两套直接 writer：VS Code Agent 通过 Extension API 调用 `CanvasProjectAuthoringService`，TUI 的 `NodeWorkspaceBoardProjector` 则独立执行 Node `fs` load-plan-save。两者只接收单个 generated asset，请求期间没有跨 Host ledger、target writer lease 或共同 revision transaction；多个 Agent、TUI 与已打开的 Canvas 同时修改 `workspace.nkc` 时会形成典型 read-modify-write 覆盖窗口。

共享契约已经声明 `markdown`、`file-reference` 和生成媒体 kind，Canvas 计划也能创建普通 Text/Document/Media 节点，但 Agent Host 只在 media delivery 中调用 generated-asset helper。实际读取的素材、reviewable Markdown artifact、后台/纯 Host 结果尚未进入同一 typed delivery。与此同时，Agent/Canvas 架构已经要求：Agent core 不拥有目标，未显式绑定 `.nkc` 的结果进入固定 Workspace Board，`.nkc` 是布局权威，历史/外部内容才走显式 authoring handoff。

本变更受以下硬约束约束：

- 用户级 `~/.neko/neko.db` 是 Extension/TUI 唯一本地结构化 metadata authority；不得创建 workspace DB、globalStorage DB 或 JSON fallback。
- LocalMetadata 长期核心 schema 固定为 18 张表。Board delivery 必须复用既有 `tasks` / `task_checkpoints`，不能新建 package-local 表。
- `.nkc` 是项目格式和用户布局事实源；SQLite 只能保存投递状态、claim 和 receipt，不能重建用户移动、分组、批注或删除。
- Agent transcript 仍由 Pi Session/Journal owner 管理。本变更的 delivery checkpoint 只在 artifact 已有稳定 identity 后协调 Canvas 副作用，不是 turn checkpoint outbox、conversation recovery 或第二 transcript authority。
- 本项目是本地单用户、多 Host/多进程产品。并发设计只处理真实的同一 workspace `.nkc` 文件竞争，不引入远程服务、分布式队列或云端锁服务。

### Five-layer analysis

| Layer          | Decision                                                                                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Agent/runtime 声明 typed artifact 与使用证据；Host 选择 default/explicit destination 并提交 delivery；Canvas domain 验证、协调和投影；LocalMetadata 保存本机 delivery state；`.nkc` 保存用户事实。                         |
| Dependency     | Agent core 只依赖共享 artifact/result contract；Host composition 依赖公开 Canvas delivery port；Canvas domain 依赖 `@neko/shared` 的 Canvas schema、ProjectFileStore 与 LocalMetadata ports；Webview 不参与文件或 SQLite。 |
| Interface      | 新增 batch envelope、artifact role、delivery result/diagnostic、ledger/coordinator/file mutation 小接口；删除 generated-asset-only Host 方法，不新增平行 command/router。                                                  |
| Extension      | 新 artifact kind 通过共享 discriminated union 与 Canvas node projector 扩展；新 Host 只实现 IO/mutation/presentation adapter；SQLite schema 不随 artifact kind 增长。                                                      |
| Testing        | 纯 contract/planner、SQLite transaction、Node/VS Code adapter、双 Host concurrency、crash-window、path-level no-fallback、TUI real Evaluation 分层验证。                                                                   |

### Existing owner and reuse audit

| Concern                     | Reused canonical owner                                                                           | Decision                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Agent artifacts             | Tool-result `attachments` / `artifacts`, CompositeArtifact snapshots, generated-output lifecycle | Collector only consumes successful stable evidence; it does not scan final answers, attachments, search candidates, or open files. |
| Stable material identity    | `ResourceRef`, `DocumentArchiveResourceRef`, `validateDurableResourceRef`                        | No package-local path/ref DTO or cache identity is introduced.                                                                     |
| Canvas schema and file IO   | `CanvasData`, `ProjectFileStore`, NKC codec, `createVSCodeProjectFileIoAdapter`                  | Canvas domain owns planning/coordinator; Host adapters only load and atomically save.                                              |
| Local structured state      | User-level `LocalMetadataStore` `tasks` / `task_checkpoints` repositories                        | Reserved `system:canvas-board-*` rows reuse existing transactions and stay outside Agent task UI/recovery cleanup.                 |
| Generated output durability | generated-output index and revision lifecycle                                                    | Board failure never deletes or invalidates the generated file.                                                                     |
| Diagnostics                 | `CanvasWorkspaceProjectionResult` and existing TUI/VS Code result projection                     | Stable codes/messages only; DB path/table, SQL error, holder id and Markdown body remain private.                                  |

`WorkspaceBoardDeliveryCoordinator.retry()` / `discard()` is the single owning command surface. Presentation adapters may expose affordances only by invoking these methods for the original `deliveryId`; Agent TaskManager, Webview stores, TUI command handlers and Canvas nodes must not implement parallel retry/discard state transitions.

## Goals / Non-Goals

**Goals:**

- 让 VS Code Agent、TUI、纯 Node/Bun Host 和后台任务对同一 workspace 使用一个 creator-visible artifact delivery contract。
- 自动投递实际使用的稳定素材引用、命名 reviewable Markdown artifact 和生成输出，并在 Board 中形成平铺、去重、可继续编辑的创作内容关系图。
- 把 SQLite 限定为 pending/claim/checkpoint/receipt ledger，把 `.nkc` 保持为唯一 Board 布局与用户编辑事实。
- 通过 target-scoped fenced writer、幂等 identity、最新 revision 读取和 atomic save 消除多 Agent lost update 与重复投影。
- 当 VS Code Board 已打开时保护其 authoritative editor state；无 VS Code 时允许 TUI/headless 独立完成相同投影。
- 保持 explicit Canvas authoring 与 Workspace Board default delivery 的唯一目标语义，不双写、不镜像、不推断 active/recent editor。

**Non-Goals:**

- 不把普通回复、reasoning、日志、所有附件、所有搜索结果或完整 conversation transcript 投影到 Board。
- 不把 Board 改成 SQLite 派生视图，不提供从全部历史 delivery 自动重建或恢复用户布局。
- 不建立新的 workflow runtime、Agent stage、Board session/binding/index/scope resolver 或通用 event-sourcing 平台。
- 不让 TUI/Agent/Webview 直接导入 Canvas Extension 内部实现、SQLite driver 或 `.nkc` codec 细节。
- 不把显式专业 Canvas authoring、Storyboard 结构创建或历史内容导入降级为普通 artifact delivery。
- 不在本变更中设计远程协作、CRDT、网络同步或多用户权限模型。

## Decisions

### 1. Terminal result produces one typed artifact batch, not arbitrary message projection

新增版本化 `CanvasWorkspaceArtifactDelivery` batch contract，核心字段为：

```text
deliveryId
workspaceId + workspaceUri
destination: workspace-board | explicit-canvas
process: runId? taskId? sourceHostId createdAt
artifacts[]:
  artifactId + revision + role(source|analysis|output)
  markdown | file-reference | image | audio | video | storyboard | file
  title + stable ResourceRef/DocumentArchiveResourceRef or markdown content
relations[]: optional source artifact ids for provenance only
```

`deliveryId` 是一次 terminal creator-visible batch 的稳定 identity；artifact identity/revision 仍由 owning artifact/result service 提供。同步分析在 turn artifact finalization 后提交，异步生成在 terminal task result materialization 后提交。系统不扫描聊天文本，也不把 final answer 自动升级为 artifact；Markdown 只有在 runtime/tool 已声明为命名、reviewable artifact 时才进入 batch。

选择 batch 而不是继续逐 asset 调用，是因为一次 terminal result 仍需原子表达 source → analysis → output，并且不应在 Board 中留下半组节点或半条关系。batch 是 transport、ledger 和 transaction 边界，不是 Canvas 视觉容器；逐项扩展 `projectGeneratedAssets()` 会继续把 delivery policy、目标和错误处理散落到媒体、研究、artifact 和 Host 入口。

### 2. Used materials come from evidence, not attachment or active context inference

Agent runtime 增加中立的 `CreatorVisibleArtifactCollector`，只读取现有 Tool result artifact refs、task result refs、ContentAccess/Perception evidence 和 artifact snapshots。Collector 输出稳定 source refs 与 artifact roles，不读取 Canvas 目标，不根据 attachment/open file/search candidate 猜测使用状态。

实际消费定义为 owning path 已返回成功 evidence 并被当前 terminal result 引用。仅附加、mention、打开、搜索命中或进入 prompt context 不足以证明使用。这样既减少 Board 噪声，也避免把用户未选择的本地文件持久化为创作记录。

### 3. Destination policy is Host-owned and has one canonical branch

Host composition 在提交前解析以下唯一分支：

```text
explicit ordinary .nkc identity + expected revision
  -> existing Canvas authoring path only
  -> no Workspace Board delivery row

no explicit owning Canvas document + resolved workspace
  -> CanvasWorkspaceArtifactDelivery destination=workspace-board
  -> neko/boards/workspace.nkc

no workspace / ambiguous workspace / unsupported Host
  -> blocked diagnostic
```

Agent core/session 不保存 destination。活动/最近 Canvas、会话 binding、文件名、scope 或 UI selection 都不是 fallback。Canvas 发起的 creative action 已携带 explicit document identity/revision，因此只更新源 Canvas；Agent chat、后台 Agent 和 TUI 的 unbound typed result 才使用 Workspace Board。

### 4. Reuse `tasks` and `task_checkpoints` through a Canvas-owned ledger wrapper

`WorkspaceBoardDeliveryLedger` 是 Canvas-owned、Host-neutral port，使用注入的 `LocalMetadataStore` transaction 与现有 repositories：

- delivery task key：`canvas-board-delivery:<deliveryId>`；
- writer lease key：`canvas-board-writer:<workspaceId>`；
- task status：`queued | claimed | projected | noop | blocked | conflict | discarded`；
- pending/blocked task payload 保存完整 validated batch、attempt、diagnostic 和 claim epoch；
- checkpoint 保存 resumable cursor、target revision、holder/epoch/expiry 与最近 Canvas result；
- projected/noop 后 payload 压缩为最小 receipt：delivery/artifact identities、target URI、result revision、node IDs、diagnostics、completedAt，不再保留可从 `.nkc` 读取的 Markdown body；
- projected receipt 默认不进入普通 Agent task list、`/tasks`、work-item card 或 generic completed-task cleanup。它使用 reserved key/parser 和 Canvas-owned cleanup policy；在没有明确 tombstone/re-delivery策略前不自动 GC，以免重复事件复活用户已删除的节点。

状态写入使用 `LocalMetadataStore.transaction({ mode: 'state-write' })`，底层 SQLite `BEGIN IMMEDIATE` 提供跨 Extension/Bun Host 的原子 claim。该 wrapper 不暴露 SQL、表名或 DB path，也不增加 migration/table。

这不是 Pi turn checkpoint outbox：只有 artifact/resource 已 durable 且 batch 已通过 contract validation 后才能入 ledger；ledger 丢失不会重建 conversation，ledger 成功也不证明 turn transcript durable。

### 5. Move the canonical projector/coordinator into `@neko-canvas/domain`

当前共享的纯 plan 保留并升级为 batch planner；VS Code `WorkspaceBoardProjector` 和 TUI `NodeWorkspaceBoardProjector` 的重复 load-plan-save 由一个 Canvas domain service 取代：

```text
WorkspaceBoardDeliveryCoordinator
  enqueue(batch)
  flush(workspaceId)
  retry(deliveryId)
  discard(deliveryId)

CanvasWorkspaceBoardMutationPort
  loadLatest(target)
  saveAtomic(target, expectedRevision, canvasData)
  applyToOpenEditor?(target, canvasData)
```

`@neko-canvas/domain` 拥有 batch validation、ledger state machine、writer fencing、idempotent plan 和 result mapping。Host adapters 只提供 LocalMetadataStore、workspace identity、ProjectFileStore IO、clock/holder identity、open-editor bridge 和 diagnostic presentation：

- VS Code adapter 使用 `createVSCodeProjectFileIoAdapter`，并在 Board 已打开时通过 CanvasEditorProvider 的 document mutation owner 读取/应用 authoritative state；
- Node/Bun adapter 使用同一 ProjectFileStore/codec 与本地文件 IO，不再复制 projector 规则；
- Agent Extension 与 TUI media/artifact delivery 只调用 coordinator，不直接调用 plan 或写文件。

Canvas domain package 是公开 contract owner，Agent package 不 import Canvas extension/Webview internals。若现有私有 package 可见性阻止 TUI 依赖，应建立明确的 workspace package/public export，而不是把 Canvas writer 移入 Agent 或 `@neko/shared`。

### 6. Use a fenced target writer and crash-safe effect ordering

每个 workspace Board 同时只有一个有效 writer epoch。claim/takeover 在 SQLite state transaction 内完成，holder 包含 Host instance identity、monotonic epoch 和 expiry。所有 mutation 遵循：

```text
persist validated delivery
  -> acquire/renew fenced writer epoch
  -> claim pending delivery under same epoch
  -> load latest authoritative Canvas revision
  -> plan idempotent batch mutation
  -> atomic .nkc save / open-editor apply
  -> persist projected/noop receipt
```

关键崩溃窗口：

- enqueue 前失败：没有 Board 副作用，调用方收到 blocked diagnostic；
- enqueue 后、写 Board 前崩溃：pending checkpoint 可由下一 Host 恢复；
- `.nkc` 保存后、receipt 前崩溃：重试从节点 provenance 识别同一 delivery/revision，返回 no-op 后补写 receipt；
- receipt 不得先于 `.nkc` commit；
- takeover 后旧 epoch 的 save/result commit 都被 fence；
- revision 改变时，在有效 epoch 内重新加载并 re-plan append-only batch；若 active editor 有未提交/不可合并状态则返回 conflict，不 last-write-wins。

当 VS Code 正打开 Workspace Board 时，VS Code Canvas document owner 优先持有/续租 writer lease，其他 Host 只 enqueue；Extension drain 后更新 editor state。没有活跃 owner或 lease 过期时，TUI/headless 可接管并直接原子写文件。该锁只保护真实共享 `.nkc` 资源，不进入 Agent instance state。

### 7. Project one flat, deduplicated creative content graph

Workspace Board document 本身就是自动投递落点，不再创建固定 Inbox、Task、Run 或 processing Group。每个 artifact 投影为顶层普通 Text、Document 或 Media 节点；delivery/run/task 仅作为不可见 provenance 和 ledger identity，不参与视觉层级、节点 identity 或布局。batch mutation 仍保持原子，因此删除视觉 Group 不会放松 crash recovery、receipt ordering 或 whole-batch validation。

节点 identity 由内容事实决定，而不是由观察该内容的 Agent 执行决定：

- `ResourceRef` 先以 scope、kind 与必要 locator 建立 logical content identity，再由强 fingerprint 建立 revision identity；`none` 是同一 locator 的弱观察，可与后续强 fingerprint 合并并优先保留强观察，但两个不同的强 fingerprint 仍代表不同 revision；
- `DocumentArchiveResourceRef` 使用 source identity、entry/locator 与 artifact revision 建立 canonical content key；
- named Markdown 使用 artifact identity 与 content revision；
- 没有 durable resource identity 的其他产物使用 owning artifact identity 与 revision。

`deliveryId` 不得进入节点 ID。同一内容 revision 在多个 Run、Task 或 Host delivery 中只能对应一个 Canvas 节点；重复投递复用节点且不得覆盖用户标题、位置、尺寸、分组或批注。历史节点只有 `none` 弱 fingerprint 时，首次强观察允许原位升级其 `resourceRef` 身份元数据，以防后续不同强 fingerprint 被弱身份错误合并；该升级不得改变其他 node data 或任何用户布局事实。新 revision 保留为新内容节点，除非 owning domain 提供显式 supersedes 语义。本次 prelaunch 替换不自动删除或拆解旧版本已经写入的 Inbox/processing Group，避免损坏用户布局；新 canonical path 不再创建这些 Group，并可按 canonical content identity 复用其中已有 artifact 节点。

artifact provenance 的 `sourceArtifactIds` 是已证明的创作依赖。planner 将 batch 内可解析的依赖投影为普通 `derived-from` Canvas connection，连接方向为 source → derived artifact，ID 由 source content node、target content node 和 relation type 决定；相同关系跨 delivery 只存在一次。缺失、自引用或无法解析的 dependency 属于 contract error，不静默忽略。Run/Task 不生成节点或连接。

初始布局按 source、analysis、output 的关系方向从左到右放置新节点，并根据现有全部节点矩形寻找空位。已存在节点保持用户位置与尺寸；新增节点不得触发已有节点自动重排。Media/Text/Document 节点已有 creator-facing `title` 时优先显示该标题，ResourceRef 和 node id 只作为无 authored title 时的可诊断 fallback。

Workspace Board 的图片卡片是创作审阅表面，必须完整展示图片；Canvas inline preview 使用 `contain`，不得用 `cover` 裁切。新投影图片节点的尺寸比例必须来自 portable intrinsic dimensions：生成图片优先使用 owning generated asset 的宽高，`ReadImage` 引用图片由 tool result 按稳定 ResourceRef/DocumentArchiveResourceRef 关联并把宽高传入同一共享契约；仅缺少固有宽高时才使用 `generationContext.aspectRatio`。planner 以该比例确定新节点尺寸并同时满足 Webview 最小尺寸，不新增 Webview runtime 探测作为 durable identity。重放或后续观察不得重置已存在节点的用户尺寸。

Batch mutation 必须原子。若任一 artifact invalid、canonical content identity conflict、relation endpoint conflict、runtime value forbidden 或 target revision 无法安全处理，整个 batch blocked/conflict，不留下半组节点或连接。

### 8. Separate artifact durability, Board delivery, and presentation

结果 plane 分为：

1. artifact durability：generated file、ResourceRef、Markdown artifact 是否已由 owner 持久化；
2. Board delivery：queued/claimed/projected/noop/blocked/conflict；
3. Agent/TUI/Webview presentation：只显示安全状态、目标类型、稳定 node refs 和脱敏 diagnostic。

Board 失败不删除 artifact；artifact 成功也不能冒充 Board 成功。当前 typed result presentation 移除通用 `Send to Canvas`，改为只读 delivery 状态与 retry/discard affordance。历史/外部内容仍走 `requestCanvasAuthoringHandoff`，专业 authoring 仍走 owning Canvas tools/approval。

### 9. Evaluation disposition

本变更影响 TUI artifact delivery、background task recovery、跨 Host result projection 和 runtime facts，必须运行真实 Agent Evaluation。

- `update` `agent-runtime.creative-media-workflow/generated-output-workspace-board`：增加 LocalMetadata delivery task、canonical Canvas domain coordinator、writer epoch、projected receipt、flat content node 和旧 Node/VS Code direct-writer poison evidence。
- `create` `agent-runtime.creative-media-workflow/workspace-board-material-analysis`：TUI 读取 fixture 素材并生成命名 Markdown artifact；断言实际消费 source ref、Markdown node、content dedup、`derived-from` connection、unselected fixture omission、无 generic Send to Canvas/active Canvas fallback。
- `create` 或在 owning suite中 `update` `agent-runtime.workflow-controller/workspace-board-delivery-resume`：在 enqueue 后终止 Host，再由新 TUI owner恢复同一 delivery；断言同一 identity、fenced takeover、单次 `.nkc` effect 和 terminal idle。
- 更新 coverage index/change selector，为新的 Agent/TUI workspace-board delivery paths 建立明确 owner；Canvas planner、SQLite state machine、explicit-target no-mirror 与双 Host并发使用 deterministic integration tests，不用 Judge。

真实 cases 需要 runtime facts 暴露 allowlisted deliveryId hash、workspaceId hash、status、holder epoch、target kind、artifact roles/count、Canvas revision/node IDs、diagnostic codes 和 forbidden fallback counters；不得暴露 Markdown body、绝对路径、DB path/table、token 或原始 SQL error。

## Risks / Trade-offs

- [复用 tasks 表可能污染 Agent task UI/cleanup] → 使用 Canvas-owned reserved key/parser、独立查询和 cleanup policy；普通 TaskManager、`/tasks`、work-item projector 和 generic completed cleanup 必须排除该 namespace。
- [SQLite 是跨 Host 单点依赖] → 复用既有 backup/integrity/fail-visible policy；禁止直接写 `.nkc` fallback，artifact 本身继续由 owner 保留。
- [VS Code 打开 Board 时 TUI 外部写入导致 dirty conflict] → 活跃 Canvas document owner 持有 target lease；其他 Host 只 enqueue，过期后才能 takeover；所有 save 仍需 revision match。
- [projected receipt 长期增长] → projected row 压缩为小 receipt；第一版优先防止重放/复活，不在缺少 tombstone 语义时自动 GC。后续用测量决定显式归档策略。
- [Markdown payload 在 blocked/pending 状态进入用户级 DB] → 只允许 creator-visible named artifact，遵守 workspace partition、backup和 diagnostic redaction；projected 后移除 body。Secrets、reasoning、raw logs 和 provider scratch contract-level 禁止进入。
- [同一 logical artifact 出现新 revision] → 两个不同的强 fingerprint 生成不同 canonical revision identity；不在原 node 上 last-write-wins。`none` 只作为同 locator 的弱观察与强 fingerprint 合并，不制造伪 revision。旧 revision 保持历史记录，用户可显式删除。
- [高扇出关系增加 Board 噪声] → 只投影 runtime evidence 已证明的 source dependencies；连接使用普通 `derived-from` edge，后续可在 presentation 层按选择/缩放降低视觉权重，但不得删除关系事实。
- [跨 Host lease 复杂度] → 只实现单个本地 SQLite writer claim 与单个 `.nkc` target，不引入远程协调、CRDT或分布式 consensus。

## Migration Plan

1. 扩展共享 batch/artifact/relation/diagnostic contract 和纯 planner；保留现有单 artifact request 仅用于本次迁移测试，默认成功路径先 poison legacy target inference、runtime values 和 delivery-scoped content identity。
2. 在 `@neko-canvas/domain` 增加 ledger/coordinator/mutation ports，复用 `tasks/task_checkpoints` 并补 Node/Bun/VS Code contract tests；不增加 SQLite migration。
3. 接入 TUI LocalMetadata binding 与 Canvas domain Node adapter，替换 `NodeWorkspaceBoardProjector` 直接写路径；更新现有 generated-output Evaluation fact。
4. 接入 VS Code Canvas Extension adapter，替换 Agent `WorkspaceBoardProjectionHost.projectGeneratedAssets()`，并让打开的 Workspace Board document owner参与同一 lease/revision path。
5. 在 Agent terminal result collector 接入实际 source evidence、Markdown artifact snapshot 和 generated/background result，批量 enqueue；显式 Canvas authoring继续走原 target path。
6. 删除 legacy generated-asset-only writer、重复 Node projector、当前 typed result通用 Send to Canvas 和所有 active/recent Board fallback；测试 poison 被删除路径。
7. 更新 Agent/Canvas architecture、SQLite ADR使用说明、Evaluation suites和真实 Extension Development Host/TUI验证。

回滚只允许回退未接入的 Host adapter或暂停自动 enqueue；不得恢复两套直接 writer、活动 Canvas fallback或绕过 ledger。旧版本已写入 `.nkc` 的 Inbox/processing Group 与子节点保持可读且不自动删除；新投递只使用 flat content graph canonical path。pending ledger rows可由同版本 coordinator继续处理或显式 discard。

## Open Questions

- 是否需要在首版提供用户可见的“丢弃 blocked delivery”入口，还是先仅提供诊断和显式 retry？实现前应根据现有 Task/diagnostic surface选择唯一 owning UI。
- projected receipt 的长期归档期限需要实际体积测量；在定义可审计 tombstone与显式 redelivery之前，不能采用会导致删除节点被重复事件复活的自动 GC。
- 高扇出连接是否需要按缩放或选择聚合属于 Canvas presentation 后续问题；本变更先保证关系事实、确定性 identity 与无重复节点。
