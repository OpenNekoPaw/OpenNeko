---
name: 'media-production'
description: '基于故事、剧本、分镜或视觉来源完成改编判断、媒体创意与镜头主线设计；不负责参考素材预处理、生成、后期或交付编排。 Design source-grounded adaptation decisions, media concepts, and shot spines without owning reference preparation, generation, post-production, or delivery orchestration.'
---

# Media Production

## 中文方法

把真实来源转译为可评审的媒体创意、改编边界与镜头主线，不代替其他专业能力。

1. 先读取真实来源和项目状态，区分观察事实、Agent 解释、创作者决定与拟议动作；复用仍有效的分镜、角色参考、资产、修订和已验证结果。
2. 格式、集数和时长决策前读取 [适配可行性与体量指南](references/adaptation-feasibility.md)。页数、目录、封面或任意少量页面不能直接证明全卷体量；代表性样本只能形成带方法、不确定性和置信度的暂定区间。
3. 只决定叙事、视觉、动作、声音与节奏如何服务当前媒体目标；参考素材准备、模型提示词、生成、候选选择、后期和交付分别由对应 Skill 处理。
4. 只有改编目标、故事/角色变化、核心风格、主要技术、成本风险、修改范围和交付边界等实质选择才要求创作者确认。
5. 向下游提供已确认的创意决定、稳定来源/镜头引用和必须保持的连续性，不输出跨 Skill 制作流程。

## 请求路由与输出表面

先判断本能力当前要交付的媒体创意内容：

- **创意设计**：交付可供创作者评审的核心概念、叙事或体验主线、关键节拍，以及真正决定画面、动作、声音或剪辑的选择。后续模型调用由对应生成能力根据这些决定编译。
- **镜头主线**：交付场景或镜头的因果节拍、视听决定、连续性要求与来源绑定。
- **生产决策**：只确定会改变创意方向的格式、范围、主要技法和取舍，不编写其他 Skill 的执行参数。
- **评估**：只给会改变决定的结论、证据边界、关键未知项和下一项证据动作。

不得未经创作者确认改变用户已指定的片长、格式、叙事目标或交付类型。证据不足限制的是事实声明和承诺范围，不是删除已经核验且能支持当前创意决定的素材。

把协作过程和正式产物分开：

- Agent 对话只保留简短进度、决定性依据、真实阻塞和需要创作者确认的选择。
- 生成的文档或项目产物只保留已验证的创作决定、可使用内容、必要来源绑定和适用的执行交接；不写读取过程、工具日志、工作进度、内部检查或被否决的分析。
- 用户明确要求把分析、研究或审计本身作为交付物时，分析才进入正式产物；“分析素材并设计作品”表示分析是内部证据工作，不构成分析报告请求。

交付前在内部删除任何不改变创意内容、模型输入、验收、下游使用或创作者决定的段落。不要在文档中解释这项删除规则，也不要给每条内容标注“消费者”。

时序媒体创意方案使用一份权威节拍或镜头序列承载时间、画面、动作、声音与转场。镜头内容已经在序列中成立时，不再拆出“来源分析”“关键镜头”“视觉系统”“声音设计”逐项复述；跨镜头不变量只集中写一次，镜头特有约束留在对应镜头。来源证据只作为紧邻决定的绑定或末尾一句边界说明，不单列分析章节，除非用户明确要求分析报告。

时序概念设计默认正文只保留两块：① 一段核心概念、体验主线和至多四项真正约束后续镜头的不变量，不列来源依据清单；② 一份权威节拍序列，60–90 秒概念片默认用 6–8 个因果节拍，不把每个摄影动作拆成独立镜头行。只有用户明确要求详细分析报告或完整制作规格时才扩展；不得通过三级标题或粗体字段把分析、声音、制作、技术、关键镜头、验收、来源或评审问题重新扩写成小章节。未阻塞下一步的开放选择放在对话摘要，不进入正文。

当系统把请求判定为 AI 生产交接或执行时，本能力只返回下游必须消费的镜头决定、来源引用与连续性要求，并把本次结果视为中间依赖；不得以“概念方案已完成”或“等待确认”结束整个请求。系统推理应继续选择素材预处理、图像、视频、声音、后期或交付 Skill；不要在本 Skill 内代写它们的 prompt、operation、参数、验收或流程。

## English guidance

Use this capability for source-grounded adaptation judgment, media concepts, and shot spines. It owns creative decisions and source boundaries, not cross-Skill orchestration.

Keep collaboration and the durable artifact separate. Conversation updates may state concise progress, decisive rationale, blockers, and creator decisions. A generated document contains validated creative content and applicable handoff data, not source-review narration, Tool logs, progress, internal checks, or rejected reasoning. Analysis belongs in the document only when the user explicitly requests analysis, research, or audit as the deliverable; “analyze the source and design the work” keeps analysis as internal evidence work.

For time-based creative proposals, keep one authoritative beat or shot sequence for timing, image, action, sound, and transitions. Do not restate the same decisions in separate source-analysis, key-shot, visual-system, or sound-design sections. State cross-shot invariants once and keep shot-specific constraints with their shot. Bind evidence next to the decision it supports or reduce the evidence boundary to one closing sentence unless the user requested an analysis artifact.

For a time-based concept, default to two blocks: one concept paragraph plus at most four true cross-shot invariants and no evidence inventory; then one authoritative causal beat sequence, normally six to eight beats for a 60–90 second concept. Expand only when the user explicitly requests a detailed analysis report or full production specification. Do not recreate analysis, sound, production, technology, key-shot, acceptance, source-binding, or creator-question mini-sections through nested headings or bold field groups.

When the system classifies the request as an AI-production handoff or execution request, expose only the creative decisions, stable source or shot references, and continuity requirements that the next capability must consume, and treat this result as an intermediate dependency rather than the completed turn. System reasoning composes preparation, generation, selection, post-production, and delivery Skills; this Skill does not write their prompts, operations, parameters, acceptance packets, or workflow.

## Evidence and creator review

1. Read the actual source and existing project state before planning. Separate observed facts, Agent interpretation, creator decisions, and proposed actions. Never treat a filename, prompt, thumbnail, or old plan as content evidence.
2. Reuse current Storyboards, character references, approved documents and validated creative decisions when they remain valid.
3. Ask the creator to approve only material choices: adaptation target and omissions, story or character changes, core visual style, primary image/video/audio technique, cost or risk ceiling, mutation scope, and delivery boundary. Keep unresolved choices visible only when they affect the current artifact or next action.
4. A simple low-risk operation may proceed without creating planning files. For complex work, an optional `brief.md` may capture source evidence, interpretation, alternatives, creator decisions, and approval scope; it remains ordinary reviewable Markdown, not runtime state.

Ground each source in its own evidence: comics use actual page, panel, reading-order, dialogue, and character appearance evidence; screenplays use scene headings, action, dialogue, location, and timing intent; novels use chapter or scene boundaries, point of view, narration, dialogue, and adaptation omissions; illustrations use visible composition, subjects, layers when available, palette, and spatial relationships. Existing Storyboards and projects use their current revision, owned shots or timeline state, referenced assets, and validation evidence. When those existing facts already satisfy a work unit, mark it skipped or reused rather than rebuilding it.

For adaptation scope, format, episode count, or runtime estimation, read [references/adaptation-feasibility.md](references/adaptation-feasibility.md). Do this before turning a source manifest, page count, chapter list, synopsis, or visual sample into a season, film, episode, or duration plan.

## Adaptation scope gate

Do not invent a fixed source-wide format from insufficient evidence. A representative bounded sample may support a provisional range with its method, uncertainty and confidence stated. Preserve all already verified evidence that is relevant to the requested creative artifact; incomplete whole-source coverage does not force the design to ignore usable early, middle, or late evidence. Keep a candidate format conditional until broader coverage or creator approval supports it.

Do not turn temporary execution details into creative truth. On continuation, reread current source, Storyboard and approved decisions before revising the concept.
