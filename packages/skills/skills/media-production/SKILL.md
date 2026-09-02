---
name: 'media-production'
description: '基于真实来源规划 AI 驱动媒体作品的整体路线，并完成当前创作阶段的剧情、人物、场景、风格、声音与镜头设计；不代替素材准备、生成、后期或交付能力。 Plan the end-to-end route for a source-grounded AI media work and complete the current creative stage without impersonating preparation, generation, finishing, or delivery capabilities.'
---

# Media Production

## 中文方法

把真实来源转译为可评审、可继续制作的媒体创意。先保持全局方向，再把当前步骤做深；不要把整条生产链一次性扩写成未经验证的说明书。

1. 先读取当前 Canvas、已有文档、分镜、角色/场景参考和已生成结果。仍有效的内容直接复用；只有当前决定缺少证据时才回到原始来源。
2. 为多阶段作品维护一条简洁路线：**素材分析与创意设计 → 素材预处理 → 逐镜生成 → 选片与修复 → 剪辑/声音/后期 → 成片与交付**。每阶段只记录目标产物、输入依赖和完成条件，用于约束当前决定，不提前编写尚未验证的细节。
3. 当前创意阶段必须按作品需要落实剧情或信息主线、人物目标与作用、场景职责与空间关系、视觉风格、声音节奏和跨镜头连续性。没有改变镜头、模型输入或后续判断的背景分析不进入产物。
4. 当前阶段形成可评审结果后，输出可复用文档或明确结论，并只推荐一个能推进整体路线的下一操作。状态只描述已观察到的范围：可以说“创意草案已形成”或“当前设计阶段已完成”，但未经用户明确决定不得说方向、暂定规格或作品已经确认；后续准备、生成、选择、后期和交付分别由对应 Skill 与 Tool 完成。
5. 不创建审批对象、gate、预算授权或全局工作流状态。创作者直接评审当前结果；系统负责解释“继续”和修改反馈的流转语义。

## 请求边界

- **分析/评估**：只回答会改变改编方向的结论、证据范围和一个下一证据动作。
- **设计/改编作品或 PV**：交付当前创意方案，同时给出简洁整体路线。默认不展开预处理提示词、逐镜生成参数、剪辑细节和交付清单。
- **镜头主线**：交付一份权威节拍或镜头表，承载因果、画面、动作、摄影、声音、转场与必要连续性；普通创作使用可更新的 Markdown 表格。
- **完整制作规格**：仅在用户明确要求一份跨阶段制作规格时读取 [时序媒体制作规格指南](references/time-based-production-specification.md)。即使如此，也只能描述规划，不得声称未执行阶段已经完成。
- **准备或执行**：只向下一能力传递当前已确定的创意决定、稳定来源和连续性要求；不要在本 Skill 中伪造提示词调用、候选素材、剪辑结果或导出回执。

不得未经用户决定改变指定片长、画幅、叙事目标或交付类型。未指定时，可以采用一个明确标为“暂定”的工作基准，但不得把它写成来源事实或最终规格。

## 来源证据

读取前先列出当前创意阶段必须证明的决定，并建立有界取样：

- 图像型卷册首轮使用一次结构/清单读取，以及前、中、后各一批低清联系表；每批最多四张不同页面。
- 每批必须支持、改变或否决一个不同决定；没有新决定就停止。
- 连续因果优先由批次中的相邻页面证明。高清默认只读取一张最终入选页；只有第二张能解决已命名且会改变人物身份、动作因果或场景拓扑的未知项时才增加。
- 复用已经返回的清单、定位和画面，不以不同参数重复读取同一内容。读取与视觉检查是瞬态证据，不因检查过就加入 Canvas 或素材库。

卷级或来源整体声明需要前、中、后分别改变不同创作决定，并为主线事件提供起因—行动—后果的连续证据。若不满足，立即把标题和结论缩小为开篇、局部场景或已选序列概念；不要继续取样只为获得更大的标题。格式、集数和时长判断按需读取 [适配可行性与体量指南](references/adaptation-feasibility.md)。

卷级或来源整体创作文档必须保留一份简短的“来源—决定映射”：每个前／中／后区域只记录稳定来源范围、直接观察事实和它实际改变的创作决定。它不是读取日志；若三个区域没有分别改变决定，或主线没有连续因果证据，就不得使用“卷级”“全作”标题。不能用文末的一句范围声明替代这份映射。

内部始终区分：

- 来源直接事实；
- 基于事实的解释；
- 为作品提出的创作重组。

创作重组可以进入方案，但必须明确是设计决定，不能伪装成原作连续事件。在权威节拍或镜头表中，凡是跨段拼接、事件重排、新增转场、对白、触发关系或后果，都必须在对应行的“依据性质”中标为“创作重组”；来源直接事实和基于事实的解释也在使用处区分。只在文末统一声明“主题性重组”不够。

## 产物形式

Agent 对话只保留结论、关键边界、文档链接和一个下一操作。正式创作文档保留：

1. 来源特有的核心命题、目标观众体验与作品范围；
2. 剧情/人物/场景/风格/声音中会约束后续制作的不变量；
3. 一份权威节拍或镜头表；
4. 与标题范围相称的来源—决定映射，以及在节拍表使用处标明的事实／解释／创作重组；
5. 简洁整体路线，仅标出当前阶段、下一阶段及后续阶段目标，不重复正文。

不要写读取过程、工具日志、工作进度、内部覆盖记录、多个备选流程或通用行业说明。不要因精简而删除作品特有的角色动机、因果升级、空间关系、高潮后果或连续性要求。

## English guidance

Translate real source material into a reviewable media design while keeping the final work in view. Maintain a compact roadmap—source analysis and creative design, preparation, per-unit generation, selection and repair, edit/sound/finishing, then work and delivery—but develop only the current creator-reviewable stage in detail. The roadmap records each stage's output, dependency, and completion condition; it does not pre-write unverified downstream content.

Read the current Canvas, documents, Storyboards, character and environment references, and generated results first. Reuse valid work and return to raw source only for a specific missing decision. The current creative artifact must make plot or information causality, character objective and function, scene purpose and spatial relation, visual style, sound and rhythm, and cross-shot continuity concrete whenever they affect later work.

An ordinary request to analyze and design or adapt a media work returns the current creative proposal plus the compact roadmap. It does not expand by default into prompt packets, generation parameters, edit instructions, or a delivery manifest. A complete cross-stage production specification is created only when explicitly requested; then read [the time-based production specification guide](references/time-based-production-specification.md). Preparation and execution remain owned by their admitted Skills and Tools.

Use one authoritative beat or shot table for time-based work. Ordinary creator review uses updateable Markdown rather than a new structured workflow model. After the current artifact, recommend exactly one next operation that advances the roadmap. Describe only the observed stage as complete: a draft may be formed or the current design task may be complete, but provisional format, creative direction, and the work itself are not creator-confirmed merely because the user later says “continue”. Do not create approval objects, workflow gates, budget authorization, or a global production-state machine.

Before inspecting an image-led volume, name the decisions the current stage must support. Use one structural read and at most one low-resolution contact-sheet batch for each early, middle, and late region, with no more than four distinct images per batch. Every batch must support, change, or reject a different decision. Reuse returned manifests, locators, and pixels; do not reread unchanged content with another parameter. Original-detail inspection defaults to one final selection and adds a second only for a named uncertainty that changes identity, causal action, or scene topology. Reads are transient evidence, not automatic Canvas assets.

A volume-level claim requires early, middle, and late regions to affect distinct decisions and continuous cause-action-consequence evidence for every event used as the spine. Otherwise narrow the artifact to an opening, local-scene, or selected-sequence concept. Keep direct source fact, interpretation, and proposed creative recomposition distinct. For adaptation scale, read [references/adaptation-feasibility.md](references/adaptation-feasibility.md).

A volume- or source-wide artifact must retain a compact source-to-decision map. For each early, middle, and late region, name the stable source range, the directly observed fact, and the distinct creative decision it changed. This is not a reading log. If the three regions do not affect distinct decisions or the spine lacks continuous causal evidence, do not use a volume- or work-level title. A generic scope disclaimer at the end is not a substitute.

Mark evidence type where it is used in the authoritative sequence. Cross-range joins, reordered events, added transitions, dialogue, triggers, or consequences are creative recomposition and must be labeled on the affected beat or shot; a single late disclaimer does not make a unified invented causal line source-backed.

Keep the durable document concise: source-specific premise and audience experience, only the plot/character/scene/style/sound invariants that constrain production, one authoritative sequence, the compact source-to-decision map appropriate to its title, and the compact roadmap. Omit Tool logs, reading narration, progress, generic workflow advice, and repeated sections.
