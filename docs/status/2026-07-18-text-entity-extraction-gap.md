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
3. 工作区普通文本与素材库 document 没有进入统一格式解析、mention 抽取和 confirmed entity linking。
4. 自动候选按 contribution 写项目文件，容易产生 Git churn 和大批量人工审批；可重建候选与显式用户决策没有分层。
5. 缺少 source fingerprint、analysis revision 和提交前 freshness 校验的完整调用链，文件变化期间可能产生 stale 结果。
6. 缺少统一的 root trust、overlap、symlink、exclude、size、encoding、取消和资源释放契约。
7. 尚未定义“只链接已有实体”和“允许发现新候选”两种 source policy，直接扫描通用文本会产生明显噪声。

## 第一阶段结论

- 文件事件只作为提示；启动、焦点恢复、root 变化、显式刷新和有界周期 reconciliation 共同保证最终一致。
- Search/domain-neutral coordinator 拥有 source identity、fingerprint、freshness、调度和 repository replacement；Content 拥有格式 segment；Entity analyzer 拥有 mention/link/candidate。
- 自动 source、evidence、occurrence、match 与 candidate cluster 写用户级 SQLite cache；confirmed entity、binding 与显式 candidate decision 继续写项目事实。
- Generic Markdown/TXT/JSON/YAML 默认只链接已有实体；Fountain/Story 或显式启用 root 才发现新候选。
- 自动处理执行精确链接、聚类、证据累计和降噪；默认 review 只展示 suggested/ambiguous cluster。
- 发现文件不等于导入 Asset；素材库文件只有显式 import/promote 后才成为 `AssetEntity`。
- 第一期不采用 OCR、ASR、媒体内容分析、embedding、TurboVec 或向量最近邻自动确认身份。

## 已知限制

- 已通过 fake-filesystem/真实临时目录的 Host 集成测试；当前仍缺少可重复的独立 Extension Development Host 场景脚本来从 CDP 触发外部目录变更并读取 SQLite projection。当前 CDP 只确认已有 Development Host 窗口可连接。
- Generic workspace include policy、candidate project-decision schema 和 session-only hide 行为已在 OpenSpec design 收敛：通用文本默认 `link-existing`，候选决策沿用显式项目事实，默认 review 隐藏低信号 projection。
- 中文自由文本的新实体召回在确定性一期中有限；需要后续 model-assisted NER spike，但不能改变事实与确认边界。

## 2026-07-18 验证记录

- OpenSpec strict validation、`git diff --check`、Prettier、Content/Entity/Search/Assets 聚焦测试、Entity/Search 类型检查、Assets compile、Node/Bun SQLite contract tests 均通过。
- `check:deps`、`check:legacy-debt`、`check:unused` 通过；全仓 `pnpm test` 被既有 Agent runtime boundary 与性能超时阻塞，未归因于本变更。
- `pnpm build` 已启动并完成部分 Webview/TypeScript 任务，但 Rust Engine release/native 任务长时间等待 Cargo/依赖索引后停止；需在稳定 Rust/Cargo 环境重试。
- `pnpm test:agent:eval` 的 key-free harness 因仓库现有 scenario schema 字段漂移失败，未进入真实 Agent case；不得把该结果描述为 Agent 行为验收。
- `pnpm check:quality` 在 `check:webview-boundaries` 因既有 `packages/neko-agent/packages/webview/src/components/AppShell.tsx` obsolete keyboard reporter import 停止；本变更未触碰该文件。
