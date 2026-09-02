---
name: 'media-production'
description: '基于故事、剧本、分镜或视觉来源完成改编判断、媒体创意、镜头主线与制作规格设计；不负责参考素材预处理、生成、后期执行或交付编排。 Design source-grounded adaptation decisions, media concepts, shot spines, and production specifications without owning reference preparation, generation, finishing execution, or delivery orchestration.'
---

# Media Production

## 中文方法

把真实来源转译为可评审的媒体创意、改编边界与镜头主线，不代替其他专业能力。

1. 先读取真实来源和项目状态，区分观察事实、Agent 解释、创作者决定与拟议动作；复用仍有效的分镜、角色参考、资产、修订和已验证结果。
2. 格式、集数和时长决策前读取 [适配可行性与体量指南](references/adaptation-feasibility.md)。页数、目录、封面或任意少量页面不能直接证明全卷体量；代表性样本只能形成带方法、不确定性和置信度的暂定区间。
3. 只决定叙事、视觉、动作、声音与节奏如何服务当前媒体目标；参考素材准备、模型提示词、生成、候选选择、后期和交付分别由对应 Skill 处理。
4. 只有改编目标、故事/角色变化、核心风格、主要技术、成本风险、修改范围和交付边界等实质选择才要求创作者确认。
5. 向下游提供已确认的创意决定、稳定来源/镜头引用和必须保持的连续性，不输出跨 Skill 制作流程。
6. 读取前先在内部确定当前创意单元必须证明的决定；每项决定获得直接来源证据后立即停止取样。单个镜头或完整连续场景通常先用一批不超过四张不同页面筛选，高清确认只限入选页面。卷级、章节集或其他来源整体的改编判断必须先按 [适配可行性与体量指南](references/adaptation-feasibility.md) 建立分层覆盖：至少包含前段建立、中段发展/升级、后段后果/方向，并为任何作为 PV 主线的事件读取一个连续局部序列；封面、目录、孤立开头或结尾页不计为叙事覆盖。四张是单批推理上限，不是整部来源的总取样上限。当前授权读取能力可用时，在同一请求内继续完成必要批次，不把可执行的抽样计划当成交付结果。不得为了显得完整而重复读取相同职责的页面，或把未使用的发现写进产物。

卷级或来源整体方案在成稿前必须通过内部覆盖验收。为每个必要区域记录“来源范围、连续叙事单元、观察事实、被支持或改变的创作决定、置信度/未知项”；只有前段、中段和后段分别提供了不同的有效决定，所有选入主线的事件都由起因—行动—后果的连续证据成立，并且最终方案实际吸收或明确排除这些发现，才算覆盖通过。增加读取数量但没有改变或验证决定，不计为有效覆盖。覆盖未通过时，把产物标题和结论缩小为开篇、局部场景或已选序列概念，不得称为“全卷核心”“卷级代表”或完整改编。覆盖记录留在内部；正式创作文档只保留被验证的决定与必要边界。

内部证据必须分别标记来源中直接观察到的事实、基于事实的解释，以及为 PV 新提出的创作重组。系统反应、武器蓄能、人物被逼入死角、敌人先开火等未被连续来源证据证明的内容，只能作为拟议的 PV 创作重组并接受创作者评审，不得伪装成原作事实。

## 请求路由与输出表面

先判断本能力当前要交付的媒体创意内容：

“分析来源并设计/改编一个概念、方案或 PV”默认属于创意设计，不自动升级为完整制作规格、模型输入准备或生成交接。只有用户明确要求主制作规格、逐生产单元设计、AI 生产交接或执行时，才进入对应更深的交付边界。

- **创意设计**：交付可供创作者评审且能继续进入分镜或生产准备的创意合同。它必须由来源特有的前提或钩子驱动，明确作品要让观众经历什么，并按题材需要落实主体/角色目标、场景作用、冲突或信息递进、高潮与收束，以及真正决定画面、动作、声音、表演或剪辑的选择。后续模型调用由对应生成能力根据这些决定编译。
- **镜头主线**：交付场景或镜头的因果节拍、视听决定、连续性要求与来源绑定。
- **完整制作规格**：交付一份权威主文档，覆盖创作合同、必要的人物/场景连续性、逐生产单元的镜头设计与输入需求，以及适用的后期/交付合同；按需读取 [时序媒体制作规格指南](references/time-based-production-specification.md)。不把分析、预处理、生成和后期拆成重复文档。
- **生产决策**：只确定会改变创意方向的格式、范围、主要技法和取舍，不编写其他 Skill 的执行参数。
- **评估**：只给会改变决定的结论、证据边界、关键未知项和下一项证据动作。

不得未经创作者确认改变用户已指定的片长、格式、叙事目标或交付类型。证据不足限制的是事实声明和承诺范围，不是删除已经核验且能支持当前创意决定的素材。

把协作过程和正式产物分开：

- Agent 对话只保留简短进度、决定性依据、真实阻塞和需要创作者确认的选择。
- 素材抽样计划、下一批读取安排和不改变当前方案的中间证据结论留在内部，不作为过程说明逐批输出。
- 生成的文档或项目产物只保留已验证的创作决定、可使用内容、必要来源绑定和适用的执行交接；不写读取过程、工具日志、工作进度、内部检查或被否决的分析。
- 用户明确要求把分析、研究或审计本身作为交付物时，分析才进入正式产物；“分析素材并设计作品”表示分析是内部证据工作，不构成分析报告请求。

交付前在内部删除任何不改变创意内容、模型输入、验收、下游使用或创作者决定的段落，但不得以精简为由删除理解作品所需的故事因果、角色/主体作用、场景关系、视听策略或连续性决定。不要在文档中解释这项删除规则，也不要给每条内容标注“消费者”。

时序媒体创意方案使用一份权威节拍或镜头序列承载时间、画面、动作、声音与转场。镜头内容已经在序列中成立时，不再拆出“来源分析”“关键镜头”“视觉系统”“声音设计”逐项复述；跨镜头不变量只集中写一次，镜头特有约束留在对应镜头。来源证据只作为紧邻决定的绑定或末尾一句边界说明，不单列分析章节，除非用户明确要求分析报告。

时序概念设计使用完成当前创意判断所需的最小完整结构，而不是固定章节模板。60–90 秒叙事型概念片通常需要：一个来源特有的核心命题与观众体验主线；能约束后续制作的角色/主体、场景和视听连续性；一份 6–8 个因果节拍的权威序列，承载时间、画面、动作、声音与转场。内容可以合并进概念段或节拍表，但不能把角色目标、叙事钩子、冲突/信息递进和高潮后果压缩成可替换到其他作品的氛围形容。只有真实需要时才增加独立小节；不得用来源分析、声音、技术、关键镜头、验收或评审问题等重复章节复述已在权威序列中成立的决定。未阻塞下一步的开放选择放在对话摘要，不进入正文。

完整制作规格不是概念方案的重复扩写。使用一份主文档，集中保存全片创作合同、会跨镜头复用的人物/场景连续性、一份同时承载剧情作用、画面动作、摄影声音、输入需求、生产方式与直接验收的权威镜头表，以及只出现一次的后期与交付合同。分析过程不进入正文；没有后续消费者的背景信息不写。实际素材、任务状态、候选结果、失败记录和导出回执仍由 owning capability 保存，不复制成文档章节。

当系统把请求判定为 AI 生产交接或执行时，本能力只返回下游必须消费的镜头决定、来源引用与连续性要求，并把本次结果视为中间依赖；不得以“概念方案已完成”或“等待确认”结束整个请求。系统推理应继续选择素材预处理、图像、视频、声音、后期或交付 Skill；不要在本 Skill 内代写它们的 prompt、operation、参数、验收或流程。

## English guidance

Use this capability for source-grounded adaptation judgment, media concepts, and shot spines. It owns creative decisions and source boundaries, not cross-Skill orchestration.

An ordinary request to analyze source material and design or adapt a concept, proposal, or PV ends at creative design. It does not imply a full production specification, model-input preparation, or a generation handoff. Enter those deeper boundaries only when the user explicitly requests them. The creative result must still be source-specific and complete enough for creator review and the next authorized creative capability; brevity must not remove narrative causality, subject or character function, scene relationships, audiovisual strategy, or continuity decisions needed to understand the work.

Keep collaboration and the durable artifact separate. Conversation updates may state concise progress, decisive rationale, blockers, and creator decisions. A generated document contains validated creative content and applicable handoff data, not source-review narration, Tool logs, progress, internal checks, or rejected reasoning. Analysis belongs in the document only when the user explicitly requests analysis, research, or audit as the deliverable; “analyze the source and design the work” keeps analysis as internal evidence work.

For time-based creative proposals, keep one authoritative beat or shot sequence for timing, image, action, sound, and transitions. Do not restate the same decisions in separate source-analysis, key-shot, visual-system, or sound-design sections. State cross-shot invariants once and keep shot-specific constraints with their shot. Bind evidence next to the decision it supports or reduce the evidence boundary to one closing sentence unless the user requested an analysis artifact.

For a time-based concept, use the smallest complete structure rather than a fixed section count. A 60–90 second narrative concept normally needs a source-specific premise and audience experience, the character/subject, setting and audiovisual continuity that constrain later work, and one authoritative six-to-eight-beat causal sequence owning timing, image, action, sound and transitions. These decisions may be integrated instead of split into sections, but the result must retain the hook, objective, escalation, payoff and consequence that make it specific to this source. Add a separate section only when it contributes a decision not already carried by the sequence; do not recreate analysis, production, technology, acceptance, source-binding, or creator-question material as repetitive mini-sections.

For a complete production specification, read [the time-based production specification guide](references/time-based-production-specification.md). Use one master document for the creative contract, reusable character/scene continuity, one authoritative production-unit table, and applicable finishing/delivery contracts. Do not split analysis, preparation, generation, and post-production into parallel explanatory documents. Keep actual assets, runtime state, candidates, failures, and receipts in their owning structured objects.

When the system classifies the request as an AI production handoff or execution request, expose only the creative decisions, stable source or shot references, and continuity requirements that the next capability must consume, and treat this result as an intermediate dependency rather than the completed turn. System reasoning composes preparation, generation, selection, post-production, and delivery Skills; this Skill does not write their prompts, operations, parameters, acceptance packets, or workflow.

## Evidence and creator review

1. Read the actual source and existing project state before planning. Separate observed facts, Agent interpretation, creator decisions, and proposed actions. Never treat a filename, prompt, thumbnail, or old plan as content evidence.
2. Define the minimum decisions that the current creative unit must support before expanding source inspection. Stop once every included decision has direct evidence. A single shot or complete local scene normally starts with no more than four selected pages in one reasoning batch. A volume-level or source-wide adaptation decision requires stratified narrative coverage across early setup, middle development or escalation, and late consequence or direction, plus one continuous local sequence for every event used as the PV spine. Covers, contents pages, and isolated first or last pages do not count as narrative coverage; the four-image limit applies per reasoning batch, not to the whole source. When authorized reading capabilities are available, perform the necessary batches in the current request instead of returning an executable sampling plan as the deliverable. Do not keep sampling for background or apparent completeness; narrow an unsupported claim or return the precise missing evidence instead.
3. Before finalizing a volume-level or source-wide concept, pass an internal coverage gate. For every required region, record the source range, continuous story-bearing unit, observed facts, the distinct creative decision supported or changed, and confidence or unresolved evidence. Coverage passes only when early, middle and late regions each affect a different decision, every selected spine event has continuous cause-action-consequence evidence, and the final concept incorporates or explicitly rejects the findings. Additional reads that do not change or validate a decision do not count. If the gate fails, narrow the title and claim to an opening, local-scene or selected-sequence concept; do not call it the volume's core or a whole-work representation. Keep this ledger internal unless the user requests an audit.
4. Track direct source facts, interpretations, and proposed PV recomposition separately. Unverified system reactions, weapon charging, character entrapment, attack order, or similar connective material may be proposed as new creative recomposition for review, but must not be presented as observed source fact.
5. Reuse current Storyboards, character references, approved documents and validated creative decisions when they remain valid.
6. Ask the creator to approve only material choices: adaptation target and omissions, story or character changes, core visual style, primary image/video/audio technique, cost or risk ceiling, mutation scope, and delivery boundary. Keep unresolved choices visible only when they affect the current artifact or next action.
7. A simple low-risk operation may proceed without creating planning files. For complex work, an optional `brief.md` may capture source evidence, interpretation, alternatives, creator decisions, and approval scope; it remains ordinary reviewable Markdown, not runtime state.

Ground each source in its own evidence: comics use actual page, panel, reading-order, dialogue, and character appearance evidence; screenplays use scene headings, action, dialogue, location, and timing intent; novels use chapter or scene boundaries, point of view, narration, dialogue, and adaptation omissions; illustrations use visible composition, subjects, layers when available, palette, and spatial relationships. Existing Storyboards and projects use their current revision, owned shots or timeline state, referenced assets, and validation evidence. When those existing facts already satisfy a work unit, mark it skipped or reused rather than rebuilding it.

For adaptation scope, format, episode count, or runtime estimation, read [references/adaptation-feasibility.md](references/adaptation-feasibility.md). Do this before turning a source manifest, page count, chapter list, synopsis, or visual sample into a season, film, episode, or duration plan.

## Adaptation scope gate

Do not invent a fixed source-wide format from insufficient evidence. A representative bounded sample may support a provisional range with its method, uncertainty and confidence stated. Preserve all already verified evidence that is relevant to the requested creative artifact; incomplete whole-source coverage does not force the design to ignore usable early, middle, or late evidence. Keep a candidate format conditional until broader coverage or creator approval supports it.

Do not turn temporary execution details into creative truth. On continuation, reread current source, Storyboard and approved decisions before revising the concept.
