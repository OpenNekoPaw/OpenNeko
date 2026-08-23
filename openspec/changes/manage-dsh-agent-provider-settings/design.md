## Context

DSH profile 在 Desktop 启动时由 `ConfigManager` 的 Provider/LLM Model 与 `ProviderCredentialAuthority` 物化。设置必须修改该 authority，而不是建立 UI-owned Provider catalog。

五层分析：Host settings owner 决定配置结果；credential authority 决定密钥；Main 仅 IPC；Renderer 仅 transient form。依赖由 service 注入已有 managers。接口为严格 projection/mutation contract。扩展受限于 DSH 已支持的协议映射。测试证明唯一 TOML/credential/DSH 路径并禁止 secret projection。

## Decisions

### 1. 单一 canonical config

Provider 和模型通过 `ConfigManager` 写入 `~/.neko/config.toml`。不创建 `models.json`、Renderer store 或第二个 provider registry。

### 2. Secret 只进入 credential authority

Renderer 可在一次表单提交中携带用户输入的 API Key，但不得读取现有 key；Main/service 将其交给 `ProviderCredentialAuthority.replaceApiKey`，响应只返回 configured/missing 状态。

### 3. 只暴露 DSH 可运行协议

首批表单支持 OpenAI Chat-compatible、OpenAI Responses 与 Anthropic Messages。非法 Provider/Model 被 owning service 明确拒绝，不 fallback 到其他 Provider。

### 4. 新增配置的运行语义

TOML 写入立即成为 authority；DSH catalog 的结构变更需要重启后重新物化。默认 LLM 只用于新会话，既有 session identity、queue 和运行模型不被静默修改。

## Runtime Boundary

- Owner: `@neko/host/settings` and model-settings service.
- Producer: ConfigManager + ProviderCredentialAuthority projection.
- Consumer: Settings overlay; DSH startup profile materializer.
- Canonical path: Renderer → typed preload IPC → service → TOML/credential authority → DSH startup projection.
- Replaced path: advanced config stops being the only UI entry but remains the same canonical file.
- User-data impact: explicit config/secret updates only; no transcript/session mutation.
