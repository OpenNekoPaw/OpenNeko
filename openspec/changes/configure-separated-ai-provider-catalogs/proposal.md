## Why

Desktop Settings 已分为 DSH 对话 Provider 与生成 Provider，但新增表单仍只表达对话协议。
因此 MiniMax H3、ByteDance Seedance 等原生生成 Provider 会被错误保存为 `generic`，并且用户无法
从应用已验证的 Provider/模型目录开始配置。

## What Changes

- 为对话与生成目录分别提供内置 Provider 预置；预置填充官方 API 地址、精确 Provider type、
  对话协议、鉴权要求和应用支持的模型模板。
- Settings contract 投影并保存精确 Provider type；生成 Provider 不再伪造 DSH 对话协议。
- 对话新增流程只展示 DSH 可表达的协议预置，生成新增流程只展示 GenerationJob 可执行的
  Provider 预置。
- 模型新增表单可以从当前 Provider 的内置模型模板填充 API model name、类型和能力；自定义模型
  仍受当前 Provider family/type 严格校验。
- 保存后重新加载所有已创建的 application/workspace ConfigManager；对话目录继续使用现有 DSH
  `applied`/`pending` 安全刷新，生成配置只影响后续 GenerationJob。

## Capabilities

### New Capabilities

- `desktop-separated-ai-provider-catalogs`: 分区 Provider 预置、精确类型和模型模板管理。

## Impact

- `@neko/host/ai-model-settings` 拥有 renderer-safe Provider preset/model template contract；
  `@neko/host/settings` 继续拥有唯一 ProviderConfig、ModelConfig、default ref 与 credential authority。
- Desktop Renderer 只选择预置、编辑非 secret 字段并提交 typed request，不拥有 Adapter 路由。
- DSH 只消费 dialogue/LLM 投影；GenerationJob 继续消费 generation/media 绑定，不新增平行执行路径。
- 不修改已有 Job、产物或用户 Workspace facts；当前配置使用同一 canonical shape 原子更新。

## Out of Scope

- MiniMax `/v1/models`、ByteDance account activation 等在线账号模型发现。
- 运行中外部 GenerationJob 的 Provider endpoint/model execution snapshot 冻结与删除保护。
- 新的 3D 模型类型或未知协议 Adapter。
