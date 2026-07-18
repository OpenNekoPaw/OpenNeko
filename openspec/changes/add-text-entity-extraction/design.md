## Context

OpenNeko 是本地 VS Code 创作套件，不是通用文档云服务。创作素材会从显式导入、Finder 复制、Git、同步工具、外部编辑器和配置的本地素材目录进入工作区；因此实体分析必须动态感知 source 变化，但不能把所有文件自动注册为 Asset、把所有文本复制进 SQLite，或让用户批量触发候选处理。

现有 change 已建立 source coordinator、确定性 Entity analyzer、candidate triage 和 SQLite source-scoped replacement。重新审计后发现两个边界需要在一期完成前纠正：

1. `MediaTextSegment.text` 是持久 contract 的必填字段，`splitSemanticIndex()` 会将完整 segment payload 写入 `semantic_evidence.evidence_json`，导致 SQLite 复制源文档正文。
2. 格式范围仍偏向通用文本扫描，尚未明确复用现有 `@neko/content` 文档容器能力，也未把任意 JSON/YAML 排除在创作 schema 之外。

`@neko/content` 已提供 `DocumentAccessService`、document manifest、range read 和 batch cursor，并已有 PDF、EPUB、DOCX reader。目标设计应复用这条 canonical path，把正文限制在分析期内存中；SQLite 只保存可重建、可查询的紧凑 evidence。

### Five-layer analysis

| Layer          | Decision                                                                                                                                                                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Search/domain-neutral coordinator 拥有 source catalog、fingerprint、freshness、调度与 reconciliation；Content 拥有格式识别、manifest、unit/range 读取和 transient segment；Entity analyzer 拥有 mention、确定性链接、candidate 与 occurrence；Local Metadata 只拥有 compact projection；Host adapter 拥有文件事件和生命周期。 |
| Dependency     | Host composition 注册 source provider、document adapter 与 Entity analyzer；coordinator 依赖小型 port，不导入 Assets/Entity/Webview 内部实现；Entity analyzer 消费 Content contract 与 confirmed entity snapshot，不依赖 VS Code 或 SQLite 实现。                                                                             |
| Interface      | `SemanticSourceDescriptor` 描述 portable source identity 与 policy；`SemanticAnalysisSegment` 携带 transient text；`SemanticEvidenceProjection` 只携带 locator/range/hash 与实体关系；repository 按 source 原子替换 compact projection。                                                                                      |
| Extension      | 后续 OCR、ASR、Vision、model-assisted NER 或 timeline projector 作为新的 analyzer/projection 接入，不修改 source authority、事实边界或正文所有权；一期不提前实现这些扩展。                                                                                                                                                    |
| Test           | fixture 验证文档 unit/range、预算、取消和 diagnostic；repository test 反序列化所有 evidence 并断言没有正文；query test 验证 Entity ↔ occurrence 双向导航；Host test 验证外部文件变化不隐式导入 Asset 或确认 Entity。                                                                                                          |

## Goals / Non-Goals

**Goals:**

- 动态发现工作区与已配置素材库目录中的受支持创作文档，包括绕过显式导入接口的外部变化。
- 支持 Fountain、NKS/Story、Markdown、TXT、PDF、EPUB、DOCX；JSON/YAML 只处理已注册创作 schema。
- 复用 `DocumentAccessService`，按 page/chapter/section/paragraph 等稳定 unit 有界读取，不一次性加载无界大型文档。
- 从 transient text 生成 stable ref、精确名称/alias mention、occurrence、candidate 和 source locator。
- SQLite 只保存 compact evidence、索引关系、fingerprint、version、freshness 和 diagnostic，不保存正文、文档二进制或内嵌媒体。
- 支持 Entity → occurrence/record 和 occurrence/mention/record → Entity/Candidate 的双向查询与导航。
- 自动链接确定性结果，聚合和降噪候选，只把高价值或有歧义的决策交给用户。
- 为 VS Code 提供 LSP 风格 diagnostics/navigation adapter，同时让 TUI、Agent 和其他 Host 复用相同分析核心。

**Non-Goals:**

- 通用文件索引器、任意 JSON/YAML 字符串扫描、千万行语料平台、完整 chunk ledger 或任意全文语义搜索。
- 自动把发现的文件写入 `neko/assets/library.json`，或根据文件名自动确认 entity/binding。
- OCR、ASR、Vision、图片/音视频内容分析、embedding、TurboVec、vector DB、nearest-neighbor 自动合并或复杂共指。
- 人物时间线、Narrative Event、ECS、固定 State/Memory/Belief record 或剧情冲突自动消解。
- 云端索引服务、独立 daemon、独立 LSP Server 或跨设备实时同步。

## Canonical Data Flow

```text
registered workspace/material root
  -> event hint + bounded reconciliation
  -> fingerprint/eligibility check
  -> DocumentAccessService manifest + unit cursor
  -> transient SemanticAnalysisSegment(text, locator, range)
  -> deterministic Entity analyzer
  -> compact SemanticEvidenceProjection(locator, hash, relations)
  -> source-scoped SQLite replacement
  -> Entity/record query
  -> DocumentAccessService.readRange() for visible context
```

源文件是正文唯一 authority。SQLite 丢失或 cache cleanup 后可以从源文件重建；源文件不可用时返回 unavailable/stale diagnostic，不能用数据库中的旧正文伪装成功。

## Decisions

### 1. 文件事件是提示，reconciliation 才是完整性边界

VS Code `FileSystemWatcher`、TUI/Node watcher 或平台文件事件只产生 create/change/delete/root-change hint。Coordinator 在 Host 激活、窗口恢复焦点、素材库 root 配置变化、显式刷新和运行期间的有界调度点执行 reconciliation。

Reconciliation 按逻辑 root 分片列举，比较 portable source identity 与轻量 fingerprint，生成 create/change/delete diff。事件与扫描结果进入同一个去重队列和 canonical analysis path。目录扫描和文档分析分别有预算并可取消；文件事件处理路径不得执行无界遍历或全文读取。

### 2. Source identity 与文档 identity 分离于 runtime path

每个 scope 注册稳定 `workspaceId`、`rootId`、portable root locator、访问策略和 `analysisMode`。`sourceId` 由 workspace partition、root identity 和规范化 root-relative path 形成，不持久化 runtime absolute path。

文档 manifest 提供 source fingerprint、format、unit locator 和可选 container metadata。PDF page、EPUB chapter、DOCX section/paragraph 等 unit identity 必须在同一 source revision 内稳定；运行时 parser handle、解压 entry object、Webview URI 和绝对路径不得进入 projection。

工作区路径优先于与其重叠的素材库 root；多个外部 root 重叠时按配置顺序选择一个 owner 并返回 overlap diagnostic，避免重复计数。

### 3. 一期只处理创作文档，不建立通用文本平台

格式 eligibility 分三类：

| Profile               | Formats                                     | Default mode                                       |
| --------------------- | ------------------------------------------- | -------------------------------------------------- |
| Structured creative   | Fountain、NKS/Story 或其他已注册创作 schema | `discover-candidates`                              |
| Generic creative text | Markdown、TXT                               | `link-existing`                                    |
| Document container    | PDF、EPUB、DOCX                             | `link-existing`，可由 root policy 显式启用候选发现 |

JSON/YAML 扩展名本身不表示 eligible。只有已注册 schema ID/version 且由 owning domain adapter 识别的创作文件才进入分析；未知 schema/version、解析失败或普通配置文件必须 fail-visible 或被 discovery 排除，不回退为纯文本 scalar 扫描。

HTML、PPT/PPTX、XLS/XLSX、漫画容器和 URL 即使被通用 DocumentReader 支持，也不进入本 change 的一期实体分析范围。

### 4. 文档容器复用 `DocumentAccessService`

文本 analyzer 不自行打开或解析 PDF/EPUB/DOCX。Content adapter 通过 `getManifest()`、`createBatchCursor()`、`readNext()` 和 `readRange()` 读取稳定 unit：

- PDF：page locator；无可用文本层时返回 `ocr-required`，不自动调用 OCR。
- EPUB：chapter locator；DRM 或 encrypted entry 返回明确 diagnostic。
- DOCX：section/paragraph locator；内嵌图片只形成 `ResourceRef`，不进入文本 analyzer。
- Markdown/TXT/Fountain/registered schema：按结构 block 或有界行/段落读取并保留 source range。

容器二进制大小、manifest unit 数量和实际提取文本字符数是不同预算。大 PDF/EPUB/DOCX 可以超过普通文本文件 byte limit，但每次读取、单 source 总字符数、unit 数、耗时和并发必须有界。超出总预算返回 `analysis-budget-exceeded` 并保持 stale/partial-uncommitted，不提交空成功。

### 5. Transient analysis text 与 persistent evidence 是两个 contract

目标 contract 分离如下：

```ts
interface SemanticAnalysisSegment {
  readonly segmentId: string;
  readonly text: string;
  readonly locator: DocumentLocator;
  readonly range?: SemanticSourceRange;
  readonly structure?: SemanticStructure;
}

interface SemanticEvidenceProjection {
  readonly evidenceId: string;
  readonly sourceId: string;
  readonly unitId: string;
  readonly locator: DocumentLocator;
  readonly range?: SemanticSourceRange;
  readonly contentHash: string;
  readonly entityMentionIds: readonly string[];
  readonly provider: SemanticProviderMetadata;
}
```

名称仅说明职责，最终公共类型应复用现有 shared contracts 并保持最小字段集。硬约束是：`text` 只能出现在 analyzer 输入或 session-only overlay；持久 evidence、candidate、occurrence、search item 和 diagnostic 不得包含完整 page/chapter/segment text，也不得嵌套可还原全文的 payload。

允许持久化 normalized matched label 或短 entity name 作为索引键，但必须受字段语义和长度约束，不能用“snippet”字段绕过正文禁令。上下文 snippet 在查询时从源文件读取，必要时只在内存响应中存在。

### 6. 一期使用确定性实体识别，不直接向量匹配

Entity analyzer 按以下顺序处理：

1. 显式 stable entity ref 直接链接。
2. 对 confirmed canonical name/alias 做边界感知精确匹配；kind 已知时必须兼容，kind 未知时名称必须在 confirmed entity 中唯一。
3. Fountain character cue、scene heading、NKS/Story entity ref 或已注册 schema 字段等明确结构可以产生新 candidate mention。
4. 新候选按 `kind + normalized name` 聚类，累计 distinct source、occurrence、结构证据和 provenance。
5. 名称指向多个 confirmed entity、kind 冲突或证据不一致时标记 `ambiguous`。

一期不使用 embedding、LLM NER 或 nearest-neighbor 作为召回前提或身份确认。后续向量能力只能提供 Top-K recall/evidence，仍需确定性规则或用户决策完成链接。

### 7. Entity 与 record 使用关系索引双向导航

一期中的 `record` 是可定位的 mention/occurrence/evidence projection，不是新的 Narrative Event authority。Repository/query service 提供两种稳定查询：

- `findOccurrencesByEntity(entityId, filters)`：返回 source identity、unit locator、range、kind、freshness 和 provenance。
- `findEntityLinksByOccurrence(occurrenceId)` 或 locator-based lookup：返回 confirmed Entity、Candidate 或 ambiguity projection。

查询结果默认不携带完整正文。UI、Agent 或 LSP adapter 需要上下文时，使用 result 中的 source locator 调用 `DocumentAccessService.readRange()`，并校验 source fingerprint；源已变化时返回 stale diagnostic 并触发重分析。

不提供“任意问题搜索所有文档”的语义问答接口。现有精确 name/alias、source、kind、candidate status 和 occurrence index 足以支持一期导航；后续全文/向量检索需要独立 proposal。

### 8. 自动候选分流只暴露异常和高价值建议

自动 projection 状态保持为 `observed`、`matched`、`suggested`、`ambiguous`。`suggested` 至少需要两个不同逻辑 source，或一个 source 中三次明确结构 mention。置信分数不能单独确认 entity。

UI 默认只显示 `suggested` 与 `ambiguous`，按歧义、distinct source、occurrence 和最近变化排序，并按 cluster 展示。`dismissed`、`saved-for-review`、merge/reject 和 promote 是显式用户决策，必须先写 owning project fact；cache 不得成为唯一 authority。

### 9. SQLite 只保存 compact source/evidence projection

`semantic_sources` 保存 source identity、fingerprint、format/profile、provider/schema version、coverage、budget summary、freshness 和 diagnostic。`semantic_evidence` 保存 unit locator/range/content hash 与 mention/evidence relation。`entity_asset_projections` 保存 occurrence、candidate、match、relationship 和 reverse lookup。

分析开始和提交前都校验 fingerprint 与 confirmed-entity revision。一次成功分析按 source 原子替换旧 compact evidence/projection；失败保留旧 projection 但标记 stale 和明确 diagnostic，不返回空成功。删除或 scope 移除只清理对应 cache，不删除 Asset、Entity、binding 或用户 candidate decision。

当前含 `MediaTextSegment.text` 的 SQLite rows 是可重建 cache。迁移采用 schema/provider version bump + allowlisted cache cleanup/rebuild：

1. 新 reader 不再接受含完整 text segment 的 persistent payload。
2. 旧 source projection 标记 incompatible/stale，并删除对应 cache rows。
3. 已授权且仍存在的 source 按新 compact schema 重建。
4. confirmed facts、candidate decisions、Asset facts 和源文件完全不迁移、不删除。

不做 dual-read/dual-write，不保留 legacy text payload fallback。

### 10. 媒体、时间线和人物状态保持解耦

文档内嵌媒体只产生 `ResourceRef`，由独立媒体 pipeline 决定是否生成 OCR/ASR/Vision evidence。文本 analyzer 不解析媒体 bytes，也不等待媒体分析完成。未来不同 analyzer 可以针对同一 source/unit 产生独立 provider/version evidence，但不能共享可变 parser/session state。

衣着、形象、位置、伤势、情绪、阵营以及 Memory/Belief 具有时间、视角和叙事可靠性，不能在一期从单次 mention 固化为 Entity 字段。未来 timeline projector 应从带 locator、时间线索、叙事视角和 provenance 的 evidence 动态总结，并允许互相冲突的 evidence 并存；Entity identity、occurrence 和 projection 保持解耦。

### 11. VS Code 使用 LSP 风格 adapter，不启动独立服务进程

VS Code adapter 将 shared semantic revision 投影为 diagnostics、navigation、document symbol 或 candidate action，并把文件事件、保存和焦点恢复交给 coordinator。未保存 buffer 可以生成 session-only transient analysis，但不得在保存前写 SQLite 或项目事实。

TUI 在启动、command/session boundary 和显式刷新时复用相同 contract。不存在 active workspace fallback；每项 operation 和 projection 都携带显式 workspace identity。独立 LSP Server 被否决，因为它会复制 Host 已拥有的文件 IO、workspace identity、SQLite 生命周期和缓存状态。

### 12. 边界保护和失败语义

默认排除 `.git`、依赖目录、构建产物、`.neko/.cache`、数据库/WAL、日志、生成 cache、secret 和未授权外部目录。外部 root 必须来自已解析的 media library settings，并遵守 workspace trust、PathResolver、symlink/overlap 和可访问性策略。

未知 schema/version、非法 source identity、缺失 workspace partition、未注册 analyzer、parser 缺失、DRM、扫描 PDF、预算超限、stale locator 和 repository contract mismatch 都返回 typed diagnostic。单个 source 失败可以继续处理其他 source，但失败 source 不得被标记 fresh，也不得用空结果或旧正文伪装成功。

### 13. Agent Entity 引用在 Host turn 边界解析

Project Search 与 Webview mention menu 只投影 Entity 的稳定 identity、kind、label、summary 和导航元数据，不把完整 `CreativeEntity` 项目事实复制进 Webview state。用户选中 Entity 后形成 `AgentContextPayload(type = "entity")`；在请求进入 Agent runtime 前，Extension Host 必须从受信任的 workspace/conversation context 解析 project root，并通过现有 Entity facade `getEntity` 读取 canonical `CreativeEntity` snapshot。

Host 将结果转换为严格可校验的 resolved entity context contract。该 contract 保存 Entity snapshot 与用于证明解析目标的 `CreativeEntityRef`，不保存 runtime absolute path、VS Code handle 或 Webview URI。Agent runtime 只格式化 resolved contract；未解析的薄 label/summary、缺失 Entity、kind 不匹配、facade diagnostic 或错误 workspace 都 fail-visible，不得继续把 summary 伪装成完整引用。

该边界保持三项职责分离：Search 负责发现，Entity facade 负责项目事实读取，Agent runtime 负责 turn context 格式化。Webview 不导入 Entity service，Agent core 不调用 VS Code command，Extension 不复制第二套 Entity store。

### 14. Webview 资源使用内容寻址路径

Entity mention 的选择处理位于 Agent Webview bundle 内。Extension 不得仅通过 query 参数为固定的 `assistant.js` / `assistant-style.css` 路径生成随机版本，因为 VS Code Webview 资源代理可以按规范化路径复用旧响应，导致 Search 已投影新 Entity candidate、运行态却仍执行缺少 context handler 的旧组件树。

Vite 构建必须为入口 JS 与 CSS 生成内容哈希文件名，并输出机器可读 manifest。Extension Host 在创建 Webview HTML 时严格读取并校验该 manifest，再把实际 hashed path 交给 `webview.asWebviewUri()`。manifest 缺失、entry 不唯一、路径越界或目标文件不存在时 fail-visible，不回退固定文件名或 query-only cache busting。CSP nonce 继续只承担脚本授权，不承担资源版本语义。

该边界保持构建系统拥有 asset revision、Extension Host 拥有资源授权、Webview 拥有交互状态；不把 bundle version 写入项目数据、Webview state 或 Entity contract。

### 15. Tabless entry composer 显式拥有首次引用

没有打开 conversation tab 时，首页输入框不是 `ChatWorkspace` 内已有 Tab runtime 的一部分，而是 `ConversationController` 拥有的 tabless entry composer。它必须像 entry input、model 和 generation defaults 一样，显式拥有创建下一 conversation 前的 transient `contextReferences`；不能把候选搜索接入后仍传空数组和缺省 context handler。

用户选择 Entity mention 时，entry composer 原子地移除活动 `@filter`、关闭菜单并按 stable context ID 去重添加引用。首次发送创建 conversation 时，把这份 immutable payload snapshot 写入 pending send request，再清理 entry state；新建会话后的 `ChatWorkspace` 继续由对应 Tab runtime 独立拥有引用，不共享 entry 可变状态。若 context-backed mention 没有 handler，InputArea 必须 fail-visible，而不是静默保持 query 和菜单。

### 16. 角色扮演入口直接消费稳定 Entity identity

角色扮演选择器已经从 Project Search 获得 confirmed character Entity 的稳定 `entityId`。Webview 将该 identity 编码为 `entity:<entityId>` 启动 Character Dialogue 时，Extension 必须把它解释为显式 `CreativeEntityRef(entityKind = "character")`，再交给 Character Dialogue profile assembler 通过 canonical Entity facade 校验和装配；不得把稳定 ID 重新当作名称交给 `resolveByName()`。

Roleplay-scoped Project Search 可以返回 confirmed `creative-entity` character，也可以返回带稳定 Project Search item identity 的 open automatic `entity-candidate` 或具名 context-script Candidate，但必须在 Webview 中明确区分二者。Candidate 不能直接进入 Character Dialogue；用户点击 Candidate 时，该动作必须明确标记为“确认并扮演”，Host 以稳定 item identity 做精确 Project Search 重查询并校验对应 Search item，不能用空查询的展示分页近似解析；随后通过 Entity facade 显式 propose/confirm 为项目事实，并且只使用 facade 返回的 confirmed `CreativeEntityRef` 启动角色扮演。Webview 提交的 label、kind、candidate payload 或 source metadata 不得直接成为项目事实。

Canonical Entity Search adapter 拥有 Entity facts 与 compact `entity-candidate` metadata projection 的组合读取；Dashboard/legacy creative adapter 不得作为 automatic Candidate 的旁路 owner。具名 context-script Candidate 只有在同一 Search identity 可由 Host 重新解析、且 source ref 可收敛为 project-relative 或变量路径时才能显式确认。无法重新解析的临时标签、未具名 Candidate、未绑定 Asset 和 generated Asset 不是可扮演项目角色，也不能被静默提升。显式确认操作可以把 Host 重新解析出的 Candidate name/kind/portable provenance 写入 owning Entity candidate fact，再立即确认；Search item ID 只用于本次 Host 校验，不得持久化绝对路径或 Webview payload。这仍属于一次用户授权的项目事实写入，不恢复自动分析写 `candidates.json` 的旧路径。

只有用户显式输入 `@名称` 时才进入名称/alias 解析。`entity:` token 缺失 ID、携带不支持的 kind 或最终无法由 assembler 解析时必须 fail-visible，不能回退标签、当前 active Entity、Quick Pick 或其他 workspace。这样 Search 负责选择 identity，Character Dialogue 负责装配角色事实，两者之间不再通过名称猜测耦合。

Character Dialogue 与 Embody Character tab 是各自角色 session 的 UI 投影，不是普通 Pi conversation。恢复这两类 tab 时，Webview 只能恢复角色 session state，不能发送普通 conversation snapshot/settings 请求；否则 Host 会把角色 session ID 解释成 conversation ID，并产生误导性的 `unknown-conversation`。普通 conversation 请求必须由 tab kind 显式限定，不能依赖 Host fallback 或吞掉错误。

### 17. 删除无 owner 的 Creative Entity Dashboard compatibility surface

Dashboard UI 已被移除后，`DashboardCreativeEntitySource`、row/detail/state DTO、`getDashboardCreativeEntitySource` / `getCreativeEntityState` commands 以及围绕它们构建的 Search、Inspector、Canvas 和 Character Dialogue fallback 不再有合法 owner。继续保留会让一个已删除表面成为第二套 Entity 聚合契约，并允许消费者绕过 canonical facade 猜测 source-specific ref。

本次预发布清理删除整条 compatibility path：shared 不再导出 Dashboard creative entity DTO；Entity Host 不再注册 source command 或构造 Dashboard source；Agent Search 只组合 canonical Entity adapter 与明确拥有者的非 Entity partitions；Character Dialogue 只从 Entity service 读取 confirmed character，证据通过 occurrence/relationship ports 和 semantic locator 查询装配；Assets/Canvas 不再通过 Dashboard command 获取实体 detail。

删除 Dashboard 产品表面也意味着仍被 Chat 和异步恢复流程使用的任务投影不能继续以 Dashboard 命名。该能力保留其真实职责，但公共契约改为宿主中立的 `TaskProjection`，Agent owner 改为 `AgentWorkItemProjectionSource`；Chat replay、Workspace Board delivery 和 source-owned cancel/retry 继续消费同一个 projection source。旧 `DashboardTask`、`DashboardProject`、`dashboardWorkItemSource` 文件与 package exports 直接删除，不保留 alias 或双读路径。

Entity Inspector 若继续存在，只能消费 `EntityFacadeEntityDetailResult` 与 `CreativeEntityRef`，不能在内部重新建立 Dashboard row/detail model。缺失 relationship、occurrence 或 representation provider 时，证据结果保持明确为空或返回 typed diagnostic；不得调用已删除 command、合成 source-specific ID、回退 candidate 或把 script role 当 confirmed Entity。

这是内部 breaking cleanup，不迁移已删除 Dashboard 的展示/选择状态。confirmed Entity、candidate decision、binding、visual draft、character memory、semantic occurrence 和源文档继续由各自现有 store 拥有；删除 compatibility code 不得删除这些用户数据。

## Risks / Trade-offs

- [大型文档或网络素材库成本较高] → fingerprint-first、root scan budget、document unit cursor、source total-text budget、取消和可观测 metrics；不在事件回调中全量读取。
- [不持久化正文使上下文展示多一次文件读取] → locator-based `readRange()`；换取 SQLite 体积可控、源文件单一 authority 和 cache 可安全清理。
- [源文件变化导致 locator 失效] → 查询时校验 fingerprint，返回 stale diagnostic 并调度 source replacement，不展示错误上下文。
- [确定性规则漏掉中文自由文本新实体] → 一期优先可靠 exact linking 与结构化 candidate；model-assisted NER 以后作为有预算 analyzer 增加。
- [文档 parser 对 page/section 边界支持不一致] → 以 `DocumentAccessService` contract 和 fixture 为准；缺少稳定 locator 的格式不进入 fresh projection。
- [清理旧 SQLite text cache 影响离线上下文] → cache 本来可重建；源不可用时明确 unavailable，不把旧正文提升为事实或保留兼容读取。
- [内容哈希资源需要 Host 与构建产物一致] → 由 Vite manifest 作为唯一构建契约；Host 启动时严格校验并在产物缺失或不一致时直接暴露错误。
- [入口引用在会话创建期间丢失或串入其他 Tab] → entry composer 只保存下一次创建前的 transient state；pending send 复制 immutable snapshot，各 Tab runtime 仍按显式 tab/conversation identity 隔离。
- [角色扮演稳定 ID 被误当名称] → `entity:` token 直接形成 character `CreativeEntityRef`，`@名称` 才使用名称解析；assembler 继续负责 canonical existence/kind 校验。
- [自动 Candidate 在普通 `@` 菜单中被误认成 confirmed Entity] → roleplay UI 显式显示 Candidate 状态；选择 Candidate 触发 Host 重新解析与 Entity facade propose/confirm，任何 stale/missing/wrong-kind projection 都 fail-visible，不能直接启动角色对话。
- [删除 Dashboard 聚合后旧消费者失去隐式数据] → 每个消费者改接明确 canonical facade/query port；没有 owner 的数据不伪造 fallback，并用 legacy-debt 断言禁止旧命令和 DTO 回流。

## Migration Plan

1. 修订 transient segment、compact evidence、document unit、query result 和 repository replacement contract，增加正文禁止规则与 validators。
2. 调整 SQLite schema/provider version，poison 旧 persistent text-segment path，并提供 allowlisted source cache cleanup/rebuild。
3. 复用 `DocumentAccessService` 接入 PDF page、EPUB chapter、DOCX section/paragraph 以及 Markdown/TXT/Fountain/registered creative schema adapter。
4. 为 discovery 增加创作文档 profile、容器预算和 JSON/YAML schema eligibility；媒体文件及普通配置文件不进入文本 analyzer。
5. 让 Entity analyzer 消费 transient unit text，输出 compact mention/occurrence/candidate/match projection。
6. 增加 Entity → occurrence 与 occurrence/locator → Entity/Candidate query，并通过 `readRange()` 组装 session-only context。
7. 在 Assets/VS Code composition 注册 source provider 和 LSP-style adapter，保持 discovery、Asset import、Entity confirmation 三条路径分离。
8. 禁止 Agent 和其他 analyzer 自动写 `candidates.json`，保留显式用户 candidate decision。
9. 运行 document fixture、SQLite no-body、双向查询、migration、Extension Host、Agent evaluation 和质量门禁。
10. 在 Agent turn 边界解析 Entity mention identity，注入严格 resolved entity snapshot，并验证未解析或不匹配引用不能进入 provider prompt。
11. 将 Agent Webview 入口资源改为内容哈希路径，通过严格 manifest 解析，并在 Extension Development Host 中验证 mention selection 命中新 bundle。
12. 让 tabless entry composer 显式拥有首次 Entity 引用并投影到 pending send；缺失 context handler 时直接失败。
13. 让角色扮演入口直接消费 Search 选出的稳定 Entity identity，并用控制器路径测试证明名称解析或 Quick Pick 不参与。
14. 删除 Creative Entity Dashboard 公共契约、Host command、Search/Inspector/Canvas/Agent compatibility path，并以 canonical Entity facade 与 semantic query ports 替代；将仍存活的 Agent task mirror 收敛为宿主中立的 `TaskProjection` canonical path。
15. 为 roleplay Candidate 增加显式确认 handoff：canonical Entity adapter 组合 Entity facts 与 compact automatic-candidate projection；Webview 只提交稳定 Search item identity，Host 重新解析 automatic 或具名 context-script Candidate，经 Entity facade propose/confirm 后以返回的 stable Entity ref 启动 Character Dialogue。

Rollback 可以停止新的 analyzer/source provider 注册并清理 compact cache；不得恢复 legacy text payload 或自动写 `candidates.json` 作为 fallback。confirmed entity、Asset、candidate decision 和源文档不受影响。
