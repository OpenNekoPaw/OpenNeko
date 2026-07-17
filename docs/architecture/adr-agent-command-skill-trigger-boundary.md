# ADR: Agent 命令与技能触发入口边界

状态：Accepted
日期：2026-06-20
范围：`neko-agent` Chat 输入框、Slash command catalog、Skill catalog、Webview/Extension 协议、CLI/TUI 输入入口、Skill 激活与 prompt 注入。

本文记录 OpenNeko 对 Agent 用户输入触发入口的稳定决策。它补充 `agent.md` 与 `package-boundaries.md`，用于避免控制命令、插件命令、技能激活和自定义 prompt 命令长期混在同一个 `/` 入口里。

## 背景

当前 `neko-agent` 已经同时拥有几类相近但语义不同的入口：

- builtin slash commands，例如 `/status`、`/model`、`/plan`、`/tools`、`/mcp`，用于控制 Agent 会话、配置、宿主 UI 或资源面板。
- plugin slash commands，由其他扩展注册，可能触发宿主动作或领域包入口。
- Skill 激活，注入 Skill prompt content，并让 runtime 根据 metadata、policy 和 capability catalog 投影工具约束。
- command-backed skill / custom command，使用 `$ARGUMENTS`、`$1-$99` 进行参数插值。
- 自然语言输入，由主 Agent 根据上下文和 Skill catalog 判断是否需要调用 `ActivateSkill`。

Webview 已在 slash menu 中按 Agent / Creation / Skills 做视觉分组，但触发字符仍是同一个 `/`。这让用户很难判断“这是控制 Agent 的命令”还是“让 Agent 进入某个工作流/能力模式”。运行时也需要先解析 builtin，再尝试 skill command，边界不够清晰。

Codex 当前用户心智可作为参考：`/` 用于控制会话与产品行为，`$skill` 用于显式选择 reusable workflow / skill，自然语言交给主 Agent reasoning，而不是交给 Host/Extension 关键词触发。Neko Agent 应采用同类入口分流，但保持本项目的 Agent-first、Skill-first 和 host-agnostic runtime 边界。

## 决策

Neko Agent 采用以下触发入口边界：

| 入口 | 归属 | 示例 | 语义 |
| ---- | ---- | ---- | ---- |
| `/` | Agent、宿主和插件命令 | `/status`、`/model`、`/plan`、`/tools`、`/mcp`、插件命令 | 控制会话、配置、宿主 UI、资源面板或插件动作 |
| `$` | Skill 显式激活 | `$storyboard`、`$quality-review`、`$character-validation args` | 注入领域方法、创作语义、输出标准或 prompt fragments；工具约束由 runtime/capability 投影 |
| 自然语言 | Agent 自主判断 | “帮我做角色验证” | Agent 可通过 `GetContext` 查看 Skill catalog，并在需要时调用 `ActivateSkill` |
| `/skills` | Skill 管理入口 | `/skills`、`/skills active`、`/skills clear` | 浏览、管理、清除 Skill，不替代 `$` 显式调用 |
| `@` | 上下文引用 | `@scene.md`、`@character` | 引用文件、实体、素材、Canvas 节点或上下文 chip |

`/` 不应再作为普通 Skill 的默认显式触发入口。Skill 的 canonical 显式入口是 `$<skill-name>`；`/skills` 只负责管理。插件 slash commands 保持在 `/`，因为它们可能是宿主动作、领域入口或 UI 命令，不一定会注入 Skill prompt。

自然语言入口不得由 Host/Extension 关键词匹配、候选路由或 Webview UI 在 Agent reasoning 之前选择 Skill。主 Agent 可通过 `GetContext` 查看 registered Skills 和 metadata，并通过 `ActivateSkill` 做显式 tool 决策；用户新增 Skill metadata 与激活权威见 [`adr-agent-skill-catalog-activation-boundary.md`](adr-agent-skill-catalog-activation-boundary.md)。

Skill 注入核心仍由 `SkillInjectionCoordinator` 和已有 Skill runtime 负责。新增 `$` 入口只改变用户输入解析、catalog 投影和 dispatch contract，不复制 prompt 注入、权限规则、tool guard 或 toolset activation 逻辑。

## 契约边界

新增或调整输入入口时遵守以下边界：

- `agent-types` 定义跨 Webview、Extension、CLI/TUI 可共享的触发 contract、输入解析结果和 projection 类型。
- `agent` runtime 继续保持 host-agnostic；它只接收“激活某个 Skill”的 typed request，不知道 React、VS Code 或 DOM 事件。
- `webview` 和 `apps/neko-tui` 只负责各自宿主的输入菜单、过滤、展示和消息发送；Agent 业务行为通过 `@neko/agent` 公共 runtime contract 组合。
- `extension` 只做 host adapter 和 dispatch，不把 Skill 业务逻辑沉淀在 Webview message router。
- Skill 显式激活、Agent `ActivateSkill` 和命令参数插值最终都进入同一 Skill injection path。
- 未知 `/command`、未知 `$skill`、命名冲突、禁用 Skill、缺失 Skill 内容或非法参数应 fail-visible，不能 no-op 或退回自然语言伪装成功。

## 迁移策略

OpenNeko 尚处 prelaunch，可以清理未发布的内部 UI/协议混合入口，但迁移必须可观测：

1. 先新增 `$` Skill catalog、输入菜单和 dispatch path。
2. 保留 `/skills` 管理命令和插件 slash commands。
3. 将已有 Skill `command` 字段视为过渡 alias 或 command-backed artifact 入口，新增 Skill 默认不再通过 `/` 暴露。
4. 对仍需要 `/` 形式的 reusable prompt，保留 `.neko/commands/*.md` 或等价 command artifact，把它归类为 custom command，而不是普通 Skill。
5. UI help、文案和测试同时显示 `/` commands 与 `$` skills 的区别。
6. 移除 legacy `/skill` 默认路径前，必须有路径级测试证明 `$` canonical path 被命中，旧路径没有参与新路径成功结果。

## 非目标

- 不把插件 slash command 迁移到 `$`。
- 不把 Skill 变成 workflow engine；Skill 仍只描述领域方法、prompt fragments、创作语义、输出标准和适用场景，工具范围只出现在机器可读 metadata/policy 中。
- 不阻止 Agent 在自然语言对话中自主判断并调用 `ActivateSkill`。
- 不让 Webview 直接执行 Skill 或读取 Skill 文件。
- 不为这一本地 VS Code 客户端引入远程多租户、分布式 command service 或云端治理层。

## 后果

正向后果：

- 用户可预测入口：`/` 控制 Agent，`$` 选择能力，`@` 引用上下文。
- Runtime contract 更清晰：命令执行和 Skill 注入不再共享一个模糊入口。
- 命名冲突更容易处理：`/review` 与 `$review` 可以分别代表命令和技能。
- 后续 Skill marketplace、Skill 管理 UI 和 Agent catalog metadata 可以复用同一 Skill catalog projection。

代价：

- Webview 和 CLI/TUI 输入框需要支持一个新的 `$` 菜单状态。
- Help、i18n、测试和 command catalog 需要同步拆分。
- 过渡期可能同时存在 legacy `/skill` alias 和 canonical `$skill`，必须用 diagnostics 与测试避免长期双路径漂移。

## 验证要求

实现该 ADR 的变更至少需要覆盖：

- `/` 菜单只展示 builtin / plugin / command artifact，不默认展示普通 Skill。
- `$` 菜单展示 enabled Skills，并支持过滤、选择、参数保留和键盘操作。
- `$skill args` 触发 SkillInjectionCoordinator，且可断言 canonical `$` path 被命中。
- `/status`、`/model`、`/plan` 等 builtin commands 不走 Skill path。
- plugin slash commands 仍走 plugin command dispatch。
- 未知 `$skill`、禁用 Skill、Skill 命名冲突和 legacy `/skill` 命中规则都有 fail-visible 结果。
- Webview/Extension 相关交互通过 VS Code Webview runtime 验证；普通浏览器/Vite 验证不能作为最终运行态验收。
