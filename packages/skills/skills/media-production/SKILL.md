---
name: 'media-production'
description: '基于真实来源规划 AI 驱动媒体作品的整体路线，并完成当前创作阶段的剧情、人物、场景、风格、声音与镜头设计；不代替素材准备、生成、后期或交付能力。 Plan the end-to-end route for a source-grounded AI media work and complete the current creative stage without impersonating preparation, generation, finishing, or delivery capabilities.'
---

# Media Production

## 中文方法

把真实来源转译为可评审、可继续制作的媒体创意。先保持全局方向，再把当前步骤做深；不要把整条生产链一次性扩写成未经验证的说明书。

1. 先读取当前 Canvas、已有文档、分镜、角色/场景参考和已生成结果。仍有效的内容直接复用；只有当前决定缺少证据时才回到原始来源。
2. 为多阶段作品维护一条简洁路线：**素材分析与创意设计 → 素材预处理 → 逐镜生成 → 选片与修复 → 剪辑/声音/后期 → 成片与交付**。每阶段只记录目标产物、输入依赖和完成条件，用于约束当前决定，不提前编写尚未验证的细节。路线按依赖推进：当前阶段的完成条件未满足时，“继续”只处理该阶段下一个已命名缺口，不能因为已有一页方案、一个提示词、一个静帧或一次技术试镜就进入视频生成或后期。
3. 当前创意阶段必须形成与声明制作范围相称的五类分析，而不能只提取风格：
   - **画面分析**：构图、景别、视角、尺度、光影、材质、空间层次、页面／分格语法和可转译的运动暗示；
   - **人物分析**：身份与外观锚点、当前状态、目标、关系、行动能力、表演边界和跨镜连续性；
   - **剧情分析**：场景／节拍顺序、起因—行动—后果、冲突升级、结果、对白与叙事边界；
   - **世界观分析**：地点与空间拓扑、群体／生物／系统、技术与规则、威胁以及来源能够支持的限制；
   - **分镜转译分析**：原页／面板的保留、跳过、合并、拆分或过渡用途，以及镜头轴线、动作衔接、转场、静帧意图与视频运动意图。
     这些分析最终仍要收敛为剧情或信息主线、人物目标与作用、场景职责、视觉风格、声音节奏和跨镜头连续性。当前制作范围需要的任一类仍无证据时，创意分析未完成；没有改变镜头、素材需求、模型输入或后续判断的背景知识不进入产物。
4. 当前阶段形成可评审结果后，输出可复用文档或明确结论，并只推荐一个能推进整体路线的下一操作。状态只描述已观察到的范围：可以说“创意草案已形成”或“当前设计阶段已完成”，但未经用户明确决定不得说方向、暂定规格或作品已经确认；后续准备、生成、选择、后期和交付分别由对应 Skill 与 Tool 完成。
5. 时间型作品从创意设计进入素材预处理前，必须存在覆盖当前制作范围的权威镜头表。PV 的当前制作范围默认是整支 PV；长篇或 TV 项目默认是创作者当前确认的一个剧集、段落或连续制作单元，而不是凭空要求一次准备整部系列。从素材预处理进入生产性视频生成前，必须逐镜盘点该范围消费的剧情节拍与世界规则、角色及状态、物品、场景及空间关系、风格、构图、动作与声音素材，并为每镜明确静帧生成／编辑是否需要以及视频运动意图是否完整。每个镜头必须被具体覆盖；不得用“后续镜头之后再准备”代替需求分析。单张图只满足它实际呈现且已绑定的职责，不能同时冒充未呈现的人物状态、物品、场景拓扑、动作姿态或其他镜头构图。只要当前制作范围仍有关键静态素材缺口或逐镜生成意图缺口，某个镜头已有首帧或旧文档写有“可提交”也不能让视频成为默认下一操作。单次生成仍以当前能力支持的有界操作为单位，但单个准备包或单帧不代表当前制作范围的素材已经充分。用户明确要求提前试镜时可以执行，并必须标为不完成当前阶段的技术实验。
6. 不创建审批对象、gate、预算授权或全局工作流状态。创作者直接评审当前结果；系统负责解释“继续”和修改反馈的流转语义。

## 请求边界

- **分析/评估**：只回答会改变改编方向的结论、证据范围和一个下一证据动作。
- **设计/改编作品或 PV**：交付当前创意方案，同时给出简洁整体路线。默认不展开预处理提示词、逐镜生成参数、剪辑细节和交付清单。
- **镜头主线**：交付一份权威节拍或镜头表，承载因果、画面、动作、摄影、声音、转场与必要连续性；普通创作使用可更新的 Markdown 表格。
- **完整制作规格**：仅在用户明确要求一份跨阶段制作规格时读取 [时序媒体制作规格指南](references/time-based-production-specification.md)。即使如此，也只能描述规划，不得声称未执行阶段已经完成。
- **准备或执行**：只向下一能力传递当前已确定的创意决定、稳定来源和连续性要求；不要在本 Skill 中伪造提示词调用、候选素材、剪辑结果或导出回执。

不得未经用户决定改变指定片长、画幅、叙事目标或交付类型。未指定时，可以采用一个明确标为“暂定”的工作基准，但不得把它写成来源事实或最终规格。

## 来源证据

读取前先列出当前创意阶段必须证明的决定，并建立有界取样：

- 图像型卷册首轮先读取结构/清单，识别目录或章节边界、阅读顺序以及封面、目录、空白、广告、重复等非正文单元，再对有效正文的前、中、后各取一批低清联系表；每批最多四张不同页面。只有文件数或图像清单而没有正文边界，不算完成结构分析。
- 每批必须支持、改变或否决一个不同决定；没有新决定就停止。
- 连续因果优先由批次中的相邻页面证明。高清默认只读取一张最终入选页；只有第二张能解决已命名且会改变人物身份、动作因果或场景拓扑的未知项时才增加。
- 复用已经返回的清单、定位和画面，不以不同参数重复读取同一内容。读取与视觉检查是瞬态证据，不因检查过就加入 Canvas 或素材库。

卷级或来源整体声明需要前、中、后分别改变不同创作决定，并为主线事件提供起因—行动—后果的连续证据。若不满足，立即把标题和结论缩小为来源覆盖评估、开篇、局部场景或已选序列概念；此时下一操作仍是解决一个会改变方案的明确证据缺口，不得推荐素材准备、图像生成或视频生成。不要继续取样只为获得更大的标题。格式、集数和时长判断按需读取 [适配可行性与体量指南](references/adaptation-feasibility.md)。

长篇、TV、整卷或整部改编的首轮前／中／后取样只用于建立方向，不能代替声明范围内的内容覆盖。进入一个正式制作单元前，必须按目录、章节、幕、剧集或已确认连续段落逐段建立五类分析，并对入选序列读取足以证明连续因果和空间／人物状态变化的相邻内容；没有覆盖到的单元必须保持未分析，不能被风格结论一并代表。

卷级或来源整体创作文档必须保留一份简短的“来源—决定映射”：每个前／中／后区域只记录稳定来源范围、直接观察事实和它实际改变的创作决定。它不是读取日志；若三个区域没有分别改变决定，或主线没有连续因果证据，就不得使用“卷级”“全作”标题。不能用文末的一句范围声明替代这份映射。

内部始终区分：

- 来源直接事实；
- 基于事实的解释；
- 为作品提出的创作重组。

创作重组可以进入方案，但必须明确是设计决定，不能伪装成原作连续事件。在权威节拍或镜头表中，凡是跨段拼接、事件重排、新增转场、对白、触发关系或后果，都必须在对应行的“依据性质”中标为“创作重组”；来源直接事实和基于事实的解释也在使用处区分。只在文末统一声明“主题性重组”不够。

## 产物形式

Agent 对话只保留结论、关键边界、文档链接和一个下一操作。正式创作文档保留：

1. 来源特有的核心命题、目标观众体验与作品范围；
2. 画面、人物、剧情、世界观与分镜转译中会约束后续制作的结论，以及场景、风格和声音不变量；
3. 一份权威节拍或镜头表；
4. 与标题范围相称的来源—决定映射，以及在节拍表使用处标明的事实／解释／创作重组；
5. 简洁整体路线，仅标出当前阶段、下一阶段及后续阶段目标，不重复正文。

不要写读取过程、工具日志、工作进度、内部覆盖记录、多个备选流程或通用行业说明。不要因精简而删除作品特有的角色动机、因果升级、空间关系、高潮后果或连续性要求。

## English guidance

Translate real source material into a reviewable media design while keeping the final work in view. Maintain a compact roadmap—source analysis and creative design, preparation, per-unit generation, selection and repair, edit/sound/finishing, then work and delivery—but develop only the current creator-reviewable stage in detail. The roadmap records each stage's output, dependency, and completion condition; it does not pre-write unverified downstream content. Advance it in dependency order: while the current completion condition is unmet, an unqualified continuation resolves its next named gap instead of treating a document, prompt, still, or technical test as permission to start production video or finishing.

Read the current Canvas, documents, Storyboards, character and environment references, and generated results first. Reuse valid work and return to raw source only for a specific missing decision. The current creative artifact must complete five source-grounded analyses to the scope it claims rather than extracting style alone: visual analysis covers composition, shot scale, viewpoint, spatial scale, light, material, page or panel grammar, and motion implications; character analysis covers identity and appearance anchors, state, objective, relationships, capabilities, performance bounds, and continuity; story analysis covers ordered scenes or beats, cause-action-consequence, escalation, outcome, dialogue, and narrative boundaries; world analysis covers locations and topology, groups, creatures, systems, technology, rules, threats, and source-supported limits; storyboard-translation analysis covers keep, skip, merge, split, or transition use, screen direction, action continuity, transitions, still intent, and video-motion intent. These analyses must converge into concrete plot or information causality, character function, scene responsibility, visual style, sound and rhythm, and cross-shot continuity. If any analysis needed by the declared production range still lacks evidence, creative analysis is incomplete. Omit background analysis that changes no shot, material need, model input, or downstream decision.

An ordinary request to analyze and design or adapt a media work returns the current creative proposal plus the compact roadmap. It does not expand by default into prompt packets, generation parameters, edit instructions, or a delivery manifest. A complete cross-stage production specification is created only when explicitly requested; then read [the time-based production specification guide](references/time-based-production-specification.md). Preparation and execution remain owned by their admitted Skills and Tools. Before preparation, require one authoritative shot table for the current production range. That range is the whole PV by default, or one creator-approved episode, sequence block, or continuous production unit for long-form and TV work rather than an invented requirement to prepare the entire series at once. Before production video, inventory per shot the story beat and applicable world rules, character states, objects, environment topology, style, composition, action, and sound material consumed across that range; prepare reusable static anchors first; and record whether still generation or editing is required plus a complete video-motion intent for every shot. Every planned shot must be accounted for; “prepare later shots afterward” is not coverage analysis. One image satisfies only roles it visibly contains and stably binds. While any critical static-material or per-shot generation-intent gap remains in the current production range, a ready first frame or an old submit-ready label for one shot does not make video the default next operation. One bounded packet or still never completes preparation for that production range. An explicitly requested early video test remains a technical experiment and does not promote stage completion.

Use one authoritative beat or shot table for time-based work. Ordinary creator review uses updateable Markdown rather than a new structured workflow model. After the current artifact, recommend exactly one next operation that advances the roadmap. Describe only the observed stage as complete: a draft may be formed or the current design task may be complete, but provisional format, creative direction, and the work itself are not creator-confirmed merely because the user later says “continue”. Do not create approval objects, workflow gates, budget authorization, or a global production-state machine.

Before inspecting an image-led volume, name the decisions the current stage must support. The structural read must establish contents or chapter boundaries, reading order, story-bearing ranges, and covers, contents, blanks, ads, duplicates, or other non-story units; an image manifest alone is insufficient. Then use at most one low-resolution contact-sheet batch for each early, middle, and late region, with no more than four distinct images per batch. Every batch must support, change, or reject a different decision. Reuse returned manifests, locators, and pixels; do not reread unchanged content with another parameter. Original-detail inspection defaults to one final selection and adds a second only for a named uncertainty that changes identity, causal action, or scene topology. Reads are transient evidence, not automatic Canvas assets.

A volume-level claim requires early, middle, and late regions to affect distinct decisions and continuous cause-action-consequence evidence for every event used as the spine. Otherwise narrow the artifact to a source-coverage assessment, opening, local-scene, or selected-sequence concept, and keep the next operation on one decision-changing evidence gap rather than preparation or generation. Keep direct source fact, interpretation, and proposed creative recomposition distinct. For adaptation scale, read [references/adaptation-feasibility.md](references/adaptation-feasibility.md).

For long-form, TV, volume-wide, or work-wide adaptation, the initial early/middle/late sample establishes orientation only. Before a production unit is treated as analyzed, cover its contents, chapters, acts, episodes, or approved continuous sequences with the five analyses above, and inspect adjacent source content wherever a selected sequence depends on continuous causality or changes in space or character state. Uncovered units remain explicitly unanalyzed and cannot be represented by a style sample.

A volume- or source-wide artifact must retain a compact source-to-decision map. For each early, middle, and late region, name the stable source range, the directly observed fact, and the distinct creative decision it changed. This is not a reading log. If the three regions do not affect distinct decisions or the spine lacks continuous causal evidence, do not use a volume- or work-level title. A generic scope disclaimer at the end is not a substitute.

Mark evidence type where it is used in the authoritative sequence. Cross-range joins, reordered events, added transitions, dialogue, triggers, or consequences are creative recomposition and must be labeled on the affected beat or shot; a single late disclaimer does not make a unified invented causal line source-backed.

Keep the durable document concise: source-specific premise and audience experience, the production-changing results of visual, character, story, world, and storyboard-translation analysis, only the scene/style/sound invariants that constrain production, one authoritative sequence, the compact source-to-decision map appropriate to its title, and the compact roadmap. Omit Tool logs, reading narration, progress, generic workflow advice, and repeated sections.
