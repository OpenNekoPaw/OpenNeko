---
name: content-authoring
description: '仅编写或重组用户明确要求的创作方案、分析报告、企划书、执行计划或提示词交接文档；不代替编剧、分镜、媒体生成或制作编排。 Write or restructure only explicitly requested creative documents or prompt handoffs; never substitute for screenplay, storyboard, media generation, or production orchestration.'
---

# Content Authoring

## 中文方法

默认使用用户语言，直接交付用户要的文档内容。保留适用领域 Skill 已经得出的创作判断、来源绑定、能力边界和产物语义；本 Skill 只负责让它们易于阅读、评审或交接，不创造另一套制作流程。

先确定用户请求的是创意方案、分析报告、项目企划、执行计划还是提示词交接，只生成这一种主产物。创意方案保留核心概念、主线、关键节拍和决定性内容选择；只有执行计划或提示词交接才以模型调用字段为主体。不得为了“可执行”把创意方案压缩成单个技术测试。

交付深度必须匹配证据阶段。若核心决策依赖尚未审查的全局来源事实，先给有边界的评估或决策备忘录；代表性样本只有在样本选择、方法、不确定性和置信度可见时才能支持暂定区间。不要用猜测填满正式提案，也不要把局部抽样描述成完整分析。

不因为用户谈到“创作”就添加目标、背景、方法、步骤、风险、验收等通用章节。只保留对该文档真正有用的部分。映射或比较明显更清楚时才使用表格；流程、字段和检查表不是默认产物。

将协作对话与正式文档分开。对话可以简短说明进度、决定性依据、阻塞和待确认选择；写入文档的内容只包括已验证结论、可直接使用的创作内容、必要来源绑定和适用的执行交接。读取过程、工具日志、工作进度、内部检查和被否决分析不进入文档。只有用户明确要求分析、研究或审计报告时，分析过程才属于正式产物。

不预告将如何组织回答，不复述任务。把“是否影响创意内容、模型输入、验收、下游使用或创作者决定”作为内部编辑检查；无法通过的内容删除，不在文档中逐条解释用途或标注消费者。涉及 AI 内容创作时，文档编辑不得把领域 Skill 已形成的可调用输入、资产绑定、验收和下游用途降级为概括性文字。

只读取本次交付需要的指南：创作方案、分析报告、企划书、执行计划、提示词包或模型/工具交接。多个领域 Skill 可以同时适用，不指定唯一主 Skill，也不重复同一指导。

## English guidance

Write in the user's language unless they request another language.

Deliver the requested document content directly. Preserve creative decisions, source bindings, capability boundaries, and artifact semantics supplied by applicable domain Skills. This Skill improves readability, review, and handoff; it does not invent a production workflow.

Choose one primary artifact type: creative proposal, analysis report, project proposal, execution plan, or prompt handoff. Preserve concept, spine, decisive beats, and content choices in a creative proposal. Make model-call fields primary only for an execution plan or prompt handoff; do not reduce creative design to one technical test.

Match the deliverable to the evidence stage. If a proposal's central decision depends on source-wide facts that have not been reviewed, provide a bounded assessment or decision memo first. A representative sample may support a provisional range when its selection, method, uncertainty and confidence are visible. Do not fill a formal proposal with guessed scale, sections, or commitments, and do not describe sampled material as a completed source analysis.

Do not add generic goal, background, method, workflow, risk, or acceptance sections merely because the subject is creative. Keep only sections that materially serve the requested document. A table is useful for real repeated mappings or comparisons, not as proof that the document is actionable.

Keep collaboration separate from the formal document. Conversation may briefly state progress, decisive rationale, blockers, and creator choices. The document contains validated conclusions, directly usable creative content, necessary source bindings, and applicable handoff data; it excludes source-reading narration, Tool logs, progress, internal checks, and rejected reasoning. Analysis belongs in the artifact only when an analysis, research, or audit report was explicitly requested.

Do not announce the response structure or restate the task. Internally remove content that does not affect creative content, model input, acceptance, downstream use, or a material creator decision. Do not expose this consumer test as document labels or explanation. For AI content work, preserve call-ready inputs, asset bindings, acceptance, and downstream use supplied by the domain Skill instead of collapsing them into summary prose.

Read only the guide needed for the current deliverable:

- Creative proposal: [references/creative-proposal.md](references/creative-proposal.md)
- Analysis report: [references/analysis-report.md](references/analysis-report.md)
- Project proposal: [references/project-proposal.md](references/project-proposal.md)
- Execution plan: [references/execution-plan.md](references/execution-plan.md)
- Prompt package: [references/prompt-package.md](references/prompt-package.md)
- AI model or creative-Tool handoff: [references/model-tool-handoff.md](references/model-tool-handoff.md)

Multiple guides or domain Skills may apply. Preserve their independently useful judgment; do not appoint one primary Skill or duplicate the same guidance across sections.
