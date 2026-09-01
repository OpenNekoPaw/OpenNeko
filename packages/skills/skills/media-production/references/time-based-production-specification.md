# Time-based Production Specification

## 中文指南

当用户要求完整制作设计，或系统把时序媒体任务判定为生产设计/AI 生产交接时，交付一份权威主文档，不按分析、预处理、生成、后期拆成多篇说明。

主文档只保留五类可复用内容：

1. **创作合同**：交付规格、核心体验或叙事主线、范围边界，以及真正约束全片的视觉、动作、声音和验收规则。
2. **人物与场景连续性**：只列会跨镜头复用或直接影响生成的对象。每项绑定稳定来源、必须保持和禁止变化；单次出现且无连续性风险的细节留在镜头表。
3. **权威镜头表**：每个生产单元有稳定 ID，并在同一行承载时间、剧情作用、画面与动作、摄影与声音、真实输入需求、生产方式、直接验收和下游用途。相同决定不得在其他章节复述。
4. **AI 生产交接**：只收录真实输入与当前 Tool schema 已全部绑定的语义化交接：选定单元、稳定素材及职责、可直接使用的提示词或操作意图、预期产物、直接验收和下游用途。完整调用封装由准备和生成能力在真实调用或结构化运行对象中维护，不复制到主文档。只有用户明确要求调试、审计、复现或复制调用时才展示技术字段。阻塞单元不附伪调用包，其精确缺口只在 Agent 对话说明。
5. **后期与交付合同**：只写跨镜头适用的剪辑、合成、调色、声音、字幕/标题和交付结果约束。参数依赖实际素材测量或平台规范时写明依赖，不使用通用默认值冒充已确定参数。

分析是形成决定的内部证据工作，不建立“来源分析”章节。预处理结果是参考图、首尾帧、蒙版或其他稳定素材；生成结果是 Job 与候选媒体；后期结果是项目修订或母版；交付结果是已验证文件和清单。它们保存在各自 owning capability 的结构化对象中，只有被接受且会被后续复用的稳定引用才进入主文档。

若用户明确只要概念方向，仍使用精简概念结构，不强制展开完整制作规格。若来源证据不足以支撑人物、剧情、场景或片长决定，缩小对应声明或在对话中报告精确缺口，不用空章节和通用分析填充。

## English guidance

When the user requests complete production design, or the system classifies a time-based media task as production design or AI production handoff, deliver one authoritative master document rather than separate analysis, preparation, generation, and post-production explanations.

Keep only five reusable content groups:

1. **Creative contract**: delivery format, core experience or narrative spine, scope boundary, and the visual, action, sound, and acceptance rules that constrain the whole work.
2. **Character and scene continuity**: only recurring or generation-critical objects, each with stable source, properties to preserve, and forbidden drift. Keep one-off details in the production-unit table.
3. **Authoritative production-unit table**: give every unit a stable ID and one row owning time, story function, image/action, camera/sound, real input requirements, production method, direct acceptance, and downstream use. Do not restate those decisions elsewhere.
4. **AI production handoff**: include only a semantic handoff whose real inputs and current Tool schema are fully bound: selected unit, stable assets and roles, directly usable prompt or operation intent, expected result, direct acceptance, and downstream use. Preparation and generation capabilities keep the complete invocation envelope in the actual Tool call or structured runtime object rather than copying it into the master document. Show technical fields only when the user explicitly requests debugging, audit, reproduction, or a copyable call. Keep blocked units out of the document and report their exact missing dependency in conversation.
5. **Finishing and delivery contract**: only cross-unit editorial, compositing, grade, sound, caption/title, and delivery-result constraints. When parameters depend on measured media or a platform specification, state that dependency instead of inventing universal defaults.

Analysis is internal evidence work, not a source-analysis section. Prepared references, generation Jobs and candidates, project revisions or masters, and delivered files or manifests remain structured objects owned by their capabilities. Only accepted stable references that downstream work must reuse enter the master document.

If the user explicitly requests concept direction only, keep the concise concept form. If source evidence cannot support a character, plot, scene, or runtime decision, narrow the claim or report the exact gap in conversation instead of adding empty sections or generic analysis.
