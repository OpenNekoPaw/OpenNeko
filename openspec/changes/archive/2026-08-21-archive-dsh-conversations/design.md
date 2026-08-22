# Design: DSH-owned Conversation archive

## 五层分析

1. 职责：DSH Workspace registry 决定 durable Session archive；Agent runtime 将产品 Conversation 精确绑定到该 Session；Host 与 Desktop 只投影命令和可见列表。
2. 依赖：归档规则只依赖 binding store 与 ACP client，不依赖 Electron，因此位于 `@neko/agent-runtime`。Desktop Main 只校验 sender/window/renderer session。
3. 接口：DSH bridge 暴露 `archive` 与 `archive/read` 两个严格 extension method；Agent application 暴露 `archiveConversation`；Host contract 暴露唯一 archive command。
4. 扩展：上游未来提供 unarchive 或标准 ACP archive 时，应通过独立 OpenSpec 原子替换当前 extension，不保留平行路径。永久删除不是 archive 的扩展分支。
5. 测试：bridge contract/unit test 证明 DSH owner 命中；Agent application test 证明 exact binding 与 Home 过滤；Host/Main/preload/Renderer test 证明 sender-bound route 与旧 delete path 不可达；真实 Desktop 验证用户操作。

## Canonical path

```text
OpenNeko UI archive action
  -> preload conversations.archive / projects.archiveConversations
  -> sender-bound Electron IPC
  -> @neko/host DesktopProjectRegistrationService
  -> @neko/agent-runtime ConversationDshSessionArchival
  -> exact Conversation↔DSH Session binding
  -> OpenNeko ACP extension
  -> ctx.workspaceRegistry.archiveSession(dshSessionId)
  -> DSH durable archivedSessionIds
  -> archive/read projection
  -> Agent Home filters matching catalog records
```

当 exact binding 在 DSH `session/list` 中已不存在时，同一用户命令进入唯一的 stale cleanup 终态：

```text
exact stored binding
  -> DSH session/list confirms Session absent
  -> SQLite compare-and-delete exact binding + catalog + context in one transaction
  -> Agent Home refresh
```

这不是第二条有效归档路径：它只处理 authoritative DSH Session 已不存在的孤儿记录，不能用于可解析 Session、DSH archive failure、missing/cross binding 或并发改变后的 binding。

## Runtime composition

`@neko/dsh-bridge/cordis.patch.yml` 在 base rows 之后插入官方 `@deepseek-ai/dsh-storage`、`@deepseek-ai/dsh-storage-json`、`@deepseek-ai/dsh-storage-domain` 与 `@deepseek-ai/dsh-workspace`。Bridge 将 `workspaceRegistry` 声明为 mandatory injection；缺失时 profile 启动失败，不返回伪成功。

OpenNeko 不引入 DSH Web client/runtime。Bridge 只调用公开 Workspace service，并将 archive set 投影为 bounded、唯一、严格字符串集合。

## Data and failure semantics

- DSH `archivedSessionIds` 是唯一 durable archive authority。
- OpenNeko SQLite catalog/context/binding 继续保存 Conversation 产品事实，不新增 archive 列、不删除记录、不执行 dual-write。
- Home projection 每次 refresh 读取当前 DSH archive set，再按 exact binding 过滤；读取失败使 refresh fail-visible，并保留上一份 presentation snapshot，不把空集合当成功。
- 已归档 Session 的重复归档由 DSH 幂等完成。
- 用户显式归档精确 stale binding 时，Agent metadata owner 在一个 `state-write` 事务内按 Conversation/DSH Session 双 identity 删除 binding、catalog 与 context；任一行缺失或变化使事务回滚并 fail-visible。
- 未知 Conversation、missing/cross binding、DSH archive/storage failure 或 stale cleanup CAS 冲突只拒绝当前命令；sibling Conversation 保持可用。
- 归档不等于 close/cancel/delete，不改变后台 task/runtime ownership。

## Replaced path

删除 `conversationDelete`、`projectConversationDelete`、`conversations.delete`、`projects.deleteConversations`、`releasePublishedConversation` 的删除语义及所有“永久删除”UI。不得保留别名、兼容 handler、raw Session 文件删除或对有效 DSH Session 的 SQLite catalog 删除；显式 stale 旧记录清理必须经过 DSH absence proof 与 exact CAS。

## Evaluation disposition

AgentSession lifecycle 与 Desktop projection 发生变化，选择 `extend` 现有隔离的 `desktop-project-sidebar-management` 可见 Desktop case；canonical evidence 是 exact archive command、DSH archive projection 与 Home 中目标 Conversation 消失，forbidden fallback 是 catalog/binding/Session 文件删除、close 冒充 archive 或旧 delete channel。归档命令不调用 Provider/模型，DSH Q0 负责真实 profile 的幂等与重启恢复证据；可见 Desktop fixture 无法启动时保留明确 infrastructure blocker，deterministic contract tests 仍为硬门禁。
