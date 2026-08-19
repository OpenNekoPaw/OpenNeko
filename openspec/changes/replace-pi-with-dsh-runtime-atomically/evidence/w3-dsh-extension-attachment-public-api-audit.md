# W3 DSH Extension And Attachment Public API Audit

审计日期：2026-08-20

审计对象是产品锁定的 DSH `0.1.0-rc.7` 与 ACP SDK `0.25.1` 公开 package surface。本文只记录当前能力和阻塞项，不把 `node_modules` 私有实现、旧 OpenNeko runtime 或设计推测当作可用 API。

## 结论

- 产品扩展管理只向用户展示 Skill 与 MCP。DSH Plugin 是官方 profile 的内部装配单元，不是用户安装或配置的扩展类型。
- `computer-use` 与 `browser-use` 作为官方维护的 DSH MCP contribution 交付。OS 权限、目标选择和 sender-bound grant 仍由 OpenNeko Host 拥有；MCP connection、Tool discovery 和 Agent invocation 必须发生在 DSH 子进程内。
- Generation、Canvas、Cut、Assets、Character 与 World 是 first-party DSH Tools，不包装成 MCP。
- `@deepseek-ai/dsh-skill` 已提供 `snapshot/list/get`、provider registration、`userInvocable`/`modelInvocable` policy 与 `skills/change`。Skill inventory 和调用可以基于公开 API实现。
- `@deepseek-ai/dsh-host-plugin-inventory` 只提供 Loader 条目的只读瞬时快照，不提供来源、MCP catalog、配置、启停命令或失败历史，不能直接满足产品管理面 contract。
- `@deepseek-ai/dsh-settings` 提供 namespace schema、resolved/base/user value、revision、`mutate` 和 change event；但其文档明确说明当前 `redactSecrets` 无法对 union/intersection/transform 和 secret default 构成 fail-closed wire boundary。Desktop 不得直接暴露其 descriptor，必须等待可证明安全的公开 wire API，或只为经过静态资格验证、无 secret 的官方 namespace 建立精确 bridge contract。
- 当前发行闭包没有公开的 `@deepseek-ai/dsh-mcp` package。DSH 文档要求“每个 MCP server 使用一个插件并向 `ctx.tools` 注册发现的 Tool”。因此 MCP consumer 必须作为产品内官方 DSH plugin/profile contribution 实现或采用后续上游公开包；不得在 Desktop/Host 恢复 MCP Manager。
- ACP `0.25.1` 的 Prompt 支持 text、image、audio、resource link 和 embedded resource，并通过 prompt capabilities 协商 image/audio/embedded context。当前 OpenNeko bridge 明确广告三者均为 `false`，且把 resource link 降成文本，因此附件能力尚未接通。
- DSH `@deepseek-ai/dsh-attachment` 与 `@deepseek-ai/dsh-llm` 当前只提供 PNG/JPEG/WebP/GIF 的持久 `ImageBlock`。音频、视频、文档和通用文件仍是上游缺口，不能伪装为 DSH 原生附件。

## 冻结边界

1. 图片在通过 Host 资源授权与 DSH admission 后，以 DSH 原生 image attachment/content block 进入同一 Session。
2. 音频、视频、文档和其他文件在 DSH 原生 block 未可用前，只能由 owning media/content service 解析为有界、带来源的感知或文本 evidence，再作为 exact turn context 注入；原始资源仍由 Host authority 持有。
3. 当前模型声明支持输入模态时直接使用该模型；不支持时调用用户配置的感知模型生成结构化 evidence。两条路径由同一显式 modality routing policy 选择，不允许失败后隐式换 provider/model。
4. 产品 UI 可以配置 Skill、MCP、感知模型与 Generation 参数；这些配置分别提交给 DSH extension authority、感知 owner 与 Generation owner，不建立统一 Plugin 配置 store。
5. Extension inventory/config、非图片附件、感知 fallback 与 browser/computer MCP 在完成公开 contract 和真实 Desktop 验证前继续阻塞发布。

## 审计来源

- `@deepseek-ai/dsh-skill@0.1.0-rc.7`：`README.zh.md`、`lib/types/index.d.ts`
- `@deepseek-ai/dsh-attachment@0.1.0-rc.7`：`README.zh.md`、`lib/types/types.d.ts`、`lib/types/index.d.ts`
- `@deepseek-ai/dsh-llm@0.1.0-rc.7`：`lib/types/types.d.ts`
- `@deepseek-ai/dsh-settings@0.1.0-rc.7`：`README.zh.md`、`lib/types/index.d.ts`
- `@deepseek-ai/dsh-host-plugin-inventory@0.1.0-rc.7`：`README.zh.md`、`lib/types/types.d.ts`、`lib/typert.remote-client.d.ts`
- `@agentclientprotocol/sdk@0.25.1`：`dist/schema/types.gen.d.ts`
- 当前 bridge：`packages/dsh-bridge/src/index.ts`
