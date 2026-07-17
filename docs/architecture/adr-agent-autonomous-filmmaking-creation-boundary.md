# ADR: Agent 自主影视创作流程与资源身份边界

- 状态：Superseded
- 日期：2026-06-29
- 适用范围：`neko-agent` IDC runtime、Skill lifecycle、SKILL.md prompt-chain、生成媒体、Canvas/Cut 交付、质量审查和创作文档

> 2026-07-15：本文关于 IDC、固定 Draft/Plan/Apply、creation artifact 路径和 iteration journal 的 canonical 语义已被 [`adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md`](adr-agent-directed-creative-orchestration-and-domain-capability-boundary.md) 取代，仅保留历史背景。创作者文档是普通 Markdown/领域文件，执行与续作只走普通 Agent ReAct、Tool/Task 和 owning output。

本文记录 OpenNeko 对 Agent 自主影视创作流程的系统级边界决策。它补充 [`agent.md`](agent.md)、[`adr-agent-idc-skill-planmode-trigger-boundary.md`](adr-agent-idc-skill-planmode-trigger-boundary.md)、[`adr-agent-skill-catalog-activation-boundary.md`](adr-agent-skill-catalog-activation-boundary.md) 与 [`adr-agent-sandbox-and-external-processing-boundary.md`](adr-agent-sandbox-and-external-processing-boundary.md)。

## 背景

Neko Agent 需要覆盖三类影视创作使用场景：

1. 用户分步骤创作：创作剧本、生成分镜表、人物形象、提示词、生成视频、后期剪辑、音效与质量审查。
2. 按 Skill 流程创作：用户选择某个创作 Skill，将已有剧本、漫画或素材转为分镜、角色、提示词和视频/动画产物。
3. Agent 自主创作：Agent 根据用户对话记录和项目上下文触发 IDC，生成 `brief.md`、`plan.md`、`checklist.md` 等文档，并自主推进创作、生成、修订和审查。

这些场景很容易被误建模成固定 `WorkflowRun` 或一键编排流程。但影视创作具有反复生成、修订、回看、替换素材、调整风格和人工确认的特点。Agent 需要自主判断下一步需要哪些能力，而不是只执行预设流水线。

同时，创作过程包含两类不同对象：

- 文本：剧本、brief、plan、checklist、提示词、分镜草稿等，Agent 可以直接读取、分析和改写。
- 媒体：图片、音频、视频、模型、文档内图片和生成资产，需要稳定资源引用、授权、预览、转码、索引和跨插件传输。

如果把所有内容都资产化，会增加不必要的资源管理复杂度。如果只用文件路径或 `ResourceRef` 追踪过程，又会混淆“创作行为”和“媒体资源身份”。

## 决策

Agent 自主影视创作采用以下核心模型：

```text
Agent Autonomy
  = IDC 创作过程
  + Skill 生命周期
  + SKILL.md prompt-chain 动态指导
  + 文本创作文档
  + 媒体 ResourceRef / assetRef
  + iteration / attempt 过程追踪
```

### 1. Agent 是自主创作导演，不是固定工作流执行器

Agent 负责理解目标、选择能力、组织上下文、请求审批、执行工具、观察结果和修订计划。它可以管理从剧本到分镜、角色、提示词、生成视频、后期剪辑、音效和质量审查的全流程，但管理方式不是独立固定 Workflow engine。

`AgentWorkflowRun`、`IdcRun` 或类似 run 对象可以作为 runtime trace、UI projection、审计或恢复辅助存在，但不应成为影视创作的 canonical domain model，也不应把创作路径锁死为固定 DAG。

推荐的长期创作对象是：

```text
Creation
  creationId
  intent / brief
  textArtifacts
  mediaResourceGraph
  iterations
  eventJournal
```

其中：

| 概念                        | 职责                                                             | 不负责                   |
| --------------------------- | ---------------------------------------------------------------- | ------------------------ |
| `creationId`                | 标识一个长期创作对象，例如一支短片、一个动画片段或一个宣传视频   | 标识单次生成行为         |
| `iterationId` / `attemptId` | 标识一次生成、修订、审查或恢复行为                               | 定位媒体文件             |
| `ResourceRef` / `assetRef`  | 标识可管理媒体资源                                               | 记录完整创作过程         |
| 文本 artifact               | 承载剧本、创作理解稿、执行方案、任务进度、提示词等可直接分析内容 | 承载二进制媒体授权和预览 |

### 2. IDC 是创作过程骨架

IDC 继续作为 Intent-Driven Creation 的阶段控制：

```text
User intent / conversation context
  -> Draft
  -> Plan
  -> Apply
  -> Observe / Evaluate
  -> Revise when needed
```

IDC 的职责是让多步骤、高成本、跨领域、写项目事实或媒体生产请求具备可审查的创作过程。IDC 不选择具体领域 Skill 的业务规则，也不替代媒体资源管理。

多步骤影视创作默认应进入 Draft/Plan；只读文本分析或简单问答可以直接回答或轻量 Apply。

### 3. 创作文档是内容理解、执行方案和进度投影

IDC 生成的 `brief.md`、`plan.md`、`checklist.md` 是 creator-facing 文本 artifact，位于 `neko/creations/<creation-id>/`。三者不是隐藏 runtime state，也不是媒体资源。Agent 可以直接分析其文本内容，宿主服务负责持久化、frontmatter、路径选择和审批边界。

三者职责不同：

```text
brief.md
  = 创作理解稿 / 初稿 / 内容基准

plan.md
  = 执行方案 / 能力路径 / 生产策略

checklist.md
  = 执行进度 / 当前任务状态
```

`brief.md` 不只是轻量创作简报。它是 Draft 阶段的核心创作稿：当用户提供漫画、分镜、剧本、角色设定、参考图或其他素材时，Agent 应将用户意图和素材理解组织为可审阅的创作初稿。它应表达故事主线、人物、场景、情绪、节奏、风格目标、素材来源、不确定点和需要用户确认的创作判断。用户可以基于该初稿决定调整内容，或批准进入后续生产。

`plan.md` 不重新承担内容理解职责。它基于当前 `brief.md`，选择 Skill、工具、媒体生产路径、审批点、风险点和执行顺序，用来说明“如何把这个创作初稿做出来”。

`checklist.md` 不承担策略源职责。它是执行状态投影，用于展示当前待办、进行中、完成和失败项，让用户和 runtime 观察执行进度。

关系如下：

```text
用户意图 + 漫画 / 剧本 / 分镜 / 素材
        ↓
brief.md
  Agent 组织成可审阅的创作初稿和内容基准
        ↓ 用户确认 / 修改
plan.md
  Agent 设计生产路径、能力组合和工具策略
        ↓ Apply
checklist.md
  展示执行进度、失败点和当前状态
```

媒体资源、生成结果、质量审查和 prompt-chain checkpoint 应进入 `CreationIteration` / `CreationEvent` 追踪。`brief.md` 可以引用素材和媒体身份，但不应承载二进制媒体授权、Webview URI、cache path 或完整运行日志。

### 4. Skill 是能力包，prompt-chain 是动态指导

Skill 提供领域方法、prompt fragments、创作语义、输出标准、输入输出 artifact 描述、trust/host requirement 和 SKILL.md 中的 prompt-chain 指导。Portable `allowed-tools` 或 Host overlay dependencies 只能作为机器可读 metadata/policy 输入，不能在 Skill 正文中变成具体工具协议、命令参数或子包 authoring 细节。

prompt-chain 表示 Skill 对执行流程的动态建议，例如先拆剧本、再生成分镜、再检查角色一致性、再生成视频。Agent 可以根据上下文选择执行、跳过、重排、重复或切换 Skill。

Skill 的 portable metadata 和可选 `agents/neko.yaml` 只允许表达发现、兼容性、界面和结构化依赖/关系，不允许承载 workflow 顺序、分支或执行 DSL。source、catalog actions、trust 和 enablement 由 Host/Registry 投影，实际执行判断仍属于 Agent runtime 和 IDC。

### 5. 文本直接分析，媒体走稳定资源引用

文本与媒体采用不同身份策略：

```text
文本 / markdown / brief / plan / checklist / prompt
  -> Agent 直接读写、分析、总结和引用
  -> 使用项目路径、文档名、frontmatter 或 artifact id
  -> 不需要 ResourceRef

图片 / 音频 / 视频 / 模型 / 文档内图片
  -> 使用 DocumentArchiveResourceRef、GeneratedAsset.assetRef 或 ResourceRef
  -> 跨 Canvas/Cut/Storyboard/Preview/Quality Review 时使用稳定媒体引用
  -> 不使用 cache path、Webview URI 或临时绝对路径作为持久身份
```

生成媒体的推荐链路是：

```text
media generation
  -> GeneratedAsset
  -> assetRef for Agent message and perception
  -> promotion / ingest when entering project graph
  -> ResourceRef for Canvas, Cut, Storyboard and later reuse
```

文档内图片的推荐链路是：

```text
ReadDocument
  -> imageInfo[].resourceRef
  -> ReadImage.images[].resourceRef
  -> Storyboard / Canvas / Cut / quality review
```

### 6. 过程追踪不得用 ResourceRef 替代

`ResourceRef` 标识媒体资源，`iterationId` 或 `attemptId` 标识一次创作行为。二者可以互相引用，但不能互相替代。

原因：

- 一次生成可能产生多个媒体资源。
- 一次尝试可能失败、取消或只产生文本分析，没有媒体资源。
- 同一媒体资源可能被多次使用、审查、重剪或作为参考图复用。
- 过程追踪需要记录 prompt、Skill、模型、参数、IDC 阶段、审批、质量结果和失败原因，这些不应塞入 `ResourceRef`。

推荐的过程记录形态是：

```ts
interface CreationIteration {
  readonly iterationId: string;
  readonly creationId: string;
  readonly idcStage?: 'draft' | 'plan' | 'apply';
  readonly activity:
    'analyze' | 'plan' | 'generate' | 'edit' | 'review' | 'repair' | 'handoff' | 'observe';
  readonly reason?: string;
  readonly skillRecordIds: readonly string[];
  readonly promptChainId?: string;
  readonly textInputs: readonly string[];
  readonly textOutputs: readonly string[];
  readonly mediaInputs: readonly string[];
  readonly mediaOutputs: readonly string[];
  readonly status: 'running' | 'completed' | 'failed' | 'cancelled';
  readonly diagnostics?: readonly string[];
}
```

这里的 `idcStage` 只引用 IDC 的三阶段归属；`activity` 描述本次创作行为类型。Observe/Evaluate/Revise 不应被固化为新的 IDC stage：质量审查可记录为 `activity: 'review'` 或 `activity: 'observe'`，修订可记录为 `activity: 'repair'`、`activity: 'edit'` 或具体 `reason`。`mediaInputs` 和 `mediaOutputs` 存放媒体资源引用的 compact id 或 ref 摘要，而不是把 iteration 本身变成资源。

### 7. 三类用户场景共享同一底层模型

用户分步骤创作时，Agent 应尊重用户显式节奏，但每一步内部仍由 IDC、Skill lifecycle 和工具策略控制。

按 Skill 流程创作时，显式 `$skill` 或 Webview `invokeSkill` 激活的是领域能力与 prompt-chain 指导。创作类 Skill 必须携带 IDC entry metadata，不能只注入 Skill prompt 后直接生成媒体。

Agent 自主创作时，Agent 可以根据对话和项目上下文创建或更新 `brief.md`、`plan.md`、`checklist.md`，并在 Apply 阶段生成媒体、交付 Canvas/Cut、触发质量审查和继续修订。

三者差异只是入口不同：

```text
step-by-step user control
skill-guided creation
agent-autonomous creation
        |
        v
IDC + SkillLifecycle + TextArtifacts + MediaResourceGraph + Iterations
```

### 8. 质量审查属于 Observe/Evaluate

影视创作质量审查应作为 IDC Observe/Evaluate 的一等能力，而不是隐藏在某个 Skill 的私有流程里。

审查对象包括：

- 剧本和分镜连贯性。
- 角色形象、声音和关系一致性。
- 分镜覆盖、镜头顺序、时长和节奏。
- 图片/视频质量、构图、运动、闪烁和伪影。
- 音频、配音、音效和字幕匹配。
- Canvas/Cut/Storyboard handoff payload 是否完整。
- 媒体资源是否都有稳定 ref、可预览、可复用。

质量审查可以由 Skill 提供策略和 checklist，但审查结论、诊断和修复建议应回到 IDC observation 和 iteration journal。

### 9. `agent-workflow-runtime` 应退役为兼容投影

`agent-workflow-runtime.ts` 这类固定 `AgentWorkflowDefinition`、`AgentWorkflowRun`、node transition 的具体运行时不应继续作为创作过程的身份锚点。它可以短期保留为 UI projection、trace 或兼容层，但不应承载新的影视创作语义，也不应成为 `Creation`、媒体追踪或质量审查的依赖。

需要区分两个概念：

```text
应退役：
agent-workflow-runtime.ts
  -> 固定 workflow definition / run / node transition 小运行时

不应直接删除：
runtime.workflowRuntime 配置面
  -> stageTracking / idcTaskProjection / controlPlane 等 session bootstrap 通道
```

迁移策略是先降级、再替换、最后删除：

1. 短期将 `agent-workflow-runtime.ts` 限定为 legacy projection/compat，不新增调用方。
2. P0 `Creation` / `CreationIteration` contract 落地后，媒体追踪、prompt-chain checkpoint、质量审查和 iteration journal 使用 `creationId` / `iterationId`，不使用 `workflowRunId` 作为身份锚点。
3. 可复用的 IDC stage 判断函数应迁入 IDC/stage policy；可复用的 projection helper 可保留为 trace helper，但不得表达创作决策。
4. 当生产路径不再依赖 `createAgentWorkflowRuntime` / `AgentWorkflowRuntime` 后，删除具体 runtime 和对应 legacy tests。

目标形态：

```text
Creation / Iteration      = canonical 创作模型
IDC stage runtime         = 创作阶段控制
SkillLifecycleRuntime     = 能力激活/失效
PromptChain events        = checkpoint / skip / reorder / completion
ResourceRef / assetRef    = 媒体资源身份
Workflow projection       = 可选 UI/兼容投影，不参与决策
```

## 当前实现差距

当前代码和文档已经具备正确方向，但仍有以下收敛点：

1. `AgentWorkflowRun` 与 `IdcRun` 并存。需要明确它们是 runtime projection、trace 或 audit，不是影视创作 canonical object；具体 `agent-workflow-runtime.ts` 应退役为兼容投影并最终删除。
2. `creationId`、`iterationId`、文本 artifact、媒体 `ResourceRef` 之间尚未形成统一创作模型。
3. Skill lifecycle 正在向 `SkillLifecycleRecord[]`、slot 和 lifetime 收敛，影视创作需要确保 `stagePersona`、`domainSkill`、`referenceSkill`、`workflowSkill` 不互相覆盖。
4. prompt-chain 的读取、执行检查点、跳步、重排和结果记录还需要形成可测试 contract，避免变成隐藏 workflow engine。
5. 文档图片和部分生成媒体已有稳定资源链路，但需要端到端确认生成、Storyboard、Canvas、Cut、Preview、质量审查都不回退到 cache path、Webview URI 或临时绝对路径。
6. 文本 artifact 与媒体 artifact 的边界需要在 schema、工具说明和测试中固定，避免把 `brief.md`、`plan.md`、`checklist.md` 误资产化。
7. 影视质量审查需要与 IDC Observe/Evaluate 和 iteration journal 建立更明确的契约。

## 后续收敛方向

当前 IDC 阶段、创作文档路径、Skill 生命周期和事件频道已有骨架。后续收敛应优先补齐 Creation 域模型、prompt-chain 追踪和媒体 `ResourceRef` 路径级验证。

| 优先级 | 收敛项                                                                            | 目标                                                                                                                                         |
| ------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| P0     | 在 `agent-types` 定义 `Creation` / `CreationIteration` / `CreationEvent` contract | 作为媒体追踪、质量审查、iteration journal 和后续 UI projection 的锚点                                                                        |
| P1     | 为 prompt-chain 建立最小可测试 contract                                           | 记录 checkpoint、skip、reorder 和 completion 事件，证明 Agent 动态执行而不是固定 workflow                                                    |
| P2     | 建立端到端媒体路径测试                                                            | 覆盖生成媒体 -> Storyboard -> Canvas -> Cut -> Preview，全程使用 `ResourceRef` / `assetRef`，不回退到 cache path、Webview URI 或临时绝对路径 |

补充收敛方向：

- 将 `AgentWorkflowRun` 限定为 UI projection、trace 或兼容层；若保留 `IdcRun`，也应限定为 IDC runtime trace。具体 `agent-workflow-runtime.ts` 先降级为 legacy compat，不再新增创作语义，待 `Creation` contract 接管身份锚点后删除。
- 为创作类 Skill 增加更清晰的 IDC entry metadata、默认 slot 和 prompt-chain observation contract。
- 为媒体生产工具增加 preflight，检查 active IDC context、审批状态、source refs、provider availability 和输出 promotion 策略。
- 为生成媒体建立统一 promotion 规则，确保进入项目图或跨插件交付前拥有 canonical `ResourceRef`。
- 为文本 artifact 明确“直接分析”边界，保留普通项目文件路径、frontmatter 和 artifact id，不引入媒体资源 ref。
- 为质量审查增加领域 validator，覆盖 StoryboardTable、ShotImagePrepPlan、Canvas payload、Cut handoff 和生成媒体诊断。

## 后果

该决策让 Agent 能管理完整影视创作流程，同时避免把系统退化成固定工作流编排器。它把创作行为、文本内容和媒体资源拆成不同身份层，降低了资源管理、Skill 扩展和 IDC 过程控制之间的耦合。

代价是 runtime 需要维护更清晰的 projection 和 trace 边界，尤其要防止 `WorkflowRun`、`IdcRun`、`ResourceRef` 和 `SkillLifecycleRecord` 互相抢占职责。相关实现应优先 fail-visible，并通过路径级测试证明 canonical IDC、Skill lifecycle 和媒体 ResourceRef 链路被命中。
