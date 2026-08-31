---
name: 'media-preparation'
description: '把已确认的场景或镜头决定准备为可供图像、视频或声音生成消费的参考素材与输入包；不执行生成、候选筛选或后期。 Prepare approved scene or shot decisions into reference assets and operation-ready inputs for image, video, or sound generation without generating, selecting, or finishing media.'
---

# Media Preparation

## 中文方法

为一个已确认的场景或镜头准备下游生成所需的真实输入。

1. 绑定精确来源、镜头目标和下游生成能力；目标 operation 未从当前 Tool schema 确认前，不编造参数。
2. 检查实际素材内容与授权状态，按需完成裁切、去字、蒙版、背景清理、比例统一、关键帧或参考图准备；只有当前能力真实支持时才执行。
3. 每个参考只承担一个职责：身份、当前状态、空间/构图、风格、运动或声音。写清必须继承与必须忽略的内容。
4. 将图像外观/构图、视频动作/机位、声音结构分别编译为对应能力可消费的 prompt 或结构化输入，不混成一个通用提示词。
5. 交付准备后的稳定素材引用、参考职责、可提交输入、直接验收和下游 operation；未生成或未验证的素材不得标记 ready。

## English guidance

Prepare real, authorized inputs for one approved scene or shot. Bind the exact source, shot intent, and downstream capability; do not invent operation parameters before inspecting the current Tool schema. Assign each reference one role—identity, current state, composition, style, motion, or sound—and state what to inherit and ignore. Perform crop, cleanup, masking, normalization, keyframe, or reference creation only through admitted operations. Keep image, video, and sound inputs distinct. Return stable prepared references, roles, submit-ready input, direct acceptance, and the consuming operation; do not generate, select, edit, or deliver media.
