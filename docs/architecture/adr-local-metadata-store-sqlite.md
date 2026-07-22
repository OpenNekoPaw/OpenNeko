# ADR: 用户级 SQLite 本地元数据 Store 与项目事实边界

状态：Accepted
原始日期：2026-06-27
修订日期：2026-07-14
范围：`~/.neko/`、workspace `neko/`、workspace `.neko/`、workspace `.neko/.cache/`、VS Code `globalStorageUri`、Host content read/representation、ResourceCache、Search、Assets、Entity、Agent、Market 和各创作领域的本地元数据。

本文定义 OpenNeko 哪些结构化本地数据进入用户级 SQLite，哪些内容继续使用 JSON/Markdown/TOML/JSONL/`nk*` 或文件 artifact。它补充 [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)、[`asset-library.md`](asset-library.md)、[`unified-entity.md`](unified-entity.md) 和 `normalize-neko-storage-scopes` OpenSpec。

本修订取代旧版 ADR 中“每个 workspace 使用 `.neko/neko-local.db` 或 `.neko/.cache/neko-cache.db`”的放置策略。新 canonical path 不创建 workspace SQLite 数据库。

## 背景

仓库现有文件布局分为：

- `~/.neko/`：用户级跨项目文件。
- `<workspace>/neko/`：Git-trackable 项目事实。
- `<workspace>/.neko/`：gitignored 工作区本机文件。
- `<workspace>/.neko/.cache/`：工作区缓存 artifact。

这个分类适合文件，但不适合继续为每个目录复制一套 JSON 数据库或 SQLite 数据库。迁移前实现曾有：

- `.neko/.cache/resources/manifest.json`
- `.neko/.cache/proxies/manifest.json`
- `.neko/.cache/generated/index.json`
- `.neko/.cache/media-metadata.json`
- `.neko/.cache/search-index.json`
- `.neko/.cache/asset-graph.json`
- `.neko/tasks.json`
- `.neko/dashboard-activity.json`
- `~/.neko/conversations-index.json`

这些 whole-file JSON store 存在重复 schema、整文件改写、并发覆盖、损坏恢复、增量查询、跨 Host 可见性和 GC 问题。

会话故障进一步证明了职责错误：VS Code 会话列表仍可从 `workspaceState` 显示，Journal 也仍然存在，但零字节 `conversations-index.json` 让终态持久化返回 `conversation-durability-failed`。一个本应可重建的 catalog projection 被当成第二事实源和 hard gate。

## 运行时验证

2026-07-13 使用已有 VS Code 内置 `Debug Dev (All)` 和 `/Users/feng/Git/neko-test` Development Host 完成验证，没有启动独立 VS Code、Chrome、Electron 或普通浏览器替代环境。

| 环境                        | 结果                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| 真实 VS Code Extension Host | Node `24.17.0`、SQLite `3.53.0`；`node:sqlite` 建表、写入、查询成功                       |
| 当前系统 Node               | Node `25.6.1`、SQLite `3.51.2`；成功，但输出 experimental warning                         |
| 编译 TUI                    | Bun `1.3.10`；`node:sqlite` 返回 `ERR_UNKNOWN_BUILTIN_MODULE`                             |
| Bun SQLite                  | `bun:sqlite` 建表、写入、查询成功                                                         |
| 跨 Host 文件往返            | Extension `node:sqlite` 创建 WAL DB，Bun TUI 读写，Extension 再读取，`integrity_check=ok` |

验证证明当前 Extension/Bun 运行时可以共享 SQLite 文件格式。支持契约因此收敛为 VS Code `^1.128.0`（已验证 Extension Host Node `24.17.0`）、Node `>=24.0.0` 和 Bun `>=1.3.10`；缺少对应 SQLite module 或版本时启动必须 fail-visible，不能静默降级到 JSON。

## 决策

引入 Host-owned `LocalMetadataStore`，使用一个用户级 SQLite 数据库：

```text
~/.neko/
  neko.db
  journals/
  logs/
  config.toml
  AGENTS.md
```

- `neko.db`：Extension 与 TUI 共享的唯一结构化本地 metadata authority。
- 有价值的本机状态与可重建 projection 分别声明为逻辑 `state` 和
  `cache` 表，但共用 schema、连接、migration、backup 和 concurrency 边界。
- 不创建 `<workspace>/.neko/neko-local.db`。
- 不创建 `<workspace>/.neko/.cache/neko-cache.db`。
- 不在 `globalStorageUri` 创建另一份共享 SQLite authority。
- workspace `.neko/.cache/` 仍可保存缩略图、proxy、文档页图、生成预览等文件 artifact，但 metadata 进入用户级 `neko.db` 的 cache-owned tables。
- `neko/` 项目事实继续使用可审阅文件，不迁入用户数据库。

SQLite 是本机结构化状态、账本和查询层，不是项目事实格式，也不是媒体容器。

### Canvas Workspace Board delivery ledger

Canvas Board delivery 是 `tasks` / `task_checkpoints` 的一个受限、Canvas-owned 使用者，不是第 19 张表、workspace DB、transcript outbox 或 Board 重建索引。delivery task 使用 `system:canvas-board-delivery:<deliveryId>`，writer lease 使用 `system:canvas-board-writer:<workspaceId>`；payload 只接受已验证的 typed batch、claim epoch、expiry、attempt、diagnostic 和 compact projected receipt。`system:` rows 按 workspace 分区，但必须从 Agent TaskManager listing、`/tasks`、work-item projection、task continuation 和 generic completed-task cleanup 排除。

账本状态是 queued/claimed/projected/noop/blocked/conflict/discarded。它负责跨 Extension/TUI Host 的 pending、fenced claim、retry、discard 和 receipt ordering；`.nkc` 仍是节点、连接、位置、分组、标题、批注、删除和用户移动的唯一事实源。打开 Board 或 Host 启动只消费 pending rows，不能从全部历史 receipt 自动重建、覆盖或复活已编辑 Board；`.nkc` 缺失时仅允许对仍 pending 的 delivery 创建空 Board。

delivery payload 不得包含 reasoning、日志、secret、token、absolute/runtime path、Webview URI、process handle、DB path/table 或 active/recent Canvas identity。projected/noop 后只保留 artifact identity、target URI、Canvas revision、node IDs、diagnostic 和 completedAt 等 compact receipt，不保留可从 `.nkc` 读取的 Markdown body。LocalMetadata 不可用或损坏时必须 fail-visible；禁止 JSON fallback、raw SQL 暴露、workspace SQLite 或直接写 `.nkc` 绕过 ledger。

## 为什么不用 workspace DB

用户级 DB 更符合 Extension/TUI 共享和本地产品边界：

- 两个 Host 不需要发现、打开和迁移每个 workspace 的数据库。
- 支持跨项目 conversation/catalog/search/recent 查询。
- workspace 移动后不携带 stale DB/WAL/SHM 文件。
- 避免多 root、多窗口和 TUI 为同一项目打开不同 DB 路径。
- workspace `.neko/` 更小，不会继续积累 package-local database。

代价是用户 DB 的影响面跨 workspace，且 state/cache 共用物理故障和 vacuum 边界。当前目标只有 18 张长期核心表，双连接、双 migration、双 revision 和双 backup 的复杂度尚无测量依据。因此先使用单库，以 state-safe durability、在线备份、完整性检查、逻辑表 ownership、allowlist 分区清理和可观测修复控制风险。只有 FTS/cache 体积、维护阻塞或恢复证据证明单库不满足要求时，才通过显式 migration 物理拆分。

## Workspace Identity

用户级 DB 中所有 workspace-scoped row 必须携带稳定 `workspace_id`。绝对路径、active workspace、VS Code handle、cache path、Webview URI 或 runtime token 都不能作为身份。

canonical checkout identity descriptor：

```text
<workspace>/.neko/workspace.json
```

```json
{
  "version": 1,
  "workspaceId": "<uuid>"
}
```

规则：

- descriptor gitignored，是轻量身份文件，不是 workspace DB。
- descriptor 不是启动单点故障；用户级 `workspaces` registry 是其恢复副本。descriptor
  缺失且 current locator 只有一个匹配时，Host 原子重建相同 UUID；零匹配才创建新
  identity；多个匹配返回 typed conflict，不选择 active workspace 或生成第三个 UUID。
- workspace 移动/重命名后 UUID 不变。
- descriptor 出现在新 locator 时，Host 必须先检查旧 locator：旧 locator 不存在才自动
  rebind；新旧 locator 同时存在视为复制 checkout，要求显式 clone/rebind 决策。
- 用户 DB 中 locator 只能保存 relative path 或 `${VAR}/path`，由 `PathResolver` 解析。
- Extension、TUI 和 workspace-scoped metadata binding 必须先经过同一个
  descriptor/registry resolver，再创建或访问 workspace partition。
- identity 恢复只重建 `.neko/workspace.json`；不得生成可选的 `config.toml`、
  `memory.md`、AGENTS、Skill、项目事实或其他用户编辑内容。
- 同一 UUID 同时出现在两个 live locator 时 fail-visible，要求显式 clone/rebind。
- 历史行为若已把多个 non-orphan UUID 注册到同一 current locator，必须使用独立的 canonical identity selection：事务内校验精确冲突集合，将未选 UUID 标记为 orphan 并保留其全部 partition；不得误用 clone/rebind、创建第三个 UUID、自动合并或删除数据。current-locator 查询不返回 orphan，orphan 仍可按 UUID 审计和恢复。
- 不得通过 active workspace fallback 合并未知或缺失 workspace identity。
- 后续可以新增 Git-trackable `projectId` 关联同一项目的多个 checkout，但它不能替代本次的 local checkout identity。

## Schema 与数据分类

长期目标固定为 16 张核心表。触碰时间、quota 与 GC eligibility 合并到 resource row；Run lifecycle 合并到 task；semantic coverage 合并到 source；Entity 与 Asset 的多种图/反向索引合并为 typed projection。临时 job/status/history、provider diagnostic history 和 log index 默认不建表：进程内临时状态留在内存，需要跨重启恢复的后台工作使用 `tasks` / `task_checkpoints`，当前诊断附着在所属 projection/catalog row，原始日志继续使用 JSONL。已删除 Dashboard/Market 产品不再拥有活动仓储；旧 SQLite 中若存在对应表，其字节保留到显式用户数据迁移，不由当前 runtime 暴露或改写。

| #   | 表                         | 逻辑分类 | 用途 / authority                                                              |
| --- | -------------------------- | -------- | ----------------------------------------------------------------------------- |
| 1   | `schema_migrations`        | system   | 单一物理数据库的 namespaced migration ledger                                  |
| 2   | `workspaces`               | state    | Workspace identity、portable locator、last-seen、duplicate/orphan state       |
| 3   | `projection_versions`      | system   | Partition/domain revision、freshness 与 rebuild requirement                   |
| 4   | `conversations`            | cache    | 从 Journal metadata 重建的会话列表与搜索 projection                           |
| 5   | `conversation_preferences` | state    | Pin/favorite 等明确、不可重建的用户选择                                       |
| 6   | `tasks`                    | state    | 需要跨重启保留的 Task/Run lifecycle                                           |
| 7   | `task_checkpoints`         | state    | 最小 resumable recovery payload；Canvas Board delivery 的 checkpoint 复用此表 |
| 8   | `local_drafts`             | state    | 仅保存不可静默丢失的未提升本机草稿                                            |
| 9   | `resource_cache_entries`   | cache    | Source/artifact ledger、size、touch、quota、GC eligibility                    |
| 10  | `resource_cache_variants`  | cache    | Thumbnail/proxy/page/preview/generated variants                               |
| 11  | `media_metadata`           | cache    | 可重建 probe 与本机 availability metadata                                     |
| 12  | `search_documents`         | cache    | Search/FTS source projection                                                  |
| 13  | `semantic_sources`         | cache    | Source fingerprint、provider/schema version 与 coverage                       |
| 14  | `semantic_evidence`        | cache    | locator/range/hash、mention 与 provider version 等 compact evidence；不含正文 |
| 15  | `entity_asset_projections` | cache    | Entity occurrence/relationship/binding 与 Asset graph projection              |
| 16  | `catalog_items`            | cache    | Skill/Command/Processor/provider descriptor 与当前 diagnostic                 |

SQLite FTS virtual/shadow tables 和普通 index 是实现 artifact，不计入 18 张核心 schema 表。所有 workspace-scoped row 使用 `workspace_id` 分区；跨项目记录使用显式 global partition。

M1 只创建 `schema_migrations`、`workspaces`、`projection_versions` 和 `conversations`。它只解决损坏的 conversation index、建立 workspace partition，并验证 Extension/TUI 共用同一个数据库。其余 14 张表由后续 owning-domain migration 按真实需求创建，不在 M1 预建空表。

State-owned transaction 必须独立提交并进入备份/恢复策略；cache-owned transaction 失败不能改变已提交 authority/state 的成功结果。缓存清理只能删除 allowlist 中的 cache table/partition，不能删除 `neko.db`，也不能触碰 state table、项目事实、Journal、retained artifact 或用户可编辑文件。

## 继续使用文件的数据

以下内容不因 SQLite 引入而迁入数据库：

| 数据                                             | Canonical location / format                                               | 原因                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------- |
| 项目设置                                         | `neko/settings.json`                                                      | Git-trackable 项目事实；不保存媒体库 target     |
| 本机媒体库 link                                  | `neko/assets/<libraryName>`                                               | Git-ignored symlink/junction；OS 拥有 target 映射 |
| Confirmed unified entities                       | `characters.json`、`neko/entities/*.json`                                 | 稳定项目身份和语义事实                          |
| Confirmed entity representation bindings         | `neko/entity-representation-bindings.json`                                | 用户确认创作决策；直接保存 ContentLocator       |
| Entity requirements / visual drafts              | `neko/entity-asset-requirements.json`、`neko/visual-identity-drafts.json` | 可审阅项目计划/草案事实                         |
| Domain project files                             | `.nkc`、`.nkv`、`.nks`、`.nkm`、`.nkp` 等                                 | 项目格式契约                                    |
| AGENTS / memory / Skills / Commands / Processors | Markdown/TOML/package/manifests                                           | 用户可编辑、可复制、可审计                      |
| Conversation transcript/events                   | Journal JSONL                                                             | append-only recovery authority                  |
| Raw operational/audit logs                       | JSONL/log files                                                           | DB 锁定或损坏时仍可诊断                         |
| Retained media and cache artifact bytes          | managed files                                                             | Webview URI、Engine Range、外部工具和大文件清理 |
| Secrets                                          | SecretStorage/system keychain                                             | 不得进入普通 DB/config/log                      |

### Unified Entity Boundary

SQLite 中的 Entity 数据只能是 projection：name/alias search、occurrence、relationship、candidate match、semantic evidence、availability 和 reverse lookup。

用户确认或确定性提升后的 Entity ID、名称、状态、语义 metadata、binding、asset requirement 和 visual draft 必须先写 owning project fact。SQLite 更新失败只能标记 projection stale，不能回滚已成功的项目事实，也不能把 DB row 当成 confirmed entity。

语义 source discovery 由 Host 注册工作区和已授权媒体库 root，并将文件事件作为低延迟 hint；有界 reconciliation 才是完整性边界。`semantic_sources`、`semantic_evidence` 与 representation availability projection 的写入必须走 source-scoped atomic replacement。Media Library Search/Tree 可以继续维护文件名、目录和导航 projection，但不得成为语义 source authority，也不得重复触发 Entity 分析。

`semantic_evidence` 不得保存完整 page、chapter、section、paragraph、segment text、文档二进制或内嵌媒体。分析期正文只能存在于有界 transient segment；搜索或导航需要上下文时，消费者使用 source locator 通过 `DocumentAccessService.readRange()` 回读源文件，并在读取前后校验 fingerprint。旧 body-bearing semantic cache 是可重建 cache，只能通过 allowlisted source cleanup 清理；不得 dual-read、迁移为项目事实或保留 legacy fallback。

未确认数据按生命周期分类：

- 不可丢失的本机草稿 -> `neko.db` 的 state-owned tables。
- 可重算的候选/匹配/分析结果 -> `neko.db` 的 cache-owned tables。
- 用户确认后 -> owning project fact file。

## Journal、日志与会话 Catalog

Journal 必须记录足以重建 catalog 的 metadata event：conversation ID、workspace ID、title/title change、source、created/updated timestamp、model selection 和必要状态。

Conversation catalog 是 `neko.db` 中 cache-owned 的 `conversations` projection。Extension 和 TUI 都通过 `ConversationCatalog` 查询。VS Code `workspaceState` 只保存 tabs、active selection、scroll 等 Host view state。

会话 durability 规则：

```text
Journal / required state commit success
  -> conversation is durable

catalog projection failure
  -> stale/rebuild diagnostic
  -> conversation remains durable
```

不得因 catalog failure 在 Journal 成功后返回 `conversation-durability-failed`。

原始日志保持 append-only 文件。SQLite 可以建立索引、FTS 或聚合，但数据库记录不能是唯一 debug/audit evidence。

## Host Adapter Boundary

共享层定义小接口，不暴露 SQL：

```text
LocalMetadataStore
  open()
  transaction()
  readPartitionRevision()
  migrateNamespace()
  backup()
  integrityCheck()
  dispose()

WorkspaceRegistry
ConversationCatalog
TaskStateRepository
ResourceMetadataRepository
SearchProjectionRepository
EntityProjectionRepository
...
```

适配器：

- VS Code Extension Host：`node:sqlite`。
- 编译 Bun TUI：`bun:sqlite`。

约束：

- Extension 和 TUI 运行同一 schema migration 和 store contract tests。
- Agent Core、Webview、feature domain package 不导入 `node:sqlite` 或 `bun:sqlite`。
- Webview/TUI presentation 不接收 DB path、table name、cache path 或原始 SQLite error。
- `node:sqlite` 是同步 API；bulk FTS、semantic rebuild 和大型 migration 必须使用 worker，不能阻塞 Extension Host。
- `neko-engine` 不拥有本地 metadata DB。

## 运行时支持策略

运行时契约为：

1. VS Code `^1.128.0`，其 Extension Host 已验证 Node `24.17.0` 与 `node:sqlite`。
2. Node `>=24.0.0`、`@types/node ^24` 和 Node 24 CLI bundle target。
3. Bun `>=1.3.10` 保留独立 `bun:sqlite` adapter，因为 Bun 不提供 `node:sqlite`。
4. 启动时验证 required runtime capability；不满足时 fail-visible。
5. 不得 fallback 到 JSON、workspace DB 或第二套 SQLite 实现。
6. 验证 macOS/Windows/Linux、x64/arm64、Development Host、packaged VSIX、Node CLI 和 compiled Bun TUI。

## Cross-Host Refresh

共享 DB 不等于 UI state 自动同步。每次可见 metadata transaction 同时递增 partition revision：

- Extension 在 activation/focus、自己提交后和 bounded revision observation 时刷新。
- TUI 在 command/session boundary 查询。
- 不监听 `-wal` 文件作为业务协议。
- 不同步 active tab、scroll、panel focus 或当前 TUI selection。

所有 instance-scoped write/query 必须携带显式 workspace/conversation/task identity，不得 fallback 到 active workspace/conversation。

## Migration And Recovery

迁移规则：

- Legacy JSON、workspace DB 和 package-local manifest 只能由 migrator、diagnostic 或 rejection path 读取。
- valuable source mutation 前先备份；cache source 可以 quarantine 后重建。
- import 使用单事务并验证 identity、row count、revision 和 integrity。
- migration report 列出 migrated、rebuilt、quarantined、skipped、unrecoverable 和 user-action-required。
- cutover 后 poison legacy read/write path，禁止 dual-read/dual-write。
- malformed/zero-byte data 不能被解释为空初始化成功。
- 不删除 Journal、raw log、settings、trust/install state、retained artifact 或 project fact。

迁移顺序：

1. Workspace identity 和 user DB schema。
2. Journal metadata completeness 与 conversation catalog。
3. Task/Run/recovery 和 valuable local state。
4. ResourceCache/media/generated metadata。
5. Search/semantic/Entity/Asset projections。
6. Skill/Command/Processor/Market/provider catalogs。
7. Legacy path poisoning、orphan GC、cleanup 和 repair tooling。

Agent Task 的 prelaunch 迁移窗口已经关闭。真实本地来源完成显式审批、备份、导入、
校验和退休后，Extension/TUI 稳态只装配 SQLite `tasks` / `task_checkpoints`
repository，不再扫描 `.neko/tasks.json` 或 VS Code Memento Task key，也不再暴露
Extension 审查命令、TUI slash command、approval port、source adapter 或 owner
reconstruction parser。迁移证据保留在对应 OpenSpec verification 中，不作为永久产品
API。经用户明确授权的本机测试 migration backup 可以在核对 row count、checkpoint count
和 `integrity_check` 后清理；该授权不构成自动删除有价值用户数据的通用规则。

### 用户诊断与处理

Extension 对话框和 TUI 只展示稳定的用户诊断，不展示数据库路径、表名、SQL、
`SQLITE_*` 原始错误或 adapter stack。完整 cause 只进入 Host 日志。

| 诊断                                         | 含义                                        | 用户动作                                                          |
| -------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| `local-metadata-unsupported-runtime`         | 当前 VS Code/Node/Bun 缺少受支持的 SQLite   | 更新到受支持版本并重启 Host                                       |
| `local-metadata-workspace-identity-conflict` | 同一 workspace UUID 出现在两个 live locator | copied checkout 选择 Clone；移动/恢复的 checkout 选择 Rebind      |
| `local-metadata-migration-approval-required` | valuable legacy source 尚未逐项批准         | 逐 source 审阅；批准前不备份、不导入、不重命名、不删除            |
| `local-metadata-migration-failed`            | 导入、identity/count 校验或退休未完成       | 保留 source/backup，查看 migration report，修复后重试             |
| `local-metadata-backup-failed`               | safety backup 未创建                        | 修复目标目录；destructive migration 必须保持阻塞                  |
| `local-metadata-corrupt`                     | integrity check 失败                        | 停止写入，保留原文件和备份；只重建 cache-owned projection         |
| `local-metadata-rebuild-required`            | projection stale，但 authority 已保存       | 从 Journal、project fact 或 retained artifact 运行 owning rebuild |
| `local-metadata-cleanup-report`              | cleanup 已完成或仍有需人工处理的条目        | 检查七类 itemized outcome，不把 user-action-required 当作 skipped |

### Host-only inspection、export 与 repair

以下命令只用于维护者或用户在 Host 终端中排查；它们不是 Webview API，也不得把命令输出
原样转发到 Webview。执行 export/recover 前必须退出所有 Neko Extension Development Host、
普通 VS Code 窗口和 TUI，保留 `neko.db`、`-wal`、`-shm` 与现有 backup，不得在原文件上
直接运行 destructive repair。

macOS/Linux：

```bash
export NEKO_DB="$HOME/.neko/neko.db"
export NEKO_BACKUP="$HOME/.neko/neko.backup.db"
export NEKO_RECOVERED="$HOME/.neko/neko.recovered.db"

# Read-only inspection
sqlite3 -readonly "$NEKO_DB" 'PRAGMA integrity_check;'
sqlite3 -readonly "$NEKO_DB" \
  'SELECT namespace, version, name FROM schema_migrations ORDER BY namespace, version;'

# Consistent SQLite export/backup; never use cp while a Host may still be writing.
sqlite3 "$NEKO_DB" ".backup '$NEKO_BACKUP'"
sqlite3 -readonly "$NEKO_BACKUP" 'PRAGMA integrity_check;'

# Last-resort recovery into a new file. Do not replace the source unless this reports ok.
rm -f "$NEKO_RECOVERED"
sqlite3 "$NEKO_DB" '.recover' | sqlite3 "$NEKO_RECOVERED"
sqlite3 -readonly "$NEKO_RECOVERED" 'PRAGMA integrity_check;'
```

Windows PowerShell 使用相同 SQLite 操作，只通过 `$HOME` 解析用户级路径：

```powershell
$NekoDb = Join-Path $HOME '.neko\neko.db'
$NekoBackup = Join-Path $HOME '.neko\neko.backup.db'
sqlite3 -readonly $NekoDb 'PRAGMA integrity_check;'
sqlite3 $NekoDb ".backup '$NekoBackup'"
sqlite3 -readonly $NekoBackup 'PRAGMA integrity_check;'
```

`.recover` 只生成候选恢复文件，不等价于成功修复。恢复文件必须再次通过 schema migration
ledger、state-owned identity/count 和 repository integrity 验证；验证失败时保留原 DB 与 backup，
不得通过清空 DB、删除 state table 或只验证 cache 查询来宣布恢复成功。

### Remote SSH 与 Container

- Remote SSH 中 Extension Host 运行在远端，因此 canonical DB 是远端 Host 用户的
  `~/.neko/neko.db`；本机 Extension UI 不会打开本机 DB 代替它。
- Dev Container/Codespace 中使用 container/remote Host 的用户 home。重建或删除容器可能
  删除该 Host-local DB，valuable state 需要通过受控 backup/export 保留。
- TUI 使用它实际运行所在 Host 的用户 DB；本机 TUI 与远端 Extension 不会自动共享文件。
- workspace locator 只解决同一 Host 内的移动与重绑，不提供 DB、Journal、Task 或 catalog
  的跨机器同步、复制、冲突合并或云备份。

## Cleanup、Backup And Orphan GC

- `neko.db` 必须使用 state-safe durability；物理在线备份覆盖整个数据库，恢复时保护 state-owned rows，并可将 cache projection 标记为 stale 后重建；备份失败阻止 destructive migration。
- Cache-owned tables 支持按 workspace/domain allowlist 分区删除重建、quota、GC 和 vacuum；不得通过删除 `neko.db` 实现 cache reset。
- Workspace 删除或长期不可达后先标记 orphan，超过 retention 后才能清理 cache partition。
- Valuable state partition 需要用户确认或已验证导出/迁移，不能随 orphan cache 自动删除。
- `.neko/.cache/` artifact cleanup 与 DB metadata 删除通过 ResourceCache transaction plan 协调，失败必须暴露 stale/orphan diagnostic。

## 测试与质量门禁

至少覆盖：

- Shared contract：classification、workspace identity、portable locator、duplicate/rebind。
- Node/Bun store parity：migration、transaction、rollback、WAL、busy timeout、revision、dispose。
- Cross-process：Extension/TUI 双向可见、并发写入、reload、multi-window。
- User data：state backup/restore、corruption、failed migration、orphan retention。
- Cache：partition rebuild、quota/GC、artifact missing/stale、vacuum。
- Legacy poisoning：旧 conversation/manifest/search/entity/asset path 不得返回成功；旧
  Task path、key、命令和 migration API 必须从生产装配中消失。
- Authority path：Journal/project fact 成功后 projection failure 不改变 durable success。
- Runtime：`Debug Dev (All)` + `vscode-extension-debugger`，compiled Bun TUI，packaged VSIX。
- Boundaries：Webview/Agent/Search UI 不导入 SQLite client；secrets/bytes/raw logs/facts 不进入 DB。
- Quality：`pnpm build`、`pnpm test`、`pnpm check`、legacy debt/unused checks，以及受影响 Agent evaluation。

## 后果

收益：

- Extension/TUI 共用一个用户级 metadata authority。
- 不再发现和迁移每 workspace DB。
- 支持事务、增量查询、FTS、跨项目 catalog、引用计数、LRU/GC 和高频 touch。
- Valuable state 与 rebuildable cache 有独立逻辑 ownership、transaction、backup policy 和 cleanup allowlist。
- Workspace 更干净，项目事实继续可 Git review/export。
- Catalog 损坏不再伪装为正文或项目事实丢失。

成本：

- 引入 workspace identity、user DB backup/repair、schema ownership 和 orphan GC。
- User DB corruption 影响多个 workspace 和两类逻辑数据，需要 state-safe durability、在线备份、integrity diagnostic 和 projection rebuild。
- 运行时最低版本必须提高，Extension/Bun 需要两个 adapter。
- SQLite 手工排查不如 JSON 直接，需要 inspector/export/diagnostic 命令。
- Bulk indexing 必须避免阻塞 Extension Host。

## 拒绝的方案

- 每 workspace SQLite：增加发现、移动、多 root、跨 Host 和 migration 复杂度。
- 两个用户级数据库：在 18 张核心表规模下重复 connection、migration、revision、backup 和跨 Host lifecycle；仅在测量证据证明 cache 体积、maintenance blocking 或 recovery 无法保护 state 时再显式拆分。
- 把项目事实迁入 user DB：破坏 Git diff/merge、项目共享、导出和审计。
- 把 confirmed assets/entities/bindings/requirements/visual drafts 放入 cache/user/globalStorage DB：这些位置不是 project fact authority。
- 把 conversation transcript 或 raw logs 只放 SQLite：数据库损坏时无法独立恢复和诊断。
- 把 media bytes 放 SQLite blob：不利于 Webview URI、Engine Range、外部工具和大文件清理。
- 只使用 VS Code Memento：TUI 无法共享会话、Task 和 catalog。
- 在 `globalStorageUri` 建共享 DB：TUI 不应依赖 VS Code 私有路径。
- 让每个 package 自己打开 SQLite：重复 schema/migration/cleanup 并制造跨包耦合。
- 保留 JSON fallback：形成双 authority，并继续隐藏 migration 和 corruption 缺陷。
- 在插件内捆绑完整 Node sidecar：增加发布体积、进程生命周期、安全和跨平台复杂度。
