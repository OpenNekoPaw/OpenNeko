## Why

Extension 与 TUI 的实际 Agent system prompt 都由 `SystemPromptBuilder` 产生，再由 Pi runtime 组合 Skill catalog/显式 Skill invocation。仓库同时公开 `SystemPromptComposer`、`ModuleOrchestrator`、`PromptModuleRegistry`、`PromptSectionCache`、六个 projection module，以及 Agent/Platform 两个 `PromptManager`。这些结构没有生产调用方，只在自己的单元测试中形成一条完整但不可达的平行路径。

这条平行路径把稳定的本地产品问题建模成可注册 module graph、layer budget、cache 和 template registry，扩大公共 API、测试量和维护成本，也让文档与 Evaluation 误以为 Composer 是运行时权威。P1 必须以真实 Builder/Pi 路径为基线删除这些表面，而不是保留 compatibility adapter。

## What Changes

- **BREAKING**：删除 Agent `SystemPromptComposer`、`ModuleOrchestrator`、`PromptModuleRegistry`、`PromptSectionCache`、module manifest/context、无生产消费者的 projection modules 及其专属测试。
- **BREAKING**：删除 Agent 与 Platform 的两个通用 `PromptManager`、`Platform.prompts` 和 Extension 中没有调用方的 Platform prompt bridge 方法。
- 保留 `SystemPromptBuilder`、builtin prompts、AGENTS.md host loading、prompt file projector/runtime，作为 Extension/TUI 的唯一 base prompt 路径。
- 保留 Pi runtime 对 Skill catalog 和显式 Skill invocation 的 owning composition，不把 Skill/tool/capability schema 迁回 Builder。
- 将 secret-free prompt composition evidence contract 从 Composer 私有 types 中独立出来，并只从真实 Builder/Pi path 产生。
- 增加 source-absence 门禁，禁止删除后的 framework、manager、module 和 Platform prompt surface 返回。
- 更新 `agent-runtime.prompt-composition` Evaluation 的 owning decision，证明 base、AGENTS.md、Skill composition 走真实 TUI Pi session，且旧 Composer/PromptManager 不参与。

## Capabilities

### New Capabilities

- `agent-prompt-builder-authority`: Extension/TUI 只通过 SystemPromptBuilder 选择 base/environment prompt，并由 Pi runtime 组合实际 Skill/capability context。

### Modified Capabilities

- `pi-agent-runtime`: prompt composition evidence 必须来自真实 session 输入和 Pi Skill path，不得来自未参与执行的 Composer projection。

## Impact

- Agent prompt package public exports、dead framework/tests 和 architecture source-absence rules。
- Platform public `Platform` contract 与 Extension `SystemPromptManager`。
- TUI prompt assembly/debug facts 和 `agent-runtime.prompt-composition` Evaluation。
- 不改变 builtin prompt 正文、Skill 内容、tool schema、provider routing 或 capability provider 动态注册。
