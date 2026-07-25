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

## 项目证据链路

角色项目证据沿唯一 canonical path 装配：

1. Entity 通过稳定 `CreativeEntityRef` 提供 canonical name、display name 和 aliases，不负责角色问题检索或 prompt 组装。
2. Chara 分别以非空角色名称和别名调用 Project Search，并按稳定 Search item ID 去重。当前回合问题和内部 Entity ID 不得进入 `story-symbols` 查询。
3. Search 只返回项目内场景或角色 locator；其全局 token 匹配语义不因角色场景而改变，也不负责索引完整对白正文。
4. Chara Host 校验 locator 的项目边界和受支持扩展名，通过 Content/VS Code 文件边界读取场景正文。
5. Chara Core 按当前回合问题、角色身份、来源权威性、新鲜度和预算排序、去重并裁剪正文。
6. Character session 只把最终 evidence bundle 注入当前 responder system prompt，不把证据写入 transcript 或持久 profile source。

Profile Assembly 与 Character Dialogue/Embody 的单轮证据加载复用同一 Chara Host adapter。不得恢复 Dashboard evidence reader、宽泛 workspace 搜索、Agent memory 或模型常识 fallback。Search 成功但没有角色场景是合法空证据；Entity/Search 等必需依赖失败必须终止当前启动或回合，并且不得调用 responder。

角色模型选择与证据检索是两条独立契约。角色用途使用全局 `character.dialogue` / `character.profile` 精确绑定；Chara 不复制 Agent 会话级模型切换状态，也不在绑定或证据失败时回退 Agent/default model。

## 错误与演进边界

- 缺失 workspace、Entity identity、证据或非法 session 必须返回明确 diagnostic。
- 旧 Entity Character runtime 和 Agent-owned controller 已删除，不提供 compatibility re-export。
- 跨包 `Npc*` DTO 与 Agent Webview 角色投影暂时保留在共享 contract/Chat shell；Chara 是语义 owner，后续迁移必须单独设计 wire/persistence 兼容。
- CharacterProject/CharacterVersion、发布、持久恢复和独立 Webview 未实现时必须 fail-visible。
