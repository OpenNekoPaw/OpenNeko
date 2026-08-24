# ADR: Agent 命令、Skill 与上下文触发边界

状态：Accepted

更新日期：2026-08-01

范围：Desktop Chat 输入框、Slash command catalog、Skill catalog、上下文引用、typed input contract 与 prompt 注入。

## 决策

输入前缀只承担稳定、可解释的职责：

| 入口 | 语义 | Owner |
| --- | --- | --- |
| `/command` | 会话或产品控制命令 | Desktop/Agent command catalog |
| `$skill` | 显式选择 reusable Skill | Skill Host + Agent runtime |
| `@context` | 引用文件、资源、项目、selection 或实体 | Context resolver / owning domain |
| 自然语言 | 开放意图与创作请求 | 主 Agent reasoning |

Renderer 可以完成 tokenization、菜单过滤和 keyboard interaction，但不执行 command、不读取文件、
不选择 Skill、不解析领域资源，也不改变 Agent 状态。提交后由 Desktop typed port 校验 schema、
identity、permission 和 catalog revision，再交给对应 owner。

Draft 与 Conversation 使用同一 DSH input-catalog contract，但目标必须精确区分：Draft 以首次提交将使用的
authoritative cwd 做 pre-turn discovery，Conversation 以绑定的 DSH Session identity 做 discovery。
Draft discovery 不得创建 OpenNeko Conversation 或持久 DSH Session；命令或 Skill 首次提交仍先原子创建并
绑定正式 Session，再由该 Session 重新解析和执行。

自然语言不得在 Agent reasoning 之前被关键词规则映射到 Skill、Tool 或固定 workflow。命令和 Skill
identity 冲突、未知前缀、禁用 Skill、无效 context 或陈旧 selection 必须 fail-visible。

## 验证

- parser 覆盖转义、空白、组合输入、Unicode、菜单选择和提交；
- producer/consumer 测试覆盖 command、Skill 和 context typed contract；
- 路径断言证明自然语言进入 Agent、`$` 进入 Skill Host、`@` 进入明确 resolver；
- 输入菜单、焦点和提交使用真实 Electron Desktop 场景。

相关决策见 [`adr-agent-skill-catalog-activation-boundary.md`](adr-agent-skill-catalog-activation-boundary.md)、
[`agent.md`](agent.md) 和 [`application-composition.md`](application-composition.md)。
