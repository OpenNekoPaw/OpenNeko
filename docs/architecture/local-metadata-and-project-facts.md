# 本地元数据与项目事实边界

范围：Electron Desktop、本地 SQLite、项目文件、Agent、Assets、Entity、Search、任务投影和缓存索引。

Package-owned 项目 `.neko` 保存本机状态，产品 sync、package 和 enumerator 在遍历前必须排除该根目录；
用户级 SQLite 使用单一 `~/.neko/neko.db` authority。

## 决策

Desktop Main 是本地结构化元数据 Store 的唯一进程 owner。数据库位置由 Desktop path/config
service 解析，不写入项目文件，不向 preload 或 renderer 暴露绝对路径或数据库 handle。

SQLite 只保存本机结构化状态、可查询 catalog、账本和可重建 projection；它不是项目事实格式、
媒体容器或领域对象仓库。

持久数据准入必须按以下顺序 fail closed，不能按当前扩展名或目录猜测：

1. secret/credential 使用系统 credential store 或 safeStorage 加密 authority；
2. raw log/audit 使用用户区受控 JSONL/log 文件与 rotation/retention；
3. 用户需要查看、编辑、定位、导入导出或随工作区/设备转移的内容使用 owning domain
   的稳定 file/bundle；只有用户显式管理历史、发布、选择或回滚时才保留业务版本；
4. 大型媒体与 artifact bytes 使用 owning file/artifact store；
5. session scratch 留在 memory 或受控临时目录；
6. 可重建结构化 metadata 使用 `neko.db#cache`，只作为 projection；
7. 其余非 secret、machine-local、UI-managed application state 才可进入 `neko.db#state`。

机器契约记录 authority kind、user management、portability、sensitivity、SQLite role、deletion、
retention、backup 与离线恢复语义。未知分类、非 canonical SQLite path、raw-log table、普通 Store
中的 secret-like schema，以及 user-content SQLite authority 都是质量门禁失败。产品 runtime 只注册
canonical repository，不注册自动转换或修复路径；需要保护有价值数据时只能使用
显式授权、精确目标且产品不可达的离线工具。

| 数据                              | Canonical owner               | SQLite 角色                                                                |
| --------------------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| `.nk*`、Markdown、OTIO 等项目内容 | owning package 的项目文件     | 可选索引，不得反向覆盖项目事实                                             |
| Agent transcript                  | DSH Session JSONL             | OpenNeko Conversation catalog、binding 与运行恢复状态                      |
| Media Library 本机 binding        | Assets-owned `.neko` 本机物化 | 不进入 SQLite；不是项目事实，缺失时从当前 authority 确定性物化或保持未关联 |
| Media/Entity/Asset projection     | owning domain                 | 可查询 projection 与 freshness metadata                                    |
| 后台领域 Job                      | owning domain repository      | checkpoint、状态和恢复索引                                                 |
| 派生缓存                          | cache owner                   | locator、fingerprint、quota、GC eligibility                                |
| 凭据与 secret                     | Desktop credential store      | 不保存 secret；仅允许无敏感信息的 provider metadata                        |
| 窗口、选择、滚动和布局            | Desktop view-state owner      | 仅保存明确允许恢复的稳定展示状态                                           |

DSH Session transcript 保存在 Electron `userData/dsh/sessions`，由 DSH profile 直接拥有；OpenNeko
Conversation metadata、DSH Session binding 与 checkpoint 等 operational state 使用
`~/.neko/neko.db`，不得复制 transcript。Credential 不得进入 SQLite；Desktop 通过
safeStorage-backed secret port 持有。

## 工作区与用户区

工作区明确分为同步项目事实和可丢弃本机状态：

- `neko/project.json` 保存稳定项目/工作区身份和最小项目元数据；不得成为无 owner 的通用设置容器；
- owning domain 在 `neko/` 下保存自己的项目事实；
- 只有存在明确 review/edit/delete/sync 产品入口时，才创建可选的 `neko/memory.md`；
- package 可以在项目 `.neko/` 下保存当前 checkout 的本机 binding、presentation snapshot 与
  可丢弃 cache，但必须声明精确 owner、严格 codec、canonical 默认值、删除语义和局部 diagnostic；
- 删除整个项目 `.neko/` 必须只产生当前 canonical 本地初始状态，不得丢失、伪造或覆盖项目 identity、
  Entity/Character binding、领域版本、文档、Conversation、Task、WorldSave、Asset pin 或其他用户事实；
- 明确声明可重建的非 authoritative 本机 binding 只能从当前项目事实与当前本机 authority 确定性物化；
  cache、旧 record、managed link 或同名目录不得成为替代 authority，来源不唯一时保持未关联并显示 diagnostic；
- 项目 `.neko/` 不得成为通用 settings bag，不得与 `neko.db` 双写同一 authority，也不得保存 credential、
  物理媒体 target、绝对路径或不可重建的未提交创作事实；
- 产品自有 sync、package/export、Project file enumeration 和通用 Resource Browser 必须在遍历前排除
  根 `.neko/`，且不能只依赖 Git ignore 保证该边界。

用户级 catalog、运行恢复和任务状态按稳定项目 identity 进入 `neko.db#state`；Search、Media、Entity
等跨工作区可查询 projection 进入 `neko.db#cache`。只有生命周期明确跟随 checkout 的 package-owned
状态才进入项目 `.neko/`，同一 datum 不得同时进入两者。大型用户级派生字节位于
`~/.neko/cache/workspaces/<workspaceId>/`，Desktop/Workspace/Agent 原始日志位于
`~/.neko/logs/` 下按 owner identity 分区。物理 cache/log path 不进入项目事实。

`.neko/workspace.json` 不拥有项目 identity；项目 identity 始终来自 `neko/project.json`。未被当前
package 精确登记的 `.neko/config.toml`、`.neko/settings.local.json`、`.neko/preferences.md`、
`.neko/memory.md`、`.neko/logs`、`.neko/.cache` 和未知文件不进入正常产品读取路径，必须原样保留；
不得因为 `.neko` 可重新初始化而递归删除、解释或自动转换未知字节。

## 一致性与失败语义

- 用户级 workspace row 必须携带稳定 `workspace_id`，不得用绝对路径、active project、
  resource URL 或 runtime token 充当身份。
- 项目事实先由 owning package 原子提交；projection 更新失败时标记 stale 并暴露 diagnostic，
  不回滚已成功项目写入，也不把 stale projection 当作成功结果。
- 数据库事务只保护同一 Store 内的原子更新。跨领域写入通过 application port、精确 operation/request
  identity 和各 owner 的串行化协调，不用一个大事务制造跨领域所有权，也不用 revision/CAS
  维持共享可变 authority。
- Project Entity candidate confirmation 先由 owning package 原子提交 canonical 项目事实，再独立更新
  rebuildable projection；任一步失败都保留精确 diagnostic，不创建产品可达的 recovery journal、
  自动恢复或第二 authority。
- SQLite 使用稳定表和 additive nullable column。初始化只创建缺失表；现有 authority row 只更新
  canonical owned columns，并保留未知 column。未知字段不得选择 parser、schema generation、兼容或
  repair 路径。
- 数据是否需要通过重装、设备转移、工作区复制或显式 export 独立转移，是 portability 决策，不等同于
  SQLite schema migration。SQLite 本身不是便携数据协议。
- 可重建 projection 可以在确认来源仍完整后重建；用户数据、trust state、安装记录和领域事实
  不得按缓存处理。

## 生命周期与并发

Desktop Main 维护单一连接 owner 和有界 repository 接口。批量索引、FTS rebuild 和大型
projection refresh 不阻塞 Electron event loop；使用 worker 或有界批处理，并支持取消与进度诊断。
窗口关闭只释放订阅，不关闭仍由应用拥有的 Store；应用退出按顺序停止 writer、checkpoint、
关闭连接并释放 watcher。

## 验证

- repository contract、稳定表初始化、事务、损坏记录局部失败和 stale projection 使用聚焦测试；
- reachability 测试证明产品启动、public entry、build 和普通 tests 只使用 canonical repositories；
- 项目写入与 projection 更新分别断言 owner 和失败路径；
- 多窗口订阅、应用退出和数据库占用使用真实 Electron 场景；
- fixture 必须使用隔离临时目录，不读取或改写真实用户数据库。

相关边界见 [`content-access-and-paths.md`](content-access-and-paths.md)、
[`asset-library.md`](asset-library.md)、[`unified-entity.md`](unified-entity.md) 和
[`application-composition.md`](application-composition.md)。
