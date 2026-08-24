## Why

OpenNeko 已将 Skill runtime 切换到 DeepSeek Harness（DSH），但当前产品边界仍保留若干 Pi-era 或 OpenNeko 自定义语义：所有 Session 使用统一虚拟 cwd、管理快照不带 Agent scope、显式调用只允许一个 Skill，并把“Skill 正文不得出现工具教程”作为资格条件。这些行为没有完整保留锁定版本 `@deepseek-ai/dsh-skill` 与 `@deepseek-ai/dsh-skill-filesystem` 的来源分层、调用策略、多 Skill 组合和资源语义，且会把产品治理偏好误写成 DSH 格式限制。

本变更以仓库锁定的 DSH `0.1.0-rc.8` 公开契约为唯一 Skill runtime 语义来源。OpenNeko 继续拥有 Workspace 授权、Desktop 输入呈现、工具权限和安全边界，但不得建立第二套 Skill 选择器、内容格式或调用限制。

## What Changes

- 以 DSH `ctx.skills` 的 scoped registry、filesystem provider、`skill` tool 和显式 `/name` 注入语义作为唯一生产 Skill 路径。
- 为 Assistant 与精确 Workspace Conversation 提供 Host 授权的 lookup cwd，使 DSH 原生 project、personal、custom 与 bundled Skill 来源能够按上游规则发现和覆盖。
- 让 Extension 管理、Composer catalog、模型加载和用户显式调用读取同一 exact Agent scope；不再用 unscoped snapshot 形成第二个目录视图。
- 支持一次用户输入显式组合任意数量的当前 user-invocable Skills；不设置“一个主 Skill”、固定 Skill 数量或 profile-first 前置条件。
- 原样保留 DSH `modelInvocable`、`userInvocable`、`whenToUse`、`metadata` 与 `resourceBase` 语义；Renderer 只获得安全、必要的管理投影。
- 将 Skill 内容资格规则收敛为 DSH 格式有效性与真实安全边界。公开模型/工具的使用方法可以进入 Skill；Skill 仍不能授予工具权限，也不能把私有 ACP/MCP/Host schema 伪装成可执行权限。
- 增加来源优先级、多 Skill、调用策略、资源加载、不完整目录和管理/运行视图一致性的路径级验证。

## Capabilities

### New Capabilities

- `dsh-skill-runtime-semantics`: OpenNeko 完整保留锁定 DSH Skill registry、来源、调用策略、多 Skill 注入和按需资源语义，不增加平行 runtime 限制。

### Modified Capabilities

- `dsh-extension-runtime-boundary`: 将 blanket Skill prose 限制改为权限与私有协议边界，并允许全部 Host 授权的 DSH Skill 来源参与 scoped registry。
- `dsh-agent-runtime-authority`: Composer 显式 Skill 路径从单 Skill gesture 扩展为 DSH 原生多 Skill 组合，仍保持 unknown/stale fail-visible。
- `agent-extension-capability-contract`: 兼容性审计以锁定 DSH 契约为事实源，不再把 OpenNeko 私有 portable overlay 或额外内容限制称为 DSH 标准。

## Impact

- Owner：`@neko/dsh-bridge` 拥有 DSH profile 内的公开 API 适配；`@neko/agent-contracts` 拥有 Host/ACP 投影契约；`@neko/agent-runtime` 拥有 Conversation 到 DSH Session lookup context 的 host-neutral 协调。
- `apps/neko-desktop` 只解析 sender-bound Conversation 的精确 Workspace authority，并把 opaque、已授权的 lookup identity 交给 package public port；不得从 active/recent Workspace 猜测 cwd。
- `@neko/agent-webview` 继续拥有 `$` 菜单和展示 token，只提交 typed 多 Skill intent，不做语义路由或 Skill 选择。
- `packages/skills` 的格式和内容审计改为 DSH-compatible；现有 Skill 数量、名称和拆分方式不因本变更被强制调整。
- 用户数据不迁移、不重写。DSH Session lookup context 变化必须通过 exact Conversation binding 恢复；无法重新授权的 Workspace Session 局部失效并保留原 Session 字节。
- 本变更不开放第三方可执行 Plugin/Webview，不改变 MCP 或领域 Tool 权限，也不让 Skill 内容获得额外权限。

## Dependencies

- 依赖 `replace-pi-with-dsh-runtime-atomically` 已建立的 DSH subprocess/ACP 单一 runtime authority。
- `restore-dsh-native-skill-authoring` 和 `standardize-progressive-ai-native-content` 依赖本变更提供的 scoped source、resource 与多 Skill 行为证据。
