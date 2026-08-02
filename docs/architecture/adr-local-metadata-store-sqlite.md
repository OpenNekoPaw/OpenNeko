# ADR: Desktop 本地元数据 Store 与项目事实边界

状态：Accepted

更新日期：2026-08-03

范围：Electron Desktop、本地 SQLite、项目文件、Agent、Assets、Entity、Search、任务投影和缓存索引。

## 决策

Desktop Main 是本地结构化元数据 Store 的唯一进程 owner。数据库位置由 Desktop path/config
service 解析，不写入项目文件，不向 preload 或 renderer 暴露绝对路径或数据库 handle。

SQLite 只保存本机结构化状态、可查询 catalog、账本和可重建 projection；它不是项目事实格式、
媒体容器或领域对象仓库。

持久数据准入必须按以下顺序 fail closed，不能按当前扩展名或目录猜测：

1. secret/credential 使用系统 credential store 或 safeStorage 加密 authority；
2. raw log/audit 使用用户区受控 JSONL/log 文件与 rotation/retention；
3. 用户需要查看、编辑、定位、导入导出或随工作区/设备迁移的内容使用 versioned file/bundle；
4. 大型媒体与 artifact bytes 使用 owning file/artifact store；
5. session scratch 留在 memory 或受控临时目录；
6. 可重建结构化 metadata 使用 `neko.db#cache`，只作为 projection；
7. 其余非 secret、machine-local、UI-managed application state 才可进入 `neko.db#state`。

机器契约记录 authority kind、user management、portability、sensitivity、SQLite role、deletion、
retention、backup 与 migration 语义。未知分类、非 canonical SQLite path、raw-log table、普通 Store
中的 secret-like schema，以及 user-content SQLite authority 都是质量门禁失败。迁移期 reader 必须是
精确、带 owner/验证路径/替代方案/移除条件/到期日的声明，不能使用通用 allowlist。

| 数据                                        | Canonical owner                          | SQLite 角色                                         |
| ------------------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| `.nk*`、Markdown、OTIO 等项目内容           | owning package 的项目文件                | 可选索引，不得反向覆盖项目事实                      |
| Agent transcript                            | Pi Session JSONL + conversation manifest | catalog、查询和恢复所需的结构化投影                 |
| Media Library link、Entity/Asset projection | owning domain                            | 可查询 projection 与 freshness metadata             |
| 后台领域 Job                                | owning domain repository                 | checkpoint、状态和恢复索引                          |
| 派生缓存                                    | cache owner                              | locator、fingerprint、quota、GC eligibility         |
| 凭据与 secret                               | Desktop credential store                 | 不保存 secret；仅允许无敏感信息的 provider metadata |
| 窗口、选择、滚动和布局                      | Desktop view-state owner                 | 仅保存明确允许恢复的版本化展示状态                  |

Agent Pi Session 的 transcript 仍保存在 JSONL；conversation lease/checkpoint 等 operational state 与
catalog projection 使用同一 `~/.neko/neko.db`。旧 `agent/pi/metadata.sqlite` 只允许由显式迁移器读取：
迁移器验证旧表，在 canonical DB 单事务导入并写 source digest marker，使用生产查询读回校验，再把旧库
改名为不可被正常 runtime 打开的归档。Credential 不得进入 SQLite；Desktop 通过 safeStorage-backed
secret port 持有，已删除的 TUI/VS Code SQLite credential path 不保留。

### Desktop Shell 与应用设置迁移

Desktop Shell state 与 application settings 由 `@neko/local-metadata` 的两个独立、版本化 state
authority 保存到现有 `~/.neko/neko.db`。Desktop 启动在创建 Shell/settings service 前执行迁移：先
完整读取并用生产 codec 校验两个旧 JSON，再在单个事务中提交两行状态与 source digest marker；任一
输入、事务或读回校验失败时，两个旧文件都保持原状，正常运行不得回退到 JSON。

读回成功后，Desktop 将仍匹配 marker 的
`desktop-shell-state.json` 与 `desktop-application-settings.v1.json` 分别改名为 `.migrated-v1`
归档。提交后归档中断可在下一次启动继续；若未归档源发生变化，启动会 fail-visible，既不覆盖数据库，
也不删除冲突源。归档是人工恢复证据，不是运行时 authority；确认无需降级后可由用户或发布维护流程
删除。

需要降级到仍读取旧 JSON 的版本时，必须在安装旧版本前关闭 Desktop，并显式执行：

```bash
pnpm desktop:state:export-legacy --home <用户主目录> --electron-user-data <Electron-userData目录>
```

该命令从 SQLite 读取两个 authority，通过生产 codec 校验，先在同级目录 staging，再成对发布旧文件；
任一预写或发布失败都会保留 SQLite 与已有目标。不得手工复制数据库行或把 `.migrated-v1` 归档改回
运行时文件。损坏数据库、未知 schema、source digest 冲突或无法完整回滚的文件系统错误必须先备份
`~/.neko/neko.db*` 和遗留文件，再根据诊断人工处理。

## 工作区与用户区

正常工作区只保存用户文档和 `neko/` 下可审阅、可同步、版本化的项目事实：

- `neko/project.json` 保存稳定项目/工作区身份和最小项目元数据；不得成为无 owner 的通用设置容器；
- owning domain 在 `neko/` 下保存自己的项目事实；
- 只有存在明确 review/edit/delete/sync 产品入口时，才创建可选的 `neko/memory.md`；
- 正常运行不得创建或依赖工作区 `.neko/` 目录。

机器本地工作区设置、运行恢复和任务状态按 `workspace_id` 进入 `neko.db#state`；Search、Media、
Entity 等可重建索引进入 `neko.db#cache`。大型派生字节位于
`~/.neko/cache/workspaces/<workspaceId>/`，Desktop/Workspace/Agent 原始日志位于
`~/.neko/logs/` 下按 owner identity 分区。物理 cache/log path 不进入项目事实。

旧 `.neko/workspace.json`、`.neko/config.toml`、`.neko/settings.local.json`、
`.neko/preferences.md`、`.neko/memory.md`、`.neko/logs` 和 `.neko/.cache` 由存储治理迁移逐项
分类。未知文件必须保留并阻止清理；不得因为目录已废弃而递归删除。

## 一致性与失败语义

- 用户级 workspace row 必须携带稳定 `workspace_id`，不得用绝对路径、active project、
  resource URL 或 runtime token 充当身份。
- 项目事实先由 owning package 原子提交；projection 更新失败时标记 stale 并暴露 diagnostic，
  不回滚已成功项目写入，也不把旧 projection 当作成功结果。
- 数据库事务只保护同一 Store 内的原子更新。跨领域写入通过 application port 和显式 revision
  协调，不用一个大事务制造跨领域所有权。
- schema 使用单调版本和显式 migration。未知版本、损坏数据库或 migration 失败必须停止相关
  capability 并给出可操作诊断；不得静默创建空库掩盖有价值数据。
- “必须迁移”还表示数据是否必须通过重装、设备迁移、工作区复制或显式 export 独立转移；它与每个
  SQLite namespace 都必须执行的 schema migration 是两个维度。SQLite 本身不是便携数据协议。
- 可重建 projection 可以在确认来源仍完整后重建；用户数据、trust state、安装记录和领域事实
  不得按缓存处理。

## 生命周期与并发

Desktop Main 维护单一连接 owner 和有界 repository 接口。批量索引、FTS rebuild 和大型
migration 不阻塞 Electron event loop；使用 worker 或有界批处理，并支持取消与进度诊断。
窗口关闭只释放订阅，不关闭仍由应用拥有的 Store；应用退出按顺序停止 writer、checkpoint、
关闭连接并释放 watcher。

## 验证

- repository contract、事务、migration、损坏和 stale projection 使用聚焦测试；
- 项目写入与 projection 更新分别断言 owner 和失败路径；
- 多窗口订阅、应用退出和数据库占用使用真实 Electron 场景；
- fixture 必须使用隔离临时目录，不读取或改写真实用户数据库。

相关边界见 [`cache-file-access-and-paths.md`](cache-file-access-and-paths.md)、
[`asset-library.md`](asset-library.md)、[`unified-entity.md`](unified-entity.md) 和
[`application-composition.md`](application-composition.md)。
