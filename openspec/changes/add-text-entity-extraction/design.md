## Context

当前文件变化由多个 Extension 服务分别感知：Project Search 监听少量已知项目文件，Media Library Search 为每个配置目录维护文件名索引，Media Library Tree 自己刷新目录，Media LSP 只处理 `.nkv`。这些 watcher 的职责、覆盖格式、重建语义和错误处理不同；显式 `AssetFileImportService` 只覆盖用户主动导入，无法观察 Finder 复制、Git checkout、同步工具、外部编辑器或直接挂载素材库目录产生的全部变化。

统一实体已有 confirmed fact、candidate、binding 和 projection 模型，本地 metadata ADR 也已规定自动语义证据、候选匹配和 occurrence 进入用户级 `~/.neko/neko.db`。但当前自动 contribution 仍可将候选写入 `neko/entities/candidates.json`，使可重建分析结果与用户确认项目事实混在一起。

本变更跨 `@neko/content`、`@neko/search`、`@neko/entity`、`@neko/shared` SQLite repository、Assets Extension Host 和 Agent contribution，需要先明确 owner、依赖方向、事务边界和用户数据迁移。

### Five-layer analysis

| Layer          | Decision                                                                                                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Responsibility | Search 侧的 semantic source coordinator 拥有 source catalog、fingerprint、freshness、调度与 reconciliation；Content 拥有格式识别和稳定文本 segment；Entity analyzer 拥有 mention、确定性链接、候选聚类和 review classification；Assets 只提供素材库根目录配置；Host adapter 只提供文件列举、读取、事件和生命周期。 |
| Dependency     | Host composition 注册 source provider 与 analyzer；coordinator 只依赖小型 port 和 `@neko/shared` repository，不直接导入 Assets 或 Entity 内部实现；Entity analyzer 可以消费 Content contract 和 confirmed entity snapshot，但不得依赖 VS Code、Search 实现或 Webview。                                             |
| Interface      | `SemanticSourceDescriptor` 使用 workspace identity、逻辑 root identity、portable source ref、media type、analysis mode 和 fingerprint；`SemanticSourceAnalyzer` 输入稳定 snapshot，输出 evidence/projection replacement；repository 按 source 原子替换。                                                           |
| Extension      | 后续 OCR、ASR、vision 或 model-assisted NER 通过新的 analyzer/source profile 接入，不修改 discovery、freshness 和事实边界；一期不引入 embedding、模型 provider 或独立 LSP 进程。                                                                                                                                   |
| Test           | 使用 fake filesystem/clock 验证 missed-event reconciliation、根目录变化、去重、删除和竞态；使用 fixture 验证格式 segment/range、精确链接、候选阈值和 SQLite replacement；Extension 集成测试证明外部目录变化能被发现且不会隐式导入 Asset 或确认 Entity。                                                            |

## Goals / Non-Goals

**Goals:**

- 动态发现工作区与已配置素材库目录中的受支持文本文件，包括绕过显式导入接口的外部变化。
- 使用文件事件降低延迟，并通过启动、恢复焦点、根目录变化和有界周期 reconciliation 保证最终一致。
- 对未变化文件只比较轻量 fingerprint，不重复读取、解析或分析内容。
- 从 Markdown、纯文本、Fountain、JSON 和 YAML 生成稳定 segment/range、entity mention、occurrence 和 candidate projection。
- 自动链接确定性结果，聚合和降噪新候选，只把高价值或有歧义的决策交给用户。
- 保持 SQLite projection、Asset facts、Entity facts 和显式用户 candidate decision 的单一 owner。
- 为 VS Code 提供与编辑器集成的 diagnostics/navigation projection，同时让 TUI、Agent 和其他 Host 复用相同分析核心。

**Non-Goals:**

- 自动把发现的文件写入 `neko/assets/library.json`，或根据文件名自动确认 entity/binding。
- OCR、ASR、图片/音视频语义分析、embedding、TurboVec、向量最近邻自动合并或复杂共指。
- 每次保存同步调用 LLM，或在 Extension Host 主线程执行无界目录遍历和大型批量分析。
- 云端索引服务、独立 daemon、独立 LSP Server 或跨设备实时同步。
- 扫描 secret、缓存、依赖、构建产物、数据库、日志或未授权外部目录。

## Decisions

### 1. 文件事件是提示，reconciliation 才是完整性边界

VS Code `FileSystemWatcher`、TUI/Node watcher 或平台文件事件只产生 `source-created`、`source-changed`、`source-deleted` 和 `root-changed` 提示。Coordinator 在以下边界执行有界 reconciliation：Host 激活、窗口恢复焦点、媒体库 root 配置变化、显式刷新，以及运行期间分片的周期扫描。

Reconciliation 列举逻辑 root，比较 portable source identity 与 fingerprint，生成 create/change/delete diff。扫描必须按目录项数或时间预算分片，可取消并释放 watcher；大目录不得阻塞 Extension Host。事件先到或扫描先到都通过相同的去重队列进入 canonical analysis path。

只依赖 watcher 被否决，因为外部复制、Git 操作、睡眠恢复、网络盘和部分平台会丢失或合并事件。只做固定频率全量扫描也被否决，因为大型素材目录成本不可控。

### 2. Source root 和 source identity 使用逻辑、可移植身份

每个 scope 注册稳定 `rootId`、`workspaceId`、portable locator、访问策略和 `analysisMode`：

- `off`：不进入 semantic source catalog；
- `link-existing`：只识别和链接 confirmed entity，不产生新候选；
- `discover-candidates`：允许产生新候选 projection。

`sourceId` 由 workspace partition、root identity 和规范化 root-relative path 形成，不持久化 runtime absolute path。工作区路径优先于与其重叠的素材库 root；多个外部 root 重叠时按配置顺序选择一个 owner 并返回 overlap diagnostic，避免同一物理文件被重复计数。

通用 Markdown/TXT/JSON/YAML 默认使用 `link-existing`；Fountain、Story 等明确创作格式使用 `discover-candidates`。素材库 root 默认 `link-existing`，用户可以按 root 启用候选发现。这样支持动态感知，同时避免 README、配置文件和大批普通文档制造候选噪声。

### 3. Discovery、semantic projection、Asset import 和 Entity confirmation 是四条不同路径

发现文件只创建或刷新 `semantic_sources`；文本分析写入 `semantic_evidence` 与 `entity_asset_projections`。它不得调用 Asset import facade、修改 `neko/assets/library.json`、创建 confirmed entity 或写 binding。

用户需要素材库 identity 时显式 import/promote 为 `AssetEntity`；用户确认候选时显式写 owning entity fact；用户将候选保存为团队审阅项、拒绝或记录 merge decision 时，才写项目级 candidate decision。现有 `neko/entities/candidates.json` 可以保留为显式用户决策事实，但自动 analyzer 不再写入它。

把外部文件自动导入 Asset 被否决，因为目录可能只作为可搜索媒体库，自动导入会产生 Git churn、错误 provenance 和不可控项目事实。

### 4. Coordinator 通过小型 analyzer port 组合领域分析

Search/domain-neutral 层定义 `SemanticSourceAnalyzer`：声明支持的 source profile，接收不可变 source snapshot、content segments、confirmed entity revision 和取消信号，返回完整 evidence/projection replacement。Application composition 注册 Entity analyzer；Coordinator 不直接导入 Entity 或 Assets 内部实现。

`@neko/content` 提供格式 adapter：

- Markdown：可见文本块、heading/list/table 结构与原始 range；
- plain text：有界行/段落 segment；
- Fountain：scene heading、character cue、dialogue/action 等结构 segment；
- JSON/YAML：严格解析的 string scalar、结构 path 和 range，不在解析失败时回退为纯文本。

格式支持不表示扫描所有同扩展文件。Source policy 先应用 include/exclude、trust、size、encoding 和 analysis mode，再调用 adapter。

### 5. 一期使用确定性实体识别，不直接向量匹配

Entity analyzer 按以下顺序处理：

1. 显式 stable entity ref 直接链接；
2. 对 confirmed canonical name/alias 做边界感知的精确匹配；kind 已知时必须兼容，kind 未知时名称必须在所有 confirmed entity 中唯一；
3. Fountain character cue、scene heading、schema-aware entity 字段等明确结构可以产生新 candidate mention；
4. 新候选按 `kind + normalized name` 聚类，并累计 distinct source、occurrence、结构证据和 provenance；
5. 名称指向多个 confirmed entity、kind 冲突或候选可能错误合并时标记 `ambiguous`。

一期不使用 embedding 或 nearest-neighbor 作为身份确认。后续向量能力只能提供 Top-K recall/evidence，仍需精确规则或用户决策完成链接。

### 6. 自动候选分流只暴露异常和高价值建议

自动 projection 状态为：

- `observed`：低信号候选，静默保留；
- `matched`：已确定性链接 confirmed entity，不进入 review queue；
- `suggested`：至少来自两个不同逻辑 source，或在一个 source 中具有至少三次明确结构 mention；
- `ambiguous`：同名多实体、kind 冲突或潜在 merge，需要用户决策。

置信分数不能单独把候选提升为 confirmed entity。UI 默认只显示 `suggested` 与 `ambiguous`，按歧义优先、distinct source、occurrence 和最近变化排序，并按 candidate cluster 展示而不是按 mention 展示。

`dismissed`、`saved-for-review` 和 merge/reject 是显式用户决策，必须写 project candidate decision 后再投影；`promoted` 从 confirmed entity fact 与 provenance 派生。可清理 cache 不得成为这些用户决策的唯一 authority。

### 7. SQLite 按 source 原子替换，事实提交与 projection 失败解耦

`semantic_sources` 保存 source fingerprint、provider/schema version、coverage 和 freshness；`semantic_evidence` 保存 text segment/entity mention；`entity_asset_projections` 保存 occurrence、candidate、match 和 relationship projection。

分析开始和提交前都校验 fingerprint。若处理期间文件再次变化，旧结果不得提交，source 保持 stale 并重新排队。一次成功分析按 source 原子替换旧 evidence/projection 并递增 partition revision；失败保留旧 projection 但标记 stale 和明确 diagnostic，不返回空成功。

删除或 scope 移除只清理对应 cache projection，并把引用它的 confirmed binding/事实投影为 unavailable/orphaned；不得删除 Asset、Entity 或用户 candidate decision。SQLite 失败也不能回滚已经成功写入的项目事实。

### 8. VS Code 使用 LSP 风格 adapter，不启动独立服务进程

VS Code adapter 将 semantic revision 投影为 diagnostics、document symbol/navigation 或 candidate code action，并把文件事件、保存和焦点恢复转交 coordinator。未保存 buffer 可以生成 session-only overlay，但不得在保存前写 SQLite、创建 candidate decision 或修改项目事实。

TUI 在启动、command/session boundary 和显式刷新时运行相同 reconciliation/analysis contract。不存在 active workspace fallback；每项 operation 和 projection 都携带显式 workspace identity。

独立 LSP Server 被否决，因为当前产品是本地 Extension/TUI，文件 IO、workspace identity 和 SQLite 生命周期已经由 Host 拥有；额外进程只会复制状态和协议。

### 9. 边界保护只覆盖真实文件与信任风险

默认排除 `.git`、依赖目录、构建产物、`.neko/.cache`、数据库/WAL、日志、生成 cache、隐藏 secret 文件和超出限制的文件。外部 root 必须来自已解析的 media library settings，遵守 workspace trust、PathResolver、symlink/overlap 策略和可访问性检查。

未知 schema/version、非法 source identity、缺失 workspace partition、未注册 analyzer、解析失败和 repository contract mismatch 必须 fail-visible。单个不可读文件可以记录 source diagnostic 并继续其他 source，但不得伪装为已成功分析。

## Risks / Trade-offs

- [大型或网络素材库 reconciliation 成本较高] → 使用 fingerprint-first、分片预算、取消、root analysis mode 和可观测 scan metrics；不在每次文件事件后全量扫描。
- [Watcher 与扫描竞态提交旧结果] → 提交前重读 fingerprint，按 source replacement transaction 和 revision compare 拒绝 stale result。
- [通用文本候选噪声过多] → 默认 generic 文本只 `link-existing`，候选发现由结构化格式或 root policy 显式启用，review queue 只显示聚合后的 suggested/ambiguous。
- [同一目录被多个 root 覆盖] → 建立确定性 root precedence、抑制重复遍历并暴露 overlap diagnostic。
- [自动 migration 误删有价值候选] → 不删除既有 `candidates.json`；停止自动写入，将已有条目视为显式项目 candidate facts，另行提供可审阅清理。
- [确定性规则漏掉中文自由文本新实体] → 一期优先构建可靠 source/evidence/linking 基础；model-assisted NER 以后作为受预算 analyzer 增加，不改变事实边界。
- [多个 Host 观察同一 SQLite partition] → 使用 workspace identity、partition revision 和 repository transaction；不把 WAL 文件事件当业务协议。

## Migration Plan

1. 定义 source descriptor、analysis mode、analyzer output、candidate projection 和 repository replacement contract，先建立 fake Host/SQLite contract tests。
2. 在 `@neko/content` 增加受支持格式 adapter 和严格 range/encoding/size 行为。
3. 实现 coordinator 的 root registry、事件去重、fingerprint-first reconciliation、取消和 revision 语义。
4. 实现 Entity deterministic analyzer、confirmed snapshot linking、candidate clustering 与自动分流。
5. 接入用户级 SQLite semantic/entity projection，并验证 cache failure 不影响项目事实。
6. 在 Assets/VS Code composition 注册 workspace 与 media-library source provider，替换重复的 semantic rebuild 触发；素材树和文件名搜索可以继续消费自己的 projection，但不得成为 source authority。
7. 将 Entity review UI 改为 cluster-based suggested/ambiguous 视图，并为显式 save/dismiss/promote/merge 写入 owning project facts。
8. 禁止 Agent stream 和其他 analyzer 自动写 `candidates.json`，删除或 poison legacy automation；既有文件保留并按显式项目 candidate fact 读取。
9. 运行迁移、集成、真实 Extension Host、Agent evaluation 和质量门禁，确认 canonical path 被命中且 legacy auto-write 不再成功。

Rollback 可以停用新的 source provider/analyzer 注册并保留 SQLite cache；confirmed entities、Assets 和既有 candidate fact 文件不受影响。不得恢复 legacy 自动写 `candidates.json` 作为 fallback。

## Resolved Implementation Decisions

- 一期不新增 project-level include roots 设置。Workspace 使用固定支持扩展与 canonical exclusions；generic 文本默认 `link-existing`，明确创作格式默认 `discover-candidates`，外部素材库 root 默认 `link-existing`。
- 继续使用现有 `neko/entities/candidates.json` schema 作为显式 project candidate decision fact。自动 analyzer 只写 SQLite projection；只有用户 save-for-review、dismiss、reject、merge 或 promote 时才创建或更新文件记录。
- 一期不增加 session-only “暂时隐藏”。默认视图直接隐藏 `observed`/`matched` projection；用户可见操作只有会形成 durable project decision 或 confirmed entity fact 的 save/dismiss/reject/merge/promote。
