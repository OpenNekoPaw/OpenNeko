# ADR: Agent 原生创作能力与 Workflow/IDC 边界

- 状态：Superseded
- 日期：2026-07-02
- 范围：`neko-agent` 创作阶段、Skill prompt-chain、IDC profile、workflow 命名、validator、approval、artifact/state 投影和领域 capability 调用。

本文记录 OpenNeko 对 Agent 创作系统的核心边界：**所有创作 lifecycle、feedback、state、approval 和后续操作判断都属于 Agent 原生能力；IDC、Skill 和 workflow 都只能在 Agent 能力上进行扩展或约束，不得在 Agent 之前或旁边建立独立运行时。**

> 2026-07-15：其中仍保留的 IDC profile/stage/iteration 语义已进一步由 [`adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md`](adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md) 删除。当前不再存在 IDC profile；普通 Agent ReAct 是唯一创作执行路径。

本文补充并收紧 [`agent.md`](agent.md)、[`adr-agent-autonomous-filmmaking-creation-boundary.md`](adr-agent-autonomous-filmmaking-creation-boundary.md)、[`adr-agent-prompt-skill-validator-boundary.md`](adr-agent-prompt-skill-validator-boundary.md)、[`adr-agent-skill-creator-and-validation.md`](adr-agent-skill-creator-and-validation.md) 和 [`adr-agent-idc-skill-planmode-trigger-boundary.md`](adr-agent-idc-skill-planmode-trigger-boundary.md)。若旧文档仍使用 `workflow runtime`、`IDC runtime` 或固定三阶段 IDC 作为 canonical 设计，应以本 ADR 为准。

## 背景

近期分镜表、Markdown 资源渲染、Canvas handoff、Skill 激活和 IDC 控制按钮问题暴露出同一个架构偏差：系统把创作过程误建模成固定 workflow/run/node/transition，或者把 IDC 抬升为独立 runtime。这样会产生以下问题：

- Agent 像执行一条隐藏流水线，而不是自主判断下一步。
- Skill prompt-chain 被误读成可执行 workflow DSL。
- IDC 被误读成固定 `draft -> plan -> apply`，难以支持不同场景的更多阶段。
- Webview 出现 `start/resume/stop` 这类运行时控制按钮，污染正常对话。
- `AgentWorkflowRun`、`IdcRun`、`CreationIteration`、`SkillLifecycleRecord` 等对象争夺创作身份和状态权威。
- Validator、用户反馈、审批和重试容易被拆到各自领域，导致行为不一致。

Neko 是本地 VS Code 创作产品。Agent 的价值是理解上下文、遵守 Skill 方法、使用工具、校验结果、根据反馈修订，并自主判断后续操作。它不应退化成固定工作流引擎。

## 决策

Agent 创作系统采用以下分层：

```text
Agent Native Creation Capability
  owns lifecycle / stage / iteration / feedback / validation / approval
  owns creation state / artifact provenance / capability invocation decisions

IDC
  is a creation profile on top of Agent native capability
  declares default constraints and stage semantics

Skill
  declares method, prompt-chain guidance, output standards, validators, tool hints
  never owns execution state or grants permissions

Workflow
  means Skill-authored prompt-chain guidance only
  never means runtime engine, DAG scheduler, node executor, or state machine
```

### 1. Agent 原生能力是唯一 lifecycle/state/approval 权威

Agent runtime 拥有以下能力：

- 阶段进入、退出和当前阶段投影。
- 一次或多次 iteration / attempt 的记录。
- validator 运行、诊断回灌和失败后重试/修订。
- 用户 feedback、review、approval、regress 和 continue 决策。
- artifact、resource、text document、capability result 的 provenance。
- tool/capability 是否可调用、何时调用、调用后如何观察结果。
- 对话流、事件流和 UI projection。

这些能力不能由 IDC、Skill、领域 adapter 或 workflow runtime 另行实现。领域代码只能提供 capability、validator、schema 或 projection adapter，不能拥有 Agent 创作状态机。

### 2. IDC 是 Agent 原生创作能力上的 profile

IDC 是 Intent-Driven Creation 的方法论 profile，不是 runtime，不是 workflow，也不是所有场景固定三阶段。

`draft / plan / apply` 只能作为内置默认 IDC profile。其他场景可以声明更多阶段，例如：

```text
storyboard.creation:
  read-reference
  analyze-panels
  generate-storyboard
  validate-storyboard
  revise-storyboard
  handoff-to-canvas

openspec-like:
  explore
  propose
  design
  tasks
  apply
  verify
```

阶段是可迭代、可反馈、可组合的创作单元。每个阶段都可以反复修改，validator 可以把 diagnostics 反馈给 Agent，用户也可以要求回退、补全或重写。

IDC profile 可以声明：

- stage id、label、description、order 或 dependency hint。
- 每个 stage 的目标、产物类型、validator id 和 review policy。
- prompt fragments、skill slots、tool/capability hints。
- 失败修复策略、回退建议和用户交互方式。

IDC profile 不得声明：

- 私有 lifecycle runtime。
- 私有 approval runtime。
- 私有 feedback loop。
- 私有 execution engine。
- 私有持久化状态机。

### 3. Workflow 只表示 Skill prompt-chain

在 Agent 领域中，workflow 只能表示 Skill 配置的 prompt-chain 或方法指导，例如：

```text
analyze references
write candidate storyboard
validate required fields
revise until diagnostics clear
ask user before canvas handoff
```

prompt-chain 是 Agent 可读的指导，不是可执行 DSL。Agent 可以跳步、重排、重复、停止或补充步骤，但必须能解释原因，并可通过 prompt-chain observation 记录 checkpoint、skip、reorder 和 completion。

禁止新增或继续扩展以下概念作为 canonical Agent 创作能力：

- `WorkflowRuntime`
- `WorkflowRun`
- `WorkflowNode`
- `WorkflowTransition`
- workflow DAG scheduler
- workflow node executor
- workflow state machine
- hidden pipeline runtime

已有 `AgentWorkflowRuntime`、`AgentWorkflowRun`、`AgentWorkflowDefinition` 等只能作为 legacy projection、trace 或兼容层存在。新功能不得依赖它们作为创作身份、阶段状态或执行权威；迁移应逐步删除这些执行型概念。

### 4. Skill 是方法包，不是运行时

Skill 可以声明：

- 领域场景和不适用场景。
- prompt-chain 方法。
- 输出格式、字段、表格、文档和示例。
- validator id 和修复策略。
- 允许使用的 capability/tool hints。
- stage profile 扩展或约束。

Skill 不得：

- 管理 stage state。
- 管理 approval state。
- 隐式授予工具权限。
- 伪造 capability 结果。
- 把多步骤高风险操作藏在 prompt-chain 里当作一次成功。
- 定义独立 workflow engine。

### 5. 后续操作由 Agent 自主判断

目标不是固定协议字段，也不是固定流程按钮，而是 Agent 在当前上下文中自主判断下一步：

- 继续分析。
- 补全缺失字段。
- 运行 validator。
- 根据 diagnostics 修订。
- 请求用户确认。
- 调用 Canvas/Cut/Model/File capability。
- 回退到前一阶段。
- 结束并总结残留风险。

提示词约束和 Skill 方法提供判断依据；validator 提供可判定反馈；capability 提供真实副作用边界。系统不应在 Agent 前面再建一套执行 runtime 替 Agent 决策。

## 术语

| 术语 | 含义 | 禁止误用 |
| --- | --- | --- |
| Agent native creation capability | Agent 原生创作能力，拥有 lifecycle、stage、feedback、validation、approval、state 和 capability invocation 判断 | 不应被 IDC 或 workflow runtime 替代 |
| Creation profile | 一组创作阶段、约束、validator 和 prompt guidance 的声明 | 不拥有运行时状态 |
| IDC profile | Intent-Driven Creation 的默认或领域扩展 profile | 不是 workflow，不固定三阶段 |
| Skill prompt-chain | Skill 中声明的方法步骤和提示词指导 | 不是可执行 DSL，不是 DAG |
| Validator feedback | 机器可判定诊断，反馈给 Agent 修订 | 不替代 Agent 推理 |
| Approval | Agent 原生 gate，保护副作用和用户确认 | 不埋在 Skill 文案里 |
| Workflow | 仅作为 prompt-chain 的自然语言简称 | 禁止指运行时引擎 |

## 代码治理要求

后续实现必须遵守：

1. 新代码不得新增 `WorkflowRuntime`、`WorkflowRun`、`WorkflowNode`、`WorkflowTransition` 等执行型 Agent workflow 概念。
2. 新创作状态不得以 `workflowRunId` 作为 canonical identity；应使用 Agent 原生 creation/session/iteration identity。
3. 新阶段类型不得固定为 `draft | plan | apply`；默认 IDC 三段应作为内置 profile 数据，而不是类型边界。
4. `stagePersona` lifetime 应泛化为 Agent stage lifetime；`idc-stage` 只能作为 legacy 或 default profile 兼容语义。
5. `workflowSkill` 命名应迁移为 `methodSkill`、`promptChainSkill` 或同等不暗示执行 runtime 的命名。
6. Webview 不得在输入框或全局工具栏暴露 IDC start/resume/stop 控件；阶段状态应在对话流、artifact review、diagnostic 或 status projection 中展示。
7. Prompt-chain observation 只能记录 Agent 对方法指导的采纳、跳过、重排和完成，不得演化为 executable plan schema。
8. Capability lifecycle 是真实副作用边界；Skill 和 prompt-chain 只能建议调用，不能伪造调用成功。

## 影响

### 正面影响

- Agent 保持自主判断能力，不退化为隐藏流程执行器。
- Skill 能像 OpenSpec、Superpowers 一样表达方法论，同时保持可审计。
- IDC 可以支持不同创作场景的动态阶段，而不被三段模型锁死。
- Validator、feedback、approval 和 capability invocation 共享同一 Agent 原生机制。
- Workflow 相关旧债有明确退场方向。

### 代价

- 需要迁移已有 `AgentWorkflowRuntime` 和 `IdcStage` 固定 union。
- 需要重命名或重新解释 `workflowSkill`、`idc-workflow` 等历史术语。
- 需要补充小而具体的投影和 observation contract，避免在删除 workflow runtime 后用新的大 DTO 或状态机替代旧 runtime。
- 需要更强的 validator 和 prompt-chain observation 测试，证明 Agent 是自主决策而非执行固定流程。

## 迁移方向

| 当前概念 | 目标 |
| --- | --- |
| `AgentWorkflowRuntime` | 删除；短期仅 legacy projection/trace |
| `AgentWorkflowRun` | 不再作为 canonical 创作身份 |
| `WorkflowNode/Transition` | 禁止作为新创作执行模型 |
| `IdcStage = draft/plan/apply` | 动态 Agent stage id；三段作为 `idc.default` profile 数据 |
| `IdcRunLifecycle` | Agent native creation/session stage state |
| `StartIDCWorkflowTool` | 通用 Agent profile/stage activation 或 Agent 自主阶段推进 |
| `workflowSkill` | `methodSkill` / `promptChainSkill` |
| 输入框 IDC 控制按钮 | 删除；改为对话流阶段状态和用户反馈入口 |

## 验证要求

相关变更至少应有测试证明：

- Skill prompt-chain 只产生 observation，不创建 workflow node/run。
- Agent creation/iteration 不依赖 `workflowRunId`。
- 动态 stage profile 可以表达非 `draft/plan/apply` 阶段。
- Validator 失败后 diagnostics 反馈给 Agent，而不是拦截流式输出或伪造成功。
- Webview 普通 composer 不显示 IDC 控制按钮。
- Capability 副作用仍走 Agent capability lifecycle 和 approval gate。

## 后续

本 ADR 应推动一个 OpenSpec 变更，清理当前 Agent workflow/IDC 误抽象：

- 删除或隔离执行型 `agent-workflow-runtime.ts`。
- 将 IDC 三段迁移为内置 profile。
- 仅在具体边界需要时引入小型 Agent-native projection、validator feedback 或 prompt-chain observation contract。
- 迁移 `workflowSkill` 命名。
- 移除 composer IDC 控制按钮和 `showIdcWorkflowControls`。
- 更新 `introduce-agent-creation-iteration-contracts` 中仍把 IDC 固定为三段或把 workflow runtime 作为 bootstrap plane 的内容。
