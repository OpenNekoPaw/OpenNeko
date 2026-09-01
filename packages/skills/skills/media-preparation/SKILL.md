---
name: 'media-preparation'
description: '把已确认的镜头决定或非执行的暂定生产单元准备为可供图像、视频或声音生成评审的参考素材与输入包；不执行生成、候选筛选或后期。 Prepare approved shot decisions or a provisional non-executing production unit into reviewable references and generation inputs without generating, selecting, or finishing media.'
---

# Media Preparation

## 中文方法

为一个已确认的场景或镜头准备下游生成所需的真实输入；也可为非执行的生产交接编译一个明确标记为暂定的可撤销评审包。

1. 绑定精确来源、镜头目标和下游生成能力；目标 operation 未从当前 Tool schema 确认前，不编造参数。
2. 检查实际素材内容与授权状态，按需完成裁切、去字、蒙版、背景清理、比例统一、关键帧或参考图准备；只有当前能力真实支持时才执行。视频首帧必须是下游可直接消费的单帧素材；带分格、对白、页边或无关画面的漫画原页只能作为来源，不能冒充已准备首帧。无法完成所需预处理时返回缺失的精确操作。
3. 每个参考只承担一个职责：身份、当前状态、空间/构图、风格、运动或声音。写清必须继承与必须忽略的内容。
4. 将图像外观/构图、视频动作/机位、声音结构分别编译为对应能力可消费的 prompt 或结构化输入，不混成一个通用提示词。
5. 只有已批准的输入且当前 schema 已确认时，才交付准备后的稳定素材引用、参考职责、可提交输入、直接验收和下游 operation；验收不得放宽上游创意合同中的数值或连续性约束。未生成或未验证的素材不得标记 ready。
6. 非执行交接可以消费不会改变故事、角色、交付边界或外部状态的暂定创意决定，生成一个供创作者确认的候选输入包；必须标明仍待确认的决定，不得把它标记为 accepted、ready 或已授权执行。实质选择未确认时，返回候选输入和精确阻塞，而不是退回通用概念分析。
7. 当前 Tool schema 未暴露时，只写“候选输入”和所需能力语义，明确 operation、参数和参考图数量/角色尚未确认；不得使用看似可调用的 operation 名、参数表或“建议调用参数”。

## English guidance

Prepare real, authorized inputs for one approved scene or shot. For a non-executing production handoff, you may also compile one explicitly provisional, reversible review packet from decisions that do not change story, character, delivery boundaries, or external state. Bind the exact source, shot intent, and downstream capability; do not invent operation parameters before inspecting the current Tool schema. A video first frame must be a directly consumable single-frame asset; a comic page containing panels, dialogue, borders, or unrelated imagery remains source material until an admitted crop, cleanup, or composite operation prepares it. Assign each reference one role—identity, current state, composition, style, motion, or sound—and state what to inherit and ignore. Perform crop, cleanup, masking, normalization, keyframe, or reference creation only through admitted operations. Keep image, video, and sound inputs distinct. Preserve upstream numeric and continuity constraints in direct acceptance checks. For approved inputs, return stable prepared references, roles, submit-ready input, direct acceptance, and the consuming operation. For provisional inputs, mark every unresolved material decision and return the candidate input with the exact blocker instead of falling back to generic concept analysis; never mark a provisional packet accepted, ready, or authorized for execution. When the current Tool schema is unavailable, provide only candidate input and the required capability semantics, and mark operation names, parameters, and supported reference roles as unconfirmed. Do not generate, select, edit, or deliver media.
