# ADR: Agent Skill catalog 与激活权威边界

- 状态：Accepted
- 日期：2026-06-23
- 适用范围：`neko-agent` Skill catalog、Webview/Extension 消息、Agent meta tools、用户新增 Skill metadata

## 背景

`neko-agent` 曾经尝试用关键词或代码侧候选路由在 Agent turn 之前判断 Skill。这个方向违背 Agent-first / prompt-first：一旦代码在模型 reasoning 前替用户请求选择 Skill，就可能隐式改变 prompt injection、tool policy、model override 和 active Skill 状态。

当前对话模型上下文窗口约 1M tokens，已经足以让主 Agent 在需要时读取 Skill catalog、理解 metadata，并自主决定是否调用 `ActivateSkill`。因此 Skill 选择权应回到主 Agent，而不是放在 Extension/Webview 的关键词或候选系统中。

## 决策

自然语言输入不再触发代码侧 Skill 候选解析、候选 chips 或自动激活。系统边界收敛为：

```text
User message
  -> Agent 可通过 GetContext 查看 registeredSkills/catalog metadata
  -> Agent 自主判断是否调用 ActivateSkill
  -> Runtime 校验 Skill 是否存在、启用，并解析 portable tool hints、Neko overlay dependencies、compatibility 与 trust 约束
  -> SkillInjectionCoordinator 注入 Skill prompt content，并让 runtime/capability 投影 tool policy
```

不是：

```text
User message
  -> Extension/Webview/Router 根据关键词或候选分数选择 Skill
  -> Webview 展示候选 chips 要求用户再选
  -> 或在 Agent reasoning 前注入 Skill
```

Skill 激活 canonical path 只有：

- 用户显式 `$<skill-name>` / `invokeSkill`。
- Agent 调用 `ActivateSkill`。
- Runtime 内部经过同一 Skill injection owner 的显式执行路径。

## 职责边界

| 层           | 职责                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent        | 读取 `GetContext.registeredSkills`，结合用户意图、上下文、工具可用性和 Skill metadata 决定是否 `ActivateSkill`。                             |
| Runtime      | 校验 Skill 存在、启用、portable core/overlay 有效、依赖兼容、trust 和当前 tool/capability policy 等真实边界，并执行注入。                    |
| Extension    | 转发显式 Skill invocation 和 active Skill 状态；不做自然语言候选解析。                                                                       |
| Webview      | 展示 active Skill indicator 和显式 Skill catalog/命令入口；不展示代码生成的候选 chips。                                                      |
| Skill author | 用 portable `name` / `description`、可选 string metadata 和必要的 `agents/neko.yaml` dependencies/relationships 帮助 Agent 理解 Skill 能力。 |

## 用户新增 Skill

用户、项目、市场和插件 Skill 仍是一等能力，但进入方式不是代码候选索引，而是 Agent-readable catalog：

- `name` / `description`：portable core 的最小 catalog 信息；`description` 同时写清适用与不适用边界。
- `metadata`：可选 string-to-string map；Neko 小型领域标签使用 `neko.domain`、`neko.tags` 等 namespaced keys。
- `allowed-tools`：可选 portable tool hint，只作为兼容性和 policy 输入，不授予工具。
- `agents/neko.yaml.dependencies`：只有确实需要时才声明 Neko capability/profile reference。
- `agents/neko.yaml.relationships.skills`：只有确实需要时才描述 Skill 关系，不表示自动激活顺序。
- `source`、path、enabled、editable、trust 和 catalog actions 由 Host/Registry 投影，不能由作者声明。

新增 Skill 不需要修改 `neko-agent` 生产代码。只要 registry/catalog 能把 metadata 投影到 `GetContext.registeredSkills`，Agent 就能在上下文中推理是否激活。

## MoE 参考

MoE 的核心启发是“先路由再调用专家”，但 Neko Agent 的 Skill 不是无副作用专家函数。Skill 激活会改变 prompt、工具约束和会话状态，所以不能由代码 router 在模型 reasoning 前做硬路由。

可参考的是 MoE 的职责分离，而不是实现形态：

- catalog metadata 类似专家描述。
- Agent 的 reasoning 类似 router，但它在同一主推理链中可解释地完成。
- `ActivateSkill` 是显式 gate，负责把判断变成状态改变。
- Runtime 是 guardrail，拒绝非法或不可用激活。

## 影响

- 删除 Webview `skillCandidates` message、chips UI 和 per-conversation candidate state。
- 删除 Extension pre-turn candidate resolution。
- 删除 Agent candidate router/capability-card DTO 与候选 hints。
- 保留 `$skill`、slash catalog、`invokeSkill` 和 `ActivateSkill`。
- 保留并强化 Skill metadata，因为它是 Agent catalog 的输入，不是代码路由规则。

## 测试要求

- 自然语言请求不得发送 `skillInjection` Webview message。
- 自然语言请求不得调用 Skill injection 或 active Skill mutation。
- `$skill` / `invokeSkill` 仍走显式激活路径。
- `ActivateSkill` 仍经过 runtime 校验与 SkillInjectionCoordinator。
- `GetContext` 暴露 registered Skills 和 metadata，但不暴露候选 hints。
- Webview 不存在 `skillCandidates` 协议和候选 chips UI。

## 后续

如果未来需要额外辅助，不应恢复固定关键词触发。可考虑由 Agent 主动调用一个只读 catalog/search tool 来缩小 Skill 列表，但该 tool 只能返回 catalog 检索结果，不能激活 Skill、不能改变 prompt/tool 状态，也不能要求用户手动选择候选。
