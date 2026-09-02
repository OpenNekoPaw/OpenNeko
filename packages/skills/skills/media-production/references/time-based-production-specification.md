# Time-based Production Specification

## 中文指南

仅当用户明确要求完整的跨阶段制作设计时，交付一份权威主文档，不按分析、预处理、生成、后期拆成多篇说明。普通作品设计仍由主 Skill 交付当前创意方案和简洁整体路线。

主文档必须形成从来源到可验证成片的闭环，只保留以下可复用内容：

1. **来源决策表**：按前、中、后或真实结构记录少量已核验事实、它改变的剧情/人物/场景/风格决定及证据边界。它不是阅读日志；每行必须影响后续生产。
2. **作品设计基准**：明确剧情主线与因果、人物目标和连续性、场景职责与空间关系、视觉风格规则、声音与节奏规则。只列能约束镜头或模型输入的内容。
3. **预处理资产包**：列出要制作或整理的角色锚点、场景锚点、风格板、关键帧/首尾帧、蒙版、分镜或 animatic；每项给出来源职责、直接产物、入选条件和被哪些镜头消费。不得用“准备参考图”这种无对象描述代替。
4. **生成与镜头表**：每个生产单元有稳定 ID，并在同一行承载时间、剧情作用、画面/动作/摄影/声音、绑定输入、语义化提示词意图或生成方法、预期素材、直接验收、失败时只修复的属性及下游用途。技术调用字段只在用户要求复现或调试时展示。
5. **后期、作品与交付合同**：明确剪辑结构、合成、调色、声音、字幕/标题如何消费生成素材；列出评审成片、无字/分轨等真实交付物、平台变体、QC 条件和清单。依赖实际素材测量或平台规范的参数必须标注依赖，不使用通用默认值冒充已确定值。

成稿前执行覆盖检查：五个制作阶段和剧情、人物、场景、风格、声音五类创作对象都必须有真实决定或明确“不适用”理由；不能用空标题、通用方法或未来建议凑齐。每条信息至少能够改变一个输入资产、生成单元、后期动作、验收条件或交付结果，否则删除。

分析是形成决定的内部证据工作，不建立“来源分析”章节。预处理结果是参考图、首尾帧、蒙版或其他稳定素材；生成结果是 Job 与候选媒体；后期结果是项目修订或母版；交付结果是已验证文件和清单。它们保存在各自 owning capability 的结构化对象中，只有被接受且会被后续复用的稳定引用才进入主文档。

若用户明确只要概念方向，仍使用精简概念结构，不强制展开完整制作规格。若来源证据不足以支撑人物、剧情、场景或片长决定，缩小对应声明或在对话中报告精确缺口，不用空章节和通用分析填充。

## English guidance

Only when the user explicitly requests complete cross-stage production design, deliver one authoritative master document rather than separate analysis, preparation, generation, and post-production explanations. An ordinary work-design request still returns the current creative artifact plus the compact roadmap defined by the main Skill.

Keep only five reusable content groups that form a closed path from source evidence to a verifiable work:

1. **Source-to-decision map** with verified facts, affected creative decisions, and evidence bounds.
2. **Work design baseline** for plot causality, character goals and continuity, scene functions and spatial relations, visual style, sound, and rhythm.
3. **Preparation asset package** with exact character, environment and style anchors, key/first/last frames, masks, storyboard or animatic outputs, their source roles, acceptance, and consuming units.
4. **Generation and production-unit table** with stable IDs, timing, story function, image/action/camera/sound, bound inputs, semantic prompt intent or generation method, expected asset, direct acceptance, repair boundary, and downstream use.
5. **Finishing, work, and delivery contract** for edit, compositing, grade, sound, titles, review master, clean or stem variants, platform variants, QC, and manifest.

Before delivery, verify that all five production stages and plot, character, scene, style, and sound have a real decision or an explicit not-applicable reason. Empty headings, generic advice, and future recommendations do not count. Every retained item must change an input asset, production unit, finishing action, acceptance criterion, or delivered result.

Analysis is internal evidence work, not a source-analysis section. Prepared references, generation Jobs and candidates, project revisions or masters, and delivered files or manifests remain structured objects owned by their capabilities. Only accepted stable references that downstream work must reuse enter the master document.

If the user explicitly requests concept direction only, keep the concise concept form. If source evidence cannot support a character, plot, scene, or runtime decision, narrow the claim or report the exact gap in conversation instead of adding empty sections or generic analysis.
