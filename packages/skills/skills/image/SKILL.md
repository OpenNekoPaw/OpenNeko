---
name: 'image'
description: '通过能力中立的操作生成、编辑、扩展、增强、上色、合成、拆分或准备图像。 Generate, edit, extend, enhance, colorize, compose, split, or prepare images through capability-neutral operations.'
---

# Image

## 中文方法

规划或执行一次能力中立的图像操作，包括生成、编辑、局部重绘、扩图、放大、上色、风格转换、合成、拆分、背景处理或镜头参考准备。

1. 从用户意图选择 canonical operation，不根据自由文本猜测 provider 能力。
2. 保留稳定输入引用、蒙版、构图、风格约束、尺寸和数量。
3. 执行前核对当前 adapter、模型、必需输入和限制；不支持时返回明确 diagnostic 和最小可恢复下一步。
4. 只有运行时确认产物后才声称生成完成，并在本地检查文件存在、可读、媒体类型和基础尺寸。
5. 审美、角色一致性和政策通过必须由相应质量证据支持；图层、选区、绘制与项目格式修改仍归所属创作能力负责。

## English guidance

Plan or perform one capability-neutral image operation: generation, editing, inpainting, outpainting, upscaling, colorization, style transfer, compositing, splitting, background removal or replacement, or shot-reference preparation.

## Method

1. Select the canonical operation from user intent; do not infer provider support from a free-form prompt field.
2. Preserve stable input references, masks, composition intent, style constraints, requested dimensions, and output count.
3. Negotiate adapter support, required inputs, model/provider requirements, and limits before execution.
4. If support is degraded or unavailable, report the declared diagnostic and smallest recoverable alternative.
5. Submit execution through the negotiated runtime capability and claim a produced asset only from a confirmed runtime capability result. Before confirmation, report only planned, submitted, pending, blocked, or failed state.
6. Validate output existence, readability, media type, and requested basic dimensions locally. Do not claim aesthetic, character-consistency, or policy approval without evidence from the owning validator.

Selection-, layer-, paint-, and project-format mutations remain owned by the relevant image authoring capability; this Skill expresses creative operation intent without importing package internals.
