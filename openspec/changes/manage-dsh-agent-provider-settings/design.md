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

### 5. Provider-scoped 渐进式编辑

Agent 设置页直接展示按能力分组的 Provider 目录与新增入口，不再使用额外的 Provider 汇总卡片、展开按钮或外层管理容器。Provider 列表负责选择配置单元；选中后才在同一局部编辑面板中展示凭据、按需展开的协议/API 地址，以及仅属于该 Provider 的对话和生成模型。模型新增、默认用途切换仍调用现有 model settings service，不建立 Renderer catalog、批量草稿 authority 或平行保存路径。自定义 Provider 先保存为 canonical Provider，随后从该 Provider 编辑面板增加模型。

Agent 配置文件入口直接位于 Agent 标题右侧，不再用单独的“高级设置”内容行重复表达。Provider 的能力分类由其 canonical 模型目录派生，不增加互斥的 `providerType` 或第二份分类 authority。纯对话与纯生成 Provider 在宽布局中左右分组，窄布局恢复为单列；同时拥有两类模型的 Provider 进入单独的多能力分组且只显示一次；尚无模型的 Provider 保留待配置分组，避免伪造用途。选中 Provider 后，其对话与生成模型仍按相同规则左右并列。

## Runtime Boundary

- Owner: `@neko/host/settings` and model-settings service.
- Producer: ConfigManager + ProviderCredentialAuthority projection.
- Consumer: Settings overlay; DSH startup profile materializer.
- Canonical path: Renderer → typed preload IPC → service → TOML/credential authority → DSH startup projection.
- Replaced path: advanced config stops being the only UI entry but remains the same canonical file.
- User-data impact: explicit config/secret updates only; no transcript/session mutation.
