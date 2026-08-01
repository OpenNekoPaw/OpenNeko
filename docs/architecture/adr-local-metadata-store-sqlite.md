# ADR: Desktop 本地元数据 Store 与项目事实边界

状态：Accepted

更新日期：2026-08-01

范围：Electron Desktop、本地 SQLite、项目文件、Agent、Assets、Entity、Search、任务投影和缓存索引。

## 决策

Desktop Main 是本地结构化元数据 Store 的唯一进程 owner。数据库位置由 Desktop path/config
service 解析，不写入项目文件，不向 preload 或 renderer 暴露绝对路径或数据库 handle。

SQLite 只保存本机结构化状态、可查询 catalog、账本和可重建 projection；它不是项目事实格式、
媒体容器或领域对象仓库。

| 数据 | Canonical owner | SQLite 角色 |
| --- | --- | --- |
| `.nk*`、Markdown、OTIO 等项目内容 | owning package 的项目文件 | 可选索引，不得反向覆盖项目事实 |
| Agent transcript/journal | Agent conversation repository | catalog、查询和恢复所需的结构化投影 |
| Media Library link、Entity/Asset projection | owning domain | 可查询 projection 与 freshness metadata |
| 后台领域 Job | owning domain repository | checkpoint、状态和恢复索引 |
| 派生缓存 | cache owner | locator、fingerprint、quota、GC eligibility |
| 凭据与 secret | Desktop credential store | 不保存 secret；仅允许无敏感信息的 provider metadata |
| 窗口、选择、滚动和布局 | Desktop view-state owner | 仅保存明确允许恢复的版本化展示状态 |

## 一致性与失败语义

- 用户级 workspace row 必须携带稳定 `workspace_id`，不得用绝对路径、active project、
  resource URL 或 runtime token 充当身份。
- 项目事实先由 owning package 原子提交；projection 更新失败时标记 stale 并暴露 diagnostic，
  不回滚已成功项目写入，也不把旧 projection 当作成功结果。
- 数据库事务只保护同一 Store 内的原子更新。跨领域写入通过 application port 和显式 revision
  协调，不用一个大事务制造跨领域所有权。
- schema 使用单调版本和显式 migration。未知版本、损坏数据库或 migration 失败必须停止相关
  capability 并给出可操作诊断；不得静默创建空库掩盖有价值数据。
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
