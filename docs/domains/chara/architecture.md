# Chara 领域架构

## Owner

`@neko/chara` 是当前角色对话、Embody、角色证据、Profile Assembly、角色 purpose operation 和角色会话编排的唯一 owner。`@neko/entity` 只提供通用 Entity 事实、关系、occurrence、representation 和稳定 ref；`neko-agent` 只提供 Pi runtime、Agent contract、Chat transport 与宿主组合。

## 分层与依赖

```text
@neko/chara/core
  -> shared Character/Entity value contracts

@neko/chara/application
  -> chara/core
  -> shared purpose runtime contract

@neko/chara/host-vscode
  -> chara/application + chara/core
  -> public Entity/Content/Search host adapters
  -> @neko-agent/types
  -> vscode

Agent Extension ChatProvider
  -> @neko/chara/host-vscode
```

Core/Application 不导入 VS Code、React、Agent runtime implementation 或其他领域的 Host implementation。Chara 只能消费 Agent contract，不创建 `RoleplayAgent`、`CharacterAgentExecutor` 或第二套 Tool/Task/Session loop。Agent core/platform/Webview 不反向依赖 Chara；VS Code 产品组合层负责实例化 Chara host adapter。

## 生命周期

当前每个角色会话由 Chara controller 创建、保存和释放，操作携带显式 session/entity/project identity。Agent Chat shell 只路由输入并展示不可变投影，不拥有角色 session。关闭、退出与取消必须命中 Chara session owner；不得回退 active tab 推断身份。

未来 CharacterRun 应继续由 Chara application service 拥有，并注入唯一 Pi AgentSession。World 只能通过已发布 CharacterVersion 和窄 action/environment port 组合角色，不能创建平行 actor-level Agent loop。

## 错误与演进边界

- 缺失 workspace、Entity identity、证据或非法 session 必须返回明确 diagnostic。
- 旧 Entity Character runtime 和 Agent-owned controller 已删除，不提供 compatibility re-export。
- 跨包 `Npc*` DTO 与 Agent Webview 角色投影暂时保留在共享 contract/Chat shell；Chara 是语义 owner，后续迁移必须单独设计 wire/persistence 兼容。
- CharacterProject/CharacterVersion、发布、持久恢复和独立 Webview 未实现时必须 fail-visible。
