## Why

Agent 设置当前只能打开高级配置文件，无法安全查看和管理 DSH 实际使用的 Provider、对话模型与默认用途。

## What Changes

- 在 Settings 中投影现有 canonical `~/.neko/config.toml` Provider、LLM 模型和默认对话模型。
- 支持新增/编辑 DSH 可表达的 Provider、写入 API Key、添加 LLM 模型并选择新会话默认模型。
- API Key 只通过 typed IPC 交给既有 `ProviderCredentialAuthority`；projection 和响应不包含 secret。
- 保留“打开高级配置”，不建立 `models.json` 或其他平行配置路径。
- 明确 Provider catalog 在启动时物化：新增或结构修改后提示重启，运行中会话不被改写。
- 将 canonical `ollama` 本地 Provider 投影到同一设置目录，并以连接来源标识“本地/云端”；能力分组仍只由模型类型派生。
- 支持删除配置文件中的 Provider 和模型；默认模型与仍拥有模型的 Provider 必须 fail-visible 拒绝删除。Provider 是否可删除不得由 TOML 中的展示/预置元数据决定。

## Capabilities

### New Capabilities

- `desktop-dsh-provider-settings`: DSH Provider、LLM model 与新会话默认模型的安全管理。

## Impact

- `@neko/host/settings` 继续拥有唯一 TOML config authority。
- `@neko/host` 新增 host-neutral model-settings application service，复用 `ConfigManager` 与 credential authority。
- Desktop Main/preload 只负责 sender-bound IPC wiring；Renderer 不读取 credential store。
- DSH profile materializer 仍是唯一运行时 provider/model 投影路径。
- Ollama 通过其 OpenAI-compatible 本地执行端点进入同一 DSH profile materializer，不增加第二套本地模型 registry。
