## Context

当前 UI 已按 `dialogue`/`generation` 分组，但 `save-provider` 要求一个 DSH protocol，Host service
再从该 protocol 推断 Provider type。该推断对原生生成 API 不成立。已有 `ProviderConfig.type` 是
Adapter 选择的 authoritative identity，`supportedModelFamilies` 是产品管理分区，二者不应再由 URL
或 Renderer 文案推断。

五层分析：

- 职责：Host settings 拥有用户 Provider/model 配置与可选择的产品预置；DSH 和 Generation 分别拥有
  对话与生成执行生命周期。
- 依赖：预置是 renderer-safe 静态 contract，不依赖 Electron、DSH 私有模块或 Node 网络能力。
- 接口：保存请求携带精确 type 和可选 dialogue protocol；生成 Provider 无 dialogue protocol。
- 扩展：增加下一个已适配 Provider 只增加一个预置和模型模板，不修改 Renderer 条件路由。
- 测试：contract/service 测试证明 family/type/protocol 精确匹配；Renderer 测试证明两个新增入口只
  展示各自预置；DSH/Generation 路径测试证明不存在跨 family fallback。

## Decisions

### 1. Provider preset 是产品目录，不是用户 Provider 记录

内置 preset 由 `@neko/host/ai-model-settings` 暴露。只有用户保存后才创建 ProviderConfig；不得在默认
配置中为所有厂商持久化禁用记录。Preset 可以提供 suggested id、display name、default API URL、
Provider type、connection kind、credential requirement、可选 DSH protocol 与 model templates。

### 2. 对话与生成分别管理

`dialogue` preset 必须能被当前 DSH provider projection 表达，并且只允许 LLM model。
`generation` preset 必须由当前 generation execution stack 精确支持，并且只允许 image/video/audio。
同一外部服务可以有两个逻辑 Provider 配置；相同 URL 不合并它们的运行生命周期。

### 3. Type 是 authoritative，URL 不参与推断

新 Provider 使用 preset 的 exact type。用户可以修改 API URL，但 type 不变；已创建 Provider 不允许
通过设置表单改变 type。MiniMax/ByteDance generation Provider 不携带伪造的 OpenAI/Anthropic
dialogue protocol。

### 4. 内置模型模板只声明已适配能力

模板提供 exact API model name、ModelType 和 capabilities。MiniMax 当前只允许模板中的
`MiniMax-H3`；ByteDance 当前只允许模板中的已验证 Seedance identity。未来新增模型必须先进入
provider catalog 并声明已适配能力，不根据远端返回值自动授予执行能力。

在线模型发现只说明 endpoint/account availability，不能成为应用执行支持的 authority，因此后续以
独立 provider-specific external discovery port 设计。

### 5. 配置刷新保持两个 runtime owner

配置 mutation 后，WorkspaceConfigManagerAuthority 重新加载所有已实例化 ConfigManager。若 mutation
影响执行配置，现有 Desktop Host 继续请求 DSH refresh：活动 turn 时为 `pending`，空闲时为
`applied`。Generation runtime 不重启；之后提交的 Job 从 reload 后的 ConfigManager 解析，已有 Job
不被重写。

## Runtime Boundary

- Owner: `@neko/host/settings` Provider/model configuration and preset catalog.
- Package role: host-neutral L1 application configuration.
- Canonical public entry: `@neko/host/ai-model-settings` and `@neko/host/settings`.
- Producer: Desktop Settings typed requests.
- Consumers: Desktop DSH provider projection and Generation purpose/model resolver.
- Runtime boundary: Renderer -> typed preload/Main -> Host settings; DSH subprocess and external generation
  APIs remain downstream execution boundaries.
- Replaced path: protocol-to-type inference for new generation Provider.
- User-data impact: exact ProviderConfig/ModelConfig edits only; no migration, fallback or hidden default records.

## Agent Evaluation

- Disposition: `reuse` existing `agent-runtime.model-binding` coverage for exact dialogue Provider/model
  selection and `agent-runtime.creative-media-workflow` for purpose-qualified generation binding.
- Canonical positive evidence: selected product provider/model maps to the exact DSH API model or exact
  GenerationJob provider/model.
- Forbidden fallback: a MiniMax/ByteDance generation preset must never register as a DSH chat Provider or
  execute through `generic`; an unavailable exact model must not select another Provider.
- Real provider execution is required for behavior acceptance when credentials and explicit paid-use authority
  are available; deterministic settings tests are not represented as real API evidence.
