## Context

当前双语基础 Prompt 已要求 Tool 真实性、事实与推断分离、真实执行结果和最小完成证据，但没有明确约束“分析覆盖范围”与“完整性声明”。`ReadDocument` 和各领域 capability 已拥有 manifest、cursor、truncation、segment、duration、module 或失败 diagnostic 等真实事实；Tool Result、Domain Job 和 Desktop facts 也已分别拥有执行终态。缺口是模型如何把这些事实投影为诚实且简洁的回答，而不是新的运行时 authority。

本变更与 `add-agent-content-document-handoff` 正交：后者约束普通文档的持久写入与完成声明，本变更只约束分析范围和回答内容。工作区中已有 Prompt 与 Evaluation 修改必须保留，本变更只追加最小差异。

## Goals / Non-Goals

**Goals:**

- 让文件、附件、素材、代码库和其他大范围输入共享同一套按任务语义触发的覆盖真实性纪律。
- 用户要求完整/全面分析，或实际观察显示截断、抽样、缺失或失败时，要求简洁披露覆盖边界。
- 保持普通对话、局部问题和执行结果简洁，不把所有回答转换为固定审计模板。
- 通过确定性 Prompt tests 和现有真实 Desktop Evaluation suite 验证正向与相邻负向行为。

**Non-Goals:**

- 新增持久 `AnalysisCoverage`、Claim、Completeness、ExecutionReceipt 或跨领域 DTO/service/store。
- 修改 Content、媒体、代码、Search 或其他领域 capability 的读取契约。
- 新增通用 validator、profile registry、workflow、session、planner 或第二个 Agent controller。
- 按文件扩展名、MIME 或素材类型路由行为。
- 把 runtime Tool 协议或字段表写入 Skill content。

## Decisions

### 1. 基础 Prompt 拥有条件式真实性纪律

`@neko/agent-runtime` 的双语基础 Prompt 是该行为的唯一生产 owner，因为规则跨越所有领域和 Skill。Prompt 规定：

- 回答只可基于当前 Turn 实际观察到的输入和 Tool/runtime 结果；
- 当用户要求完整/全面，或观察结果显示截断、抽样、缺失或失败时，简洁说明已覆盖、抽样、缺失和失败部分；
- 只有请求范围可判定且全部由实际观察支撑时，才可声明完整；范围不可枚举或未覆盖时必须声明部分；
- 普通对话、局部问题和已有终态结果的单次执行不输出 coverage boilerplate。

该 Prompt 不规定固定标题、JSON shape、字段顺序或具体工具名。相比为每类文件创建 Skill 规则，这一选择能保持跨领域一致；相比强制 `Scope → Evidence → Claim → Completeness`，它避免普通回答膨胀。

### 2. 领域 owner 继续提供事实，Agent 只做 turn-local 投影

Content、媒体、代码、Search 和其他 capability 继续拥有 manifest、segment、cursor、truncation、统计和 diagnostic。Agent 根据当前 transcript 中已有的实际结果生成一次性回答；不复制、持久化或双写这些事实。

如果未来出现跨重启继续分析、可查询审计历史或跨会话共享覆盖计划的真实消费者，应由相应领域 Job 或 durable artifact owner 通过独立 OpenSpec 建模。当前不预留 store、repository、registry 或兼容字段。

### 3. 执行完成继续使用现有权威

普通 Tool Result、可恢复 Domain Job snapshot 和 Desktop facts 继续分别证明执行与 Evaluation 路径。本变更不新增 `ExecutionReceipt`，也不要求通用 `verification` 字段。正式 durable artifact 的 correctness 仍由 owning-domain validator 负责；普通聊天不进入 validator。

### 4. Evaluation 更新现有 Prompt owner suite

行为变化映射到 `agent-runtime.prompt-composition`，authoring disposition 为 `update`：

- canonical case 只提供一个要求分析完整集合的请求、两项实际内容和一项不可用事实；由基础 Prompt 驱动回答识别缺失范围并避免完整声明，case assertion 负责拒绝反例；
- regression case 只提供普通、窄范围短问答和稳定 marker；由基础 Prompt 驱动直接回答，case assertion 负责拒绝覆盖清单或审计模板；
- 两个 case 都证明 base Prompt fragment 参与真实 Desktop complete-session 路径，并使用 final-answer hard gates；不新增 runner、case handler、mock provider 或 direct turn path。

确定性 `SystemPromptBuilder` tests 只证明双语规则存在且同时包含触发与抑制条件。它们不能替代 provider-backed 行为证据。

### 5. Ownership 与运行边界

| Owner / package role | Canonical path | Producer → consumer | Runtime boundary | Replaced path | User-data impact |
| --- | --- | --- | --- | --- | --- |
| `@neko/agent-runtime` base Prompt | `packages/agent/runtime/src/prompt/builtin-prompts.ts` | Prompt constant → `SystemPromptBuilder` / Pi provider Turn | Host-neutral Agent runtime | 仅补足现有未明确的分析覆盖纪律；无旧实现并行保留 | 无持久写入 |
| Agent Evaluation platform | `scripts/agent-eval/suites/agent-runtime/prompt-composition/` | declarative Scenario → Desktop complete-session runner | 仓库外部本地测试平台 | 更新现有 suite，不新建 runner | 仅隔离 fixture/report |

`apps/neko-desktop` 无生产修改；Desktop 仍只组合和投影 Agent runtime，不拥有分析策略。

## Risks / Trade-offs

- [模型把条件式规则扩展为所有回答的固定模板] → 用普通短问答相邻回归 case 和明确抑制文案约束。
- [模型在长输入中仍错误声明完整] → 用缺失范围 canonical case 验证；若真实 Evaluation 证明 Prompt 不稳定，再单独评估轻量无状态 contract，不提前实现。
- [模型输出过多 segment 明细] → Prompt 要求简洁披露，不要求完整 segment 列表；只有影响结论的缺失或失败需要呈现。
- [现有未提交 Prompt/Evaluation 改动被覆盖] → 实施必须基于当前工作树增量编辑，并在 diff 审查中确认已有 handoff 规则与 cases 均保留。
- [字符串 hard gate 无法评价所有表达质量] → hard gate 只验证明显的完整性和冗余边界；主观专业度需要真实样本与后续 Judge 证据，不能由单次测试宣称。

## Migration Plan

1. 原子追加双语基础 Prompt 纪律和确定性测试。
2. 更新现有 prompt-composition suite contract hash，并加入两个声明式 cases。
3. 运行 focused unit tests、Evaluation key-free harness 和 all-suite dry-run。
4. 在本地 provider/model/cost 授权可用时运行 focused real Desktop case；不可用时记录 `infrastructure-blocked`，不得以 key-free 结果替代。

回滚只删除本变更追加的 Prompt 段落、测试与两个 Evaluation cases，不触碰现有文档 handoff、Tool、Job、Skill 或用户数据。

## Open Questions

None. 只有真实 Evaluation 证明纯 Prompt 无法稳定约束行为时，才重新开启是否需要轻量机器可读投影的设计决策。
