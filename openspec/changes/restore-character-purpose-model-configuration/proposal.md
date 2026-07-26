## Why

`@neko/chara` 重构后，Character Dialogue 正确改为调用显式
`character.dialogue` purpose，但现有用户配置通常只有普通 Agent LLM 默认值，产品也没有在角色
会话路径中提供 purpose binding 的配置入口。角色 tab 因而可以启动，却在第一轮回复时以
`No explicit model binding is configured for character.dialogue` 失败。

## What Changes

- 在角色会话启动和继续执行前检查 `character.dialogue` 与
  `character.profile` 的显式模型绑定。
- 缺少绑定时，由 VS Code Host 显示一次明确的兼容 LLM 选择，并将用户选择分别写入扁平
  `default_model_purposes` 配置。
- 角色会话取消模型选择时不创建或继续运行，并返回可见 diagnostic；不得回退到
  `agent.main`、`default_models.llm`、首个兼容模型或旧 Platform chat 路径。
- 保持 Character session/profile/prompt 由 Chara 拥有，模型目录、校验、配置持久化和 Pi
  runtime 由 Agent Host/Platform 拥有；不在 Chara 或 Webview 中复制 provider routing。
- 补充配置写入、Host composition、Chara 调用路径和禁止 fallback 的回归测试，并记录
  Character role-session real Evaluation 的现有运行入口阻塞。

## Capabilities

### New Capabilities

- `character-purpose-model-configuration`: 角色会话在使用模型前通过用户明确选择建立、验证并持久化独立 purpose bindings。

### Modified Capabilities

## Impact

- `packages/neko-agent/packages/platform`: 增加受验证的 purpose binding 写入契约。
- `packages/neko-agent/packages/extension`: 组合角色模型准备端口、VS Code 模型选择和配置持久化。
- `packages/neko-chara`: 在角色 session 启动/继续边界调用注入的模型准备端口。
- `packages/neko-agent/packages/agent-types` / Webview wire contract 不新增角色模型选择消息。
- `~/.neko/config.toml`: 仅在用户从 VS Code Quick Pick 明确选择后写入
  `default_model_purposes.character_dialogue` 与
  `default_model_purposes.character_profile`；已有有效绑定保持不变。
