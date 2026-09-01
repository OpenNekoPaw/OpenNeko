---
name: 'media-preparation'
description: '把已选镜头决定和真实素材准备成可直接提交给图像、视频或声音能力的输入包，或返回精确缺口；不执行生成、候选筛选或后期。 Prepare a selected shot and real assets as a submit-ready image, video, or audio input packet, or return the exact missing dependency, without generating, selecting, or finishing media.'
---

# Media Preparation

## 中文方法

为一个已选场景或镜头准备下游生成所需的真实输入。交付只有两种状态：`可提交／未执行`，或存在精确依赖缺口的 `阻塞`。

1. 从用户已指定或上游创意能力已选定的内容中只取一个最小生产单元。时长、比例、运动强度等不会改变故事、角色、交付边界、成本上限或外部状态的可逆默认值可以明确写出并继续；实质创意选择缺失时阻塞。
2. 绑定精确来源、镜头目标和下游生成能力，并读取对应生成 Skill 与当前 Tool schema。operation、字段名、引用角色和限制只能来自当前 schema。
3. 检查实际素材内容与授权状态，按需完成裁切、去字、蒙版、背景清理、比例统一、关键帧或参考图准备；只有当前能力真实支持时才执行。视频首帧必须是下游可直接消费的单帧素材；带分格、对白、页边或无关画面的漫画原页只能作为来源，不能冒充已准备首帧。无法完成所需预处理时返回缺失的精确操作。
4. 每个参考只承担一个职责：身份、当前状态、空间/构图、风格、运动或声音。写清必须继承与必须忽略的内容。
5. 将图像外观/构图、视频动作/机位、声音结构分别编译为对应能力可消费的 prompt 或结构化输入，不混成一个通用提示词。
6. 只有真实输入可直接消费且当前 schema 已确认时，才返回 `可提交／未执行`：稳定素材引用、参考职责、完整 Tool 调用封装、直接验收和下游用途。调用封装必须区分 Tool 名称、顶层 Tool operation、必填 wrapper、generation type、媒体 request operation 与输入 locator；不得把内部 `generate-from-*` 误写成顶层调用。验收不得放宽上游创意合同中的数值或连续性约束；未执行的调用不得声称已生成或已验证。
7. 缺少真实输入、稳定引用、当前 schema 或实质创意决定时，状态为 `阻塞`。不要生成候选调用包、模拟参数或重复创意分析；只在 Agent 对话中说明一个精确缺口和最小下一动作，保持正式创作文档不被阻塞信息污染。

## English guidance

Prepare real, authorized inputs for one selected scene or shot. The only handoff states are `submit-ready / not executed` and `blocked` with an exact missing dependency. Safe, reversible defaults may be stated and compiled when they do not change story, character, delivery boundary, cost ceiling, or external state; a missing material creative decision blocks the packet.

Bind the exact source, shot intent, downstream Skill, and current Tool schema. Operation names, fields, reference roles, and limits must come from that schema. A video first frame must be a directly consumable single-frame asset; a comic page containing panels, dialogue, borders, or unrelated imagery remains source material until an admitted crop, cleanup, or composite operation prepares it. Assign each reference one role—identity, current state, composition, style, motion, or sound—and state what to inherit and ignore. Perform crop, cleanup, masking, normalization, keyframe, or reference creation only through admitted operations. Keep image, video, and sound inputs distinct.

When every dependency is real and bound, return stable prepared references, roles, the complete Tool invocation envelope, direct acceptance, and downstream use. Distinguish the Tool name, top-level Tool operation, required wrapper fields, generation type, media-request operation, and input locators; never present an inner `generate-from-*` operation as the top-level invocation. Preserve upstream numeric and continuity constraints. Never claim an unexecuted request was generated or validated. If a real input, stable locator, current schema, or material decision is missing, do not create a candidate call packet or simulated parameter table. Report one exact blocker and the smallest next action in the Agent conversation, and keep the durable creative document free of blocker narration and speculative handoff content. Do not generate, select, edit, or deliver media.
