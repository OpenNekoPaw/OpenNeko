# 文本实体抽取与动态 Source Discovery Gap

采集日期：2026-07-18

## 范围

本快照检查统一实体如何从工作区和素材库文件中获得 text mention、candidate、occurrence 与 match，并验证 Finder 复制、Git 操作、同步工具、外部编辑器和直接配置本地素材目录时是否会进入同一处理路径。

长期架构事实以 [`../architecture/unified-entity.md`](../architecture/unified-entity.md)、[`../architecture/asset-library.md`](../architecture/asset-library.md) 和 [`../architecture/adr-local-metadata-store-sqlite.md`](../architecture/adr-local-metadata-store-sqlite.md) 为准；实施设计与任务位于 [`../../openspec/changes/add-text-entity-extraction/`](../../openspec/changes/add-text-entity-extraction/)。

## 证据来源

- `packages/neko-assets/src/services/AssetFileImportService.ts`
- `packages/neko-assets/src/services/MediaLibrarySearchService.ts`
- `packages/neko-assets/src/providers/MediaLibraryTreeProvider.ts`
- `packages/neko-assets/src/services/MediaLibrarySettingsService.ts`
- `packages/neko-search/src/host-vscode/commands.ts`
- `packages/neko-tools/packages/extension/src/media-lsp/services/MediaWorkspaceIndex.ts`
- `packages/neko-entity/src/core/contributionAutomation.ts`
- `packages/neko-entity/src/core/paths.ts`
- `packages/neko-types/src/local-metadata/sqlite/search-projection-schema.ts`
- `packages/neko-types/src/local-metadata/sqlite/entity-asset-projection-schema.ts`

## 已验证现状

| 区域                 | 当前行为                                                                   | 结果                                                                              |
| -------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 显式素材导入         | `AssetFileImportService` 校验、注册、flush 并刷新 Entity/Asset 视图        | 只覆盖主动调用 importer 的路径                                                    |
| Project Search       | watcher 监听 Story、Asset/Entity fact 和 media settings 等少量固定 glob    | 普通 Markdown/TXT/JSON/YAML 不会进入实体分析                                      |
| Media Library Search | 为已解析外部目录建立文件名索引并监听 create/delete                         | 能发现部分外部变化，但不处理 change，不生成统一 semantic source/entity projection |
| Media Library Tree   | 为浏览过的目录维护独立 watcher                                             | 只刷新树，不是语义索引 authority                                                  |
| Media LSP            | 监听 `.nkv` 并维护内存导航索引                                             | 是 Extension provider，不是通用文本实体服务或独立 LSP Server                      |
| Entity contribution  | Agent contribution 可以按名称创建/匹配 project candidate                   | 自动分析结果可能直接写入 `neko/entities/candidates.json`                          |
| Local metadata       | 已有 `semantic_sources`、`semantic_evidence` 和 `entity_asset_projections` | Schema 能承载 source、mention、candidate 与 occurrence，但未形成统一自动处理链    |

## Gap

1. 没有统一 source catalog 和 reconciliation coordinator；多个 watcher 各自刷新不同 projection。
2. 依赖显式导入或单次文件事件无法保证外部复制、Git checkout、睡眠恢复、网络盘和同步工具变化最终被发现。
3. 工作区普通文本与素材库 document 已进入统一 source path；本轮补齐 PDF/EPUB/DOCX unit reader、creative-schema gating 和 compact evidence，剩余风险转为真实 Extension Host 验收。
4. 自动候选按 contribution 写项目文件，容易产生 Git churn 和大批量人工审批；可重建候选与显式用户决策没有分层。
5. 缺少 source fingerprint、analysis revision 和提交前 freshness 校验的完整调用链，文件变化期间可能产生 stale 结果。
6. 缺少统一的 root trust、overlap、symlink、exclude、size、encoding、取消和资源释放契约。
7. 尚未定义“只链接已有实体”和“允许发现新候选”两种 source policy，直接扫描通用文本会产生明显噪声。

## 第一阶段结论

- 文件事件只作为提示；启动、焦点恢复、root 变化、显式刷新和有界周期 reconciliation 共同保证最终一致。
- Search/domain-neutral coordinator 拥有 source identity、fingerprint、freshness、调度和 repository replacement；Content 拥有格式 segment；Entity analyzer 拥有 mention/link/candidate。
- 自动 source、compact evidence、occurrence、match 与 candidate cluster 写用户级 SQLite cache；正文和文档二进制仍只在源文件，confirmed entity、binding 与显式 candidate decision 继续写项目事实。
- Generic Markdown/TXT 与 PDF/EPUB/DOCX 默认只链接已有实体；Fountain/Story、已注册创作 schema 或显式启用 root 才发现新候选。普通 JSON/YAML 不进入 analyzer。
- 自动处理执行精确链接、聚类、证据累计和降噪；默认 review 只展示 suggested/ambiguous cluster。
- 发现文件不等于导入 Asset；素材库文件只有显式 import/promote 后才成为 `AssetEntity`。
- 第一期不采用 OCR、ASR、媒体内容分析、embedding、TurboVec 或向量最近邻自动确认身份。
- Entity → occurrence 与 occurrence/locator → Entity/Candidate 使用同一 SQLite relation projection；上下文通过 fingerprint-checked `DocumentAccessService.readRange()` 实时读取。

## 已知限制

- 已通过 fake-filesystem/真实临时目录的 Host 集成测试；当前仍缺少可重复的独立 Extension Development Host 场景脚本来从 CDP 触发外部目录变更并读取 SQLite projection。当前 CDP 只确认已有 Development Host 窗口可连接。
- Generic workspace include policy、candidate project-decision schema 和 session-only hide 行为已在 OpenSpec design 收敛：通用文本默认 `link-existing`，候选决策沿用显式项目事实，默认 review 隐藏低信号 projection。
- 含完整 `MediaTextSegment.text` 的旧 SQLite rows 不再兼容；workspace binding 启动时只清理对应 cache source 与 entity projection，随后由 reconciliation 重建 compact projection，不触碰源文件或项目事实。
- 中文自由文本的新实体召回在确定性一期中有限；需要后续 model-assisted NER spike，但不能改变事实与确认边界。

## 2026-07-18 验证记录

- OpenSpec strict validation、`git diff --check`、Prettier、Content 65、Entity 93、Search 57、Assets 91、shared/SQLite 34 项聚焦测试均通过；Node/Bun SQLite round-trip 已包含在 shared 聚焦测试中。
- Entity 与 Search 独立 typecheck、Assets compile、`pnpm build`、`pnpm check:deps` 和 `pnpm check:legacy-debt` 通过。质量审查发现并修复 kind-aware 精确链接、compact index 解码类型、媒体/text range 联合与重复 structured path 投影问题。
- 全仓 `pnpm test` 仅因并行 model preview 改动触发 `local-resource-access-guardrails` 失败；`pnpm check` / `pnpm check:unused` 仅报告同一并行改动的 3 个未使用文件和 `DEFAULT_MODEL_SOURCE_LIMITS` 未使用导出，本变更聚焦路径无失败。
- CDP 已连接到真实 Extension Development Host，但当前只暴露 `neko-preview` Webview；仓库没有动态 source discovery/review 的隔离 fixture/scenario，现有 Host 又指向真实 `~/Git/neko-test`。依据用户数据保护约束未在真实工作区制造素材，因此运行态验收记录为环境阻塞。
- 本轮未改变 prompt、Skill、capability/tool routing、provider/model 或 AgentSession，故 9.9 不触发新的 Agent evaluation；此前 8.4 的 Agent 自动候选写入路径已有独立评估记录。
- 性能证据覆盖 unit 数、单 unit 字符数、source 总字符数、elapsed time、取消和容器 bytes 分离的 fail-closed fixture；尚未建立真实超大 PDF/EPUB/DOCX 基准，第一阶段仍以 500 units、50 万提取字符和 30 秒默认预算控制风险。
