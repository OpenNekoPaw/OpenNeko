## Why

创作项目中的小说、剧本和设定文档可能通过 Finder 复制、Git 操作、同步工具、外部编辑器或直接配置本地素材库目录进入 OpenNeko，未必经过统一导入接口。现有动态 source discovery 已解决部分发现问题，但第一版设计仍把完整 `MediaTextSegment.text` 写入 SQLite，并把通用 JSON/YAML 当作可扫描文本；这会让本地 metadata 数据库逐渐复制用户文档正文，也会扩大候选噪声和处理范围。

一期需要收敛为本地创作项目的可重建实体索引：自动感知受支持文档变化，按有界单元读取正文，建立 Entity、mention、occurrence、candidate 与 source locator 的关系；正文和文档二进制继续只由源文件拥有，SQLite 只保存紧凑 projection。用户应能从 Entity 找到相关记录，也能从记录反查 Entity/Candidate，而不需要批量手工触发处理或先建设向量数据库。

## What Changes

- 保留工作区与已配置素材库根目录的动态 source discovery：文件事件提供低延迟提示，启动、根目录变化、焦点恢复和有界 reconciliation 保证最终完整性。
- 将一期输入限定为创作型文本：Fountain、NKS/Story、Markdown、TXT，以及 PDF、EPUB、DOCX 文档容器；JSON/YAML 仅由已注册的创作 schema adapter 处理，不扫描任意配置文件的字符串字段。
- 复用 `@neko/content` 的 `DocumentAccessService`、manifest、range read 和 batch cursor；PDF 按 page、EPUB 按 chapter、DOCX 按 section/paragraph 读取，不新增第二套文档 parser 或独立服务进程。
- 将分析期文本与持久 evidence 解耦：完整 unit/segment text 只存在于有界分析批次；用户级 `~/.neko/neko.db` 只保存 source identity/fingerprint、unit locator/range/content hash、mention/occurrence/candidate/match、provider/schema/freshness 和 diagnostic。
- 搜索支持双向关系导航：Entity → occurrence/record，以及 occurrence/mention/record → Entity/Candidate；需要展示上下文时通过 source locator 回读原文，不从 SQLite 返回复制的正文。
- Agent `@` 搜索结果继续只携带稳定 Entity identity 和导航投影；用户选中 Entity 后，Extension 必须在 turn 边界通过 Entity facade 解析 canonical `CreativeEntity` snapshot，Agent 不得只收到名称/summary，也不得由 Webview 复制项目事实。
- 自动执行 stable ref、canonical name/alias 精确链接、结构化候选提取、聚类、证据累计、降噪和建议排序；用户只处理高价值新实体、歧义、冲突和合并决策。
- 将媒体处理保持为独立 pipeline：文档内嵌图片、音频或视频只形成 `ResourceRef`，文本 analyzer 不调用 OCR、ASR 或 Vision；扫描 PDF 返回 `ocr-required`，DRM 文档 fail-visible。
- **BREAKING**：停止将完整 text segment payload 持久化到 `semantic_evidence.evidence_json`；现有 segment-text rows 视为可清理重建的 cache，不迁移为项目事实。
- **BREAKING**：停止自动分析与 Agent contribution 向 `neko/entities/candidates.json` 写入候选；旧自动写入路径在 canonical path 接入后删除或 fail-visible。
- **BREAKING**：删除已经失去 UI owner 的 `DashboardCreativeEntity` source/state/detail 公共契约、VS Code commands、Project Search adapter 和角色证据 fallback；Entity Browser、Inspector、Canvas、Agent 与 Character Dialogue 统一通过 Entity facade、稳定 `CreativeEntityRef` 和 semantic occurrence query 访问实体事实。同时把仍服务 Agent/Chat 的后台任务镜像从 `DashboardTask` / `AgentDashboardWorkItemSource` 收敛为宿主中立的 `TaskProjection` / `AgentWorkItemProjectionSource`。
- 角色扮演入口区分 confirmed Entity 与自动提取或上下文脚本发现的 Entity Candidate；canonical Entity Search adapter 必须同时消费 Entity facts 和 compact automatic-candidate projection。用户可以对具备稳定 Search identity 的具名角色 Candidate 执行显式“确认并扮演”，由 Host 重新解析 Search projection、通过 Entity facade 写入 confirmed Entity，再把返回的稳定 Entity ID 交给 Character Dialogue。Webview 不拥有或伪造 Candidate/Entity 项目事实。

## Capabilities

### New Capabilities

- `dynamic-semantic-source-discovery`: 工作区与素材库根目录的事件感知、增量 reconciliation、创作文档 eligibility、source identity、freshness、删除和根目录变更语义。
- `text-entity-analysis`: 文本/文档容器的有界读取、确定性 mention/link/candidate 分析、compact evidence persistence、双向 Entity/record 查询和用户确认边界。

### Modified Capabilities

无。

## Impact

- 主要涉及 `@neko/content`、`@neko/entity`、`@neko/search`、`@neko/shared` local metadata、`neko-assets` Extension Host 和 `neko-agent` contribution automation。
- 需要拆分 transient analysis segment 与 persistent evidence projection，调整 `MediaSemanticIndex`/repository contract，确保 feature package 不接触 SQL、数据库路径、Host 文件句柄或完整文档正文。
- 需要复用现有 `DocumentAccessService`，为 PDF/EPUB/DOCX 增加语义分析 adapter、预算和 diagnostic；不新增文档数据库 authority、LSP daemon、vector DB 或媒体分析耦合。
- 需要统一或替换 Project Search、Media Library Search、Media LSP 和素材树中的重复 watcher/rebuild 触发逻辑；各消费者保留自己的 projection owner。
- 需要为 Agent entity context 定义严格的 resolved snapshot contract，并在 Extension Host 发送边界复用现有 Entity facade；缺失、陈旧或 kind 不匹配时 fail-visible，不能退回未解析的薄标签。
- 需要删除 Creative Entity Dashboard compatibility surface 及其跨包命令激活点；这是预发布内部契约清理，不迁移 Dashboard UI state，confirmed Entity、binding、candidate decision、character memory 和 semantic evidence 保持原 authority。
- 需要清理现有 SQLite segment-text cache，并保证 confirmed entity、binding、Asset library facts、用户已确认 candidate decision 和源文档不丢失。
- 验证覆盖 host-neutral 单元测试、文档 fixture、SQLite repository contract、正文不落库断言、Entity/record 双向查询、Extension watcher/reconciliation 集成路径和生产者/消费者构建。

## Phase 1 Boundaries

- 不依赖 embedding、TurboVec、LLM NER 或 nearest-neighbor identity matching；大量数据依靠 fingerprint-first、增量 reconciliation、文档 unit batching、精确索引和 source-scoped replacement 处理。
- 不建设千万行通用语料平台、完整 chunk ledger、后台 daemon 或任意全文语义搜索；单文件和单次 reconciliation 都受字符、单元、时间和取消预算限制。
- 不实现 OCR、ASR、Vision 或图片/音视频内容实体识别；媒体素材后续由独立 analyzer 接入相同 source/evidence 边界。
- 不把人物的衣着、位置、伤势、情绪、阵营、Memory/Belief 固化为 occurrence 字段；这些信息未来从带时间与视角的 evidence 动态总结为 projection。
- 不实现人物时间线、Narrative Event、ECS 或自动冲突消解；一期只建立足以支持后续推导的 Entity、mention/occurrence、source locator 与 provenance。
