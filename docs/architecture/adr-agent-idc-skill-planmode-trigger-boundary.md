# ADR: Agent IDC、Skill 与 Plan Mode 触发边界

- 状态：Superseded
- 日期：2026-06-26
- 适用范围：`neko-agent` IDC runtime、Skill injection、Plan Mode、Webview/Extension/CLI 触发入口、创作类媒体工作流

> 2026-07-15：本文的 IDC runtime、stage persona、`setPromptMode` 和固定 Draft/Plan/Apply 语义已被 [`adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md`](adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md) 取代，仅保留历史背景。当前只有普通 Agent ReAct、`executionMode`、领域 Skill、Approval、Task 和 owning Tool/project path。

本文记录 OpenNeko 对 IDC 创作流程、Skill 激活和 Plan Mode 的触发边界决策。它补充 [`agent.md`](agent.md)、[`adr-agent-command-skill-trigger-boundary.md`](adr-agent-command-skill-trigger-boundary.md) 与 [`adr-agent-skill-catalog-activation-boundary.md`](adr-agent-skill-catalog-activation-boundary.md)，用于避免 Agent 把完整创作流程误收敛成单个 Skill 激活或单个工具调用。

## 背景

`neko-agent` 同时存在三类容易混淆的触发面：

- IDC：Intent-Driven Creation，面向创作目标的 Draft -> Plan -> Apply 运行骨架。
- Skill：领域方法、prompt fragments、创作语义、输出标准、适用场景和 trust/host requirements 的能力包；portable `allowed-tools` 或 Host overlay dependencies 只作为机器可读 metadata/policy 输入。
- Plan Mode：用户主动进入的规划/审查模式，限制 Apply 和副作用工具。

这些触发面服务不同问题，但都会影响同一 Agent turn 的 system prompt、tool schemas、权限模式、active Skill 状态、artifact contract 和用户审批体验。如果边界不清，典型故障包括：

- 用户说“将漫画生成动画”，Agent 只激活 `media-production`，但没有应用 `media-production/from-comic` 来源 profile，也没有进入可审阅的 Draft/Plan。
- 用户显式 `$media-production` 后只注入 Skill prompt，却没有把该 turn 标记为 `prompt-chain-skill` IDC run，也没有保留来源 profile。
- Plan Mode 正确禁止 Apply，但没有自动选择漫画/分镜/动画领域 Skill，导致计划缺少领域约束。
- 阶段 persona Skill 与业务 Skill 共用单 active injection 槽，互相覆盖 prompt 和 tool policy。
- Agent 在 Auto Mode 中把多步骤、高成本媒体生产误判为单步工具调用，直接进入 Apply。

## 决策

IDC、Skill 和 Plan Mode 必须保持正交，但在创作类任务上显式组合：

```text
User / Webview / CLI input
  -> Trigger classification
      -> Plan Mode state decides whether Apply is allowed
      -> IDC metadata decides Draft / Plan / Apply entry
      -> Skill activation decides domain method and metadata tool hints
  -> Agent runtime assembles prompt / schemas / tool policy
  -> Apply-time tools execute only after IDC, policy and approval gates pass
```

三者职责如下：

| 触发面            | 负责                                                                                                                     | 不负责                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| IDC               | 创作阶段、runId、Draft/Plan/Apply 顺序、artifact expectation、Observe/Evaluate 回路                                      | 选择某个领域 Skill 的业务规则细节                              |
| Skill             | 领域方法、prompt fragments、创作语义、输出标准、输入/输出 artifact 描述、trust/host requirement；metadata 可声明所需工具 | 拥有工作流引擎、跳过 IDC、直接保存项目事实、在正文描述工具协议 |
| Plan Mode         | 用户主动要求先规划和审查，禁止 Apply，切换 permission mode                                                               | 自动选择领域 Skill，自动证明计划可执行                         |
| Tool              | 原子能力、参数 schema、权限、结果和 provenance                                                                           | 决定是否进入 Draft/Plan 或替代用户审批                         |
| Webview/Extension | 发送 typed intent、展示 projection、转发确认                                                                             | 在 Agent reasoning 前用关键词选择 Skill 或推导 IDC 策略        |

## 触发规则

| 输入/事件                        | 默认行为                                              | 约束                                                                           |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| 自然语言只读问题                 | 直接回答或轻量 Apply                                  | 不自动激活 Skill；Agent 可通过 `GetContext` 后调用 `ActivateSkill`             |
| 自然语言多步骤创作               | 启动 IDC，默认 Draft -> Plan -> Apply                 | 媒体生成、批量变更、写项目事实和高成本请求必须显式经过 Draft/Plan              |
| `$skill args`                    | 显式 Skill 激活，并作为 `prompt-chain-skill` 进入 IDC | Skill schema 不直接控制 IDC routing；显式执行路径必须注入 IDC metadata         |
| Webview `invokeSkill`            | 显式 Skill 激活                                       | 与 `$skill` 保持同等语义；创作类 Skill 不应只改 active Skill 而不带 IDC intent |
| Agent `ActivateSkill`            | Agent 自主激活领域 Skill                              | 不替代当前 IDC stage；激活后仍受 stage、permission 和 approval 限制            |
| `/plan` 或 `setPromptMode: plan` | 切换 Plan Mode                                        | 强制 Draft/Plan，禁止 Apply；不自动选择业务 Skill                              |
| 引用 `@draft-*` / `@plan-*`      | 恢复或继续 IDC artifact                               | 继续路径应保留原 run/artifact provenance                                       |
| 高风险或不可逆操作               | 强制 Draft/Plan/Approval                              | 不允许通过 Skill metadata 静默越权                                             |

## 冲突与干扰处理

### 1. IDC 与 Skill 不得互相替代

Skill 是能力包，不是 workflow engine。创作类 Skill 可以描述“如何把漫画转动画”，但不能把 Draft/Plan/Approval 折叠成 prompt 文案。IDC 决定阶段顺序，Skill 只在该阶段内提供领域方法、创作语义和输出标准；具体工具协议由 runtime catalog、tool schema 和子包 capability 提供。

对于“漫画生成动画”这类请求，期望路径是：

```text
Intent
  -> IDC Draft: 理解漫画、叙事、人物、缺失场景、目标风格
  -> IDC Plan: 选择 storyboard/from-comic、media-production 内部 stage 与 video-editing owning capability 路径
  -> Approval: 用户审查 Draft/Plan 或关键生成预算
  -> Apply: 调用 ReadDocument / ReadImage / GenerateImage / GenerateVideo / Canvas / Cut 等工具
  -> Observe/Evaluate: 校验 artifact、生成结果和一致性
```

不是：

```text
Intent
  -> ActivateSkill(media-production) + sourceProfile(media-production/from-comic)
  -> GenerateVideo
```

### 2. Plan Mode 不得被 Skill 绕过

Plan Mode 是用户主动审查边界。即使 active Skill 的 portable `allowed-tools` 或 Host overlay dependencies 包含生成或写入能力，Plan Mode 下仍只能执行只读工具和允许的计划文件写入。Skill metadata 是能力提示，不是越过模式和审批的授权。

### 3. Persona Skill 与业务 Skill 应拆分语义槽

IDC 阶段 persona（如 Draft/Plan 的 creation persona、Apply 的 execution persona）负责阶段行为约束；业务 Skill（如 `media-production`）负责领域策略。二者不应互相覆盖。

当前若运行时仍使用单 active injection 槽，应将其视为已知设计风险。后续应收敛为至少两个可组合槽：

- `stagePersona`: 由 IDC stage tracker 管理。
- `domainSkill`: 由 `$skill`、`invokeSkill` 或 Agent `ActivateSkill` 管理。

Tool policy、prompt sections 和 diagnostics 必须能说明来自哪个槽位，冲突时 fail-visible。

### 4. Webview 只触发 intent，不推导策略

Webview 的 `setPromptMode`、`invokeSkill`、`invokeSlashCommand`、plan approval 和 tool confirmation 只表达用户意图。它不应读取 Skill 文件、不应判断自然语言关键词、不应自行决定 IDC stage，也不应直接执行工具。

### 5. 创作类媒体任务默认高审查

包含视频生成、动画生成、批量图片生成、时间线写入、Canvas/Cut 交付、导出、覆盖或删除的请求，默认需要显式 Draft/Plan 和审批点。低风险只读分析可以不创建完整 IDC artifact，但一旦进入生产或写项目事实，应升级到 IDC 主链。

## Artifact 完整性边界

Draft、Plan、Task 是需要用户审阅/审批的可见项目文档，不属于隐藏 `.neko` runtime/cache。路径、frontmatter 和写入规则由 creation-document service、schema/prompt contract 与 runtime validator 共同约束。文档完整性不是 Skill 自己保证的：

- `ArtifactSchemaModule` 将 creation document contract 注入 schema 层，并禁止 Agent 通过通用文件工具直接读写隐藏 runtime/cache 路径。
- `ArtifactService` 将 Draft/Plan/Task 持久化为项目可见文档，例如 `neko/creations/<creation-id>/brief.md`、`plan.md`、`checklist.md`。
- `ArtifactValidator` 校验 Draft/Plan/Task frontmatter 的结构完整性。
- `ArtifactWatcher` 仅作为 host 显式 opt-in 的可见 creation document 观察器，不是默认 `.neko` 目录监听器。
- `ArtifactObservationHooks` 可将 `artifact.invalid` 反馈给 Agent，由 Agent 解释诊断并提供修正文档内容，持久化仍由 host service 处理。

这些机制保证基础结构和可观测修复，不等同于完整语义审查。漫画转动画等领域 artifact 还需要领域 payload validator 或 Skill/Tool 层 preflight 来检查 narrative continuity、stable shot id、character identity、source refs、generation readiness 和 tool availability。

## 测试要求

涉及本 ADR 的变更至少覆盖：

- 自然语言“将漫画生成动画”类请求应进入多步骤创作路径，不得直接调用生成视频工具。
- `$media-production args` 和 Webview `invokeSkill(media-production)` 应可断言同一 Skill injection path 被命中，并携带创作类 IDC metadata。
- Plan Mode 下即使 active Skill 允许生成工具，也不能执行 Apply-stage 生成、写入、Canvas/Cut 交付或导出。
- Stage persona 与 domain Skill 不应互相覆盖；若当前实现仍为单槽，应有 characterization test 暴露该风险或阻止误报成功。
- Apply-stage 高成本或不可逆工具必须经过 permission/approval gate；测试应断言 canonical IDC/approval path 被命中。
- Draft/Plan/Task creation document 必须走 creation-document service 或显式 host watcher；无效 frontmatter 应产生可见 diagnostic 或 `artifact.invalid` observation，不得由 Agent 直接修补隐藏路径。
- Webview `setPromptMode`、`invokeSkill` 和自然语言发送路径不得在 Webview 侧直接推导 Skill 或 IDC stage。

## 后续收敛

- 将 Skill injection 拆成 `stagePersona` 与 `domainSkill` 等可组合槽位。
- 为创作类 Skill 增加 `requiresIdc: true` 或等价 capability metadata，由 runtime 转换为 IDC entry metadata，而不是由 Webview 关键词推导。
- 为媒体生产工具增加 preflight：检查 active IDC run、Draft/Plan 状态、审批状态、source refs 和 provider/tool availability。
- 扩展中文与多语言创作意图分类，覆盖“漫画”“动画”“分镜”“生成视频”“导出”等生产语义。
- 为领域 artifact 增加语义完整性校验，例如 StoryboardTable、ShotImagePrepPlan、AnimationPlan overlay 和 Cut handoff payload。
