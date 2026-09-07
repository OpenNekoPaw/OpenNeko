# World 领域

World 是工作区世界、全局世界与不可变领域版本、World Run/Save/branch 和世界交互投影的 owner。host-neutral
domain/application 位于 `packages/world`，本地持久化和 ZIP adapter 位于 `packages/world/node`，browser-only
管理、创作与运行视图位于 `packages/world/webview`。

## 管理、创作与互动

- 全局管理只展示 `GlobalWorld`、当前版本和历史 `WorldVersion`，不区分草稿、发布、安装或适配状态。
- Project Creative Workspace 中的新世界从首次 durable commit 起属于一个精确 Project，可编辑并可同步到全局。
- 工作区可以加入全局 `WorldVersion` 的只读精确引用；编辑时必须复制为新的本地世界。
- Agent 世界 Tool 只在绑定精确 Project 和既有 fresh WorldProject 时查询或填充草稿；Assistant Conversation 不直接创建全局世界。
- 全局首版必须由 World global catalog service 的显式 command 提交；工作区同步和 `.neko-world` 导入是与现有 Desktop authority 对齐的入口。
- 当前 Desktop consumer 是只消费精确全局版本的确定性 Foundation Runtime；Story、Gameplay、Agent Play、实时生成和外部引擎不属于当前 World Runtime contract。

## 核心模型

```text
Project Workspace WorldProject
  -> editable WorldDefinition
  -> immutable local WorldVersion
  -> optional synchronization link to GlobalWorld

GlobalWorld
  -> immutable WorldVersion history
  -> exact currentWorldVersionId for management display

WorldVersion
  -> WorldRun
  -> WorldSave + branch
```

全局 current 只用于默认管理展示。Project、World Run 和 Save 必须保存精确 `worldVersionId`，不得在使用时
解析 latest/current/name。同步创建新版本，不覆盖历史，也不自动更新任何既有引用。

## ZIP 导入导出

`.neko-world` ZIP 只包含一个用户选择的不可变世界版本和必要资源。导入经 Host 文件授权和 Node archive
安全校验后直接原子提交全局目录；更新已有对象时必须确认精确 `globalWorldId` 和当前版本。ZIP 不创建安装、
适配、恢复、Project membership、Run 或 Save，也不成为持久 identity、runtime authority 或 watcher。

详细边界见 [`architecture.md`](architecture.md) 和
[`../../architecture/package-boundaries.md`](../../architecture/package-boundaries.md)。
