# Proposal: 归档 DSH 会话并移除删除能力

## Why

当前 Desktop 暴露“删除会话”命令，但锁定的 DSH runtime 没有公开 Session delete seam，命令只能失败并保留数据。DSH Workspace 已提供 durable `archiveSession`，其语义是隐藏 Session、保留日志和 Workspace 记账。产品应只暴露真实可成功的归档能力，不应继续发布无法完成的删除 contract。

## What Changes

- 在 OpenNeko DSH profile 中装配官方 storage-domain 与 workspace service，并由 DSH Workspace registry 持有唯一归档事实。
- 在 OpenNeko ACP bridge 中增加严格的归档命令与归档集合读取投影；不实现、广告或兼容 `session/delete`。
- `@neko/agent-runtime` 按 exact Conversation↔DSH Session binding 执行归档，并从 DSH 归档集合重建 Home 投影。
- 用户显式归档时，若 DSH authoritative `session/list` 已确认精确绑定的 Session 不存在，则将该记录视为旧数据孤儿，并在一个 SQLite 事务中 CAS 清理 catalog、context 与 binding；不得调用 DSH archive 或只做 Renderer 隐藏。
- 将 Host contract、Electron IPC、preload、Renderer 操作和文案从删除原子替换为归档；移除旧删除 channel、方法、测试和 UI 入口。
- 对有效 DSH Session，保留 OpenNeko SQLite catalog、context、binding 以及 DSH Session 日志；归档不清理用户数据，也不停止受保护后台运行。只有不存在 DSH Session 的显式 stale 旧记录清理例外。

## Impact

- Owner：DSH Workspace registry 拥有归档事实；`@neko/agent-runtime` 拥有 Conversation 归档编排；`@neko/host` 拥有 Desktop typed command；Desktop Main/preload/Renderer 仅负责 sender-bound wiring 与产品 UI。
- Affected packages：`@neko/dsh-bridge`、`@neko/agent-contracts`、`@neko/agent-runtime`、`@neko/host`、`apps/neko-desktop`、DSH runtime closure scripts。
- User data：有效 Session、日志、catalog、context 与 binding 均保留；只改变普通 Home/侧栏投影的可见性。DSH 已不存在的 stale 旧记录在用户显式归档时原子清理，且不影响 sibling Conversation。
