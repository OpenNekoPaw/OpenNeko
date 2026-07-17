# ADR: Agent 默认提示词、Skill 提示词与 Validator 边界

状态：Accepted
日期：2026-06-30
范围：`neko-agent` 默认 system prompt、Skill prompt、输出 validator、Skill authoring validator、Canvas/Cut/Model 等 lifecycle capability 调用。

本文记录 Agent 提示词分层和校验边界。它补充 [`adr-agent-skill-creator-and-validation.md`](adr-agent-skill-creator-and-validation.md)、[`adr-agent-skill-catalog-activation-boundary.md`](adr-agent-skill-catalog-activation-boundary.md)、[`adr-unified-markdown-resource-rendering.md`](adr-unified-markdown-resource-rendering.md) 和 [`package-boundaries.md`](package-boundaries.md)。

## 背景

分镜表、图片引用和 Canvas handoff 的问题暴露出一个重复风险：默认提示词、Skill 提示词、validator 和 capability 都在描述“应该怎么输出”，但职责混在一起后，Agent 会继续沿用旧协议、简化字段、伪造资源 token，或把展示 Markdown 当作可执行 Canvas 节点。

Neko 需要把四类边界分开：

| 层              | 职责                                                                   | 不负责                                                        |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| 默认提示词      | Agent 身份、项目背景、全局原则、通用工具纪律、跨领域安全边界           | 具体领域字段、分镜表 profile、Canvas/Cut 私有 DTO、旧协议兼容 |
| Skill 提示词    | 应用场景、领域工作流、输出标准、交互方式、允许的 capability 和 profile | 全局身份重写、运行时权限授予、伪造工具结果                    |
| Validator       | 机器可判定的 correctness gate、诊断、失败可见                          | 创作推理、字段发明、替代 capability 执行                      |
| Capability/Tool | 真实读取、转换、写入、执行和审批边界                                   | 从 prompt 文本猜测成功、接受 runtime-only 资源投影            |

## 决策

默认提示词只承载跨 Skill 的稳定原则。任何 storyboard、creative table、Canvas Markdown、Cut plan、Model rig 等领域格式都必须进入对应 Skill prompt、profile validator 或 capability descriptor。

提示词是行为指导，不是契约边界。输出是否合格由 validator 判定，实际副作用由 capability/tool 执行。

```text
Default prompt
  -> common identity, project context, resource safety, tool discipline

Active Skill prompt
  -> domain scenario, workflow, output contract, interaction rules

Validator runtime
  -> generic trigger, diagnostics, fail-visible behavior

Profile validators
  -> storyboard creative table, Cut plan, quality report, etc.

Lifecycle capabilities/tools
  -> validate/review/apply/execute with real host state
```

## 三层提示词原则

### 默认提示词

默认提示词应提供：

- Agent 的基础身份和 OpenNeko 本地创作产品背景。
- 通用工具纪律：只使用运行时可见工具，必要时先 `GetContext`。
- 通用资源原则：不可伪造 `ResourceRef`，不可把 Webview URI、blob URL、缓存路径、系统临时路径或绝对路径写成稳定资源身份。
- 通用输出原则：Markdown 可读、结构清晰、复杂图表可校验。
- 通用 Skill 触发原则：内容理解请求不自动激活创作生产 Skill，生产产物请求才激活相应 Skill。

默认提示词不应包含：

- `canvas.ingestMarkdown`、`canvas.createStoryboardFromMarkdown` 等领域 capability 的操作细节。
- `intentHint: "creative-table"`、`profileHint: "storyboard"` 等 profile hint。
- `StoryboardTable`、`CompositeArtifact`、plugin-transfer payload 或旧 compiler/runtime 名称。
- 某个 Skill 的字段清单、表头顺序或样例表格。

### Skill 提示词

Skill 提示词应提供：

- 适用场景和不适用场景。
- 领域工作流和交互方式。
- 输出标准：字段、表格、层次、示例和禁止项。
- 资源引用规则：如何引用 host 已授权的素材，缺少绑定时如何诊断。
- 相关 capability/profile：具体 id 进入机器可读 metadata、`agents/neko.yaml` 或 runtime catalog；正文只描述领域意图和成功条件，不写工具教程，也不伪造调用结果。
- 对应 validator id：由 Artifact/Profile Registry 或机器可读依赖声明，例如 `creative-table.storyboard`。

Skill 提示词可以包含领域字段和示例，但示例必须能被对应 validator 通过。Skill 新增字段时，应同步更新 profile validator 或把字段标记为可扩展 metadata。

### Validator

Validator 是通用运行时加 profile 规则的组合：

- 通用运行时：`OutputValidator`、`ValidationHooks`、artifact validator 注册、诊断回调、fail-visible 行为。
- 通用输入校验：图片大小、格式、Mermaid、JSON schema、长度等。
- Profile validator：`creative-table.storyboard` 这类领域规则，校验特定表格字段、禁止旧表头、资源引用和三层创作信息。

因此，“validator 是否通用”的答案是：

- **运行时通用。** 同一套 hook 和结果信封可以承载不同 Skill/Profile 的校验。
- **规则不应伪装通用。** 分镜表字段、审批/计划/执行层、图片引用等是 profile-specific，需要按 profile 注册。
- **未知 validator id 不能被当作已校验。** Skill authoring validator 遇到未知 requirement 必须 fail-visible；runtime output validator 只执行已注册的 enforceable 规则，未注册 id 不能作为通过依据。

### Capability/Tool

Capability/tool 是执行边界。Agent 或 Webview 不能因为 Markdown 看起来正确就声称 Canvas、Cut、Model 已成功处理。

- 每个 capability/operation 必须由自己的 schema 和 policy 声明副作用、审批、trust、validation 与 recovery；`validate`、`review`、`apply` 不是 Agent 全局强制状态机。
- 一个具体的 validator 应保持只读；一个具体的 review operation 是否产生预览或草稿，由 owning domain contract 决定。
- 写入真实节点、项目事实或生成结果是否需要审批，由通用 capability/tool policy 和风险边界决定，不能只根据 operation 名称推导。
- Agent 原生 `CreateSkill` 可以在输入完整且通用文件 policy 允许时直接写入 canonical Skill 目录，不要求先产生 draft/review/apply；详见 [`adr-agent-skill-creator-and-validation.md`](adr-agent-skill-creator-and-validation.md)。
- 运行时投影如 Webview URI、blob URL、cache path 不能进入持久契约。

## 与 Creative Table 的关系

Creative table 不是默认提示词能力，而是 Skill/Profile 能力。

一个 storyboard creative table 至少应覆盖三层创作信息：

| 层     | 目的                                       | 例子                                                                                                     |
| ------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 审阅层 | 用户审阅素材、场景、人物、画面、决策和证据 | `scene`、`shot`、`source`、`sourcePanel`、`decision`、`visual`、`characters`、`dialogue`、`reviewStatus` |
| 计划层 | 后续操作、镜头拆分、去重、补全、生成提示词 | `duration`、`motion`、`prompt`、`decisionReason`、`requiresSplit`、`duplicateOf`、`nextAction`           |
| 执行层 | 真实执行动作、结果引用、状态和诊断         | action id、target、result refs、execution status、diagnostic                                             |

Generic table 可以作为 display-only 兜底，但不能被呈现为 creative table 成功。若 Skill 要求 creative table，validator 应阻止简化表格通过。

## 代码约束

- 默认 prompt snapshot 必须断言不包含 storyboard/Canvas 专用 capability、profile hint 或旧协议名。
- Skill prompt 测试可以断言领域 capability 和 profile hint，但必须同时有 validator requirement。
- `OutputValidator` 只负责通用编排；具体 artifact validator 通过 registry 按 id 执行。
- Skill metadata 中的 `validationRequirements` 只有在对应 validator 已注册时才代表运行时强校验；未注册 requirement 应由 Skill authoring validator 或内置 Skill 测试暴露为 gap。
- 新增 profile validator 时，必须补充至少一个通过 fixture 和一个失败 fixture。
- Artifact validator error 必须 fail-visible，不能受普通 `onValidationFail: "warn"` 或 `"silent"` 掩盖。

## 后果

好处：

- 默认提示词更稳定，不会把旧分镜协议泄漏到所有任务。
- Skill 可独立表达应用场景和输出标准。
- Validator 能阻止“看起来像 Markdown，但不符合生产契约”的输出。
- Canvas/Cut/Model 等领域能力可以共享 lifecycle 形状，又保留自己的 profile 规则。

代价：

- 新增领域表格或计划格式时，需要同步增加 Skill prompt、validator fixture 和 capability descriptor。
- 仅靠 prompt 修改不能保证输出正确；必须补验证。

非目标：

- 不把 validator 变成 compiler。
- 不把默认提示词变成所有领域规则的合集。
- 不要求普通问答型 Skill 都实现 profile validator。
