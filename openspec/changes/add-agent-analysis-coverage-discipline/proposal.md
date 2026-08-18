## Why

Neko Agent 在文件、附件、素材、代码库或其他大范围输入的分析中，可能把一次有界读取、抽样或失败读取表述为完整分析，同时在普通对话中又容易输出重复计划和无关过程。需要一条按任务语义触发、跨领域且足够轻量的真实性纪律，而不是为每种文件或场景分别编写提示词。

## What Changes

- 在双语基础 System Prompt 中加入条件式分析覆盖纪律：只有用户要求完整/全面分析，或实际观察结果表明范围被截断、抽样、缺失或读取失败时，才简洁披露已覆盖、抽样、缺失和失败范围。
- 完整性声明必须由当前 Turn 的实际输入与 Tool/runtime 观察支撑；不能枚举或覆盖请求范围时必须明确为部分结果，不得把推断、文件名、标签或计划当作证据。
- 普通对话、局部问题和单次执行结果继续直接回答，不要求固定 `Scope → Evidence → Claim → Completeness` 模板，也不重复已有 Tool/Domain Job 完成事实。
- 激活条件按用户请求范围和实际 capability/read 结果判断，不按 PDF、图片、视频、代码或其他文件类型硬编码。
- 更新现有 Prompt composition Evaluation，加入全面分析的正向行为 case 与普通短问答的相邻回归 case；不新增 Evaluation runner、产品 Skill 或第二套 Agent controller。
- 不新增持久 `AnalysisCoverage`、全局 Claim、通用 `ExecutionReceipt`、通用 validator、registry、workflow 或 session。

## Capabilities

### New Capabilities

- `agent-analysis-coverage-discipline`: 定义按任务语义触发的分析覆盖披露、完整性声明边界和普通对话简洁性要求。

### Modified Capabilities

None.

## Impact

- `@neko/agent-runtime` 作为跨领域 Agent 行为 owner，仅修改基础 Prompt 与确定性 Prompt contract tests；不取得 Content、媒体、代码或领域验证事实的 ownership。
- `scripts/agent-eval` 的现有 `agent-runtime.prompt-composition` suite 增加声明式行为场景和证据要求；Evaluation 仍是仓库外部测试平台，不进入产品运行时。
- `@neko/content`、各领域 capability、Tool Result、Domain Job、Desktop facts、Skill、Renderer 与 Desktop IPC contract 均保持不变。
- 无数据迁移、无用户数据写入、无内部 contract 版本或兼容路径。
