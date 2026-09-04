---
name: 'image'
description: '通过当前图像能力生成或变换一个明确图像产物；不负责参考职责设计、候选选择、视频合成或时间线编排。 Generate or transform one bounded image artifact through current image capabilities, without owning reference-role design, candidate selection, video compositing, or timeline orchestration.'
---

# Image

## 中文方法

规划或执行一次边界明确的图像生成操作。当前 Generation 的 canonical image operation 只有 `generate`、`edit`、`inpaint` 和 `style-transfer`。

1. 从用户意图选择 canonical operation，不根据自由文本猜测 provider 能力。
2. 保留稳定输入引用、蒙版、构图、风格约束、尺寸和数量。
3. 执行前核对当前 adapter、模型、必需输入和限制；不支持时返回明确 diagnostic 和最小可恢复下一步。
4. 只有运行时确认产物后才声称生成完成，并在本地检查文件存在、可读、媒体类型和基础尺寸。
5. 审美、角色一致性和政策通过必须由相应质量证据支持；图层、选区、绘制与项目格式修改仍归所属创作能力负责。
6. 参考素材的身份、状态、构图、风格等职责由 `media-preparation` 确定；本 Skill 只消费绑定好的输入并返回可观察图像结果。
7. `outpaint` 不是 Generation operation。扩图必须先由所属图像创作／预处理能力准备扩展画布、原图和蒙版，再以 `inpaint` 提交；缺少该能力或输入时明确阻塞，不得提交虚构的 `outpaint`。
8. 放大、上色、静态合成、拆分、抠图或背景处理只有在当前 Tool catalog 暴露对应所属能力时才能执行；不得把这些意图伪装为受支持的 Generation operation。

## English guidance

Plan or perform one bounded image generation operation. The canonical Generation image operations are only `generate`, `edit`, `inpaint`, and `style-transfer`.

## Method

1. Select the canonical operation from user intent; do not infer provider support from a free-form prompt field.
2. Preserve stable input references, masks, composition intent, style constraints, requested dimensions, and output count.
3. Negotiate adapter support, required inputs, model/provider requirements, and limits before execution.
4. If support is degraded or unavailable, report the declared diagnostic and smallest recoverable alternative.
5. Submit execution through the negotiated runtime capability and claim a produced asset only from a confirmed runtime capability result. Before confirmation, report only planned, submitted, pending, blocked, or failed state.
6. Validate output existence, readability, media type, and requested basic dimensions locally. Do not claim aesthetic, character-consistency, or policy approval without evidence from the owning validator.
7. `outpaint` is not a Generation operation. An owning image-authoring or preprocessing capability must first prepare an expanded canvas, the source image, and a mask; submit the prepared inputs as `inpaint`. If that capability or those inputs are unavailable, fail visibly instead of inventing an `outpaint` request.
8. Upscaling, colorization, compositing, splitting, background removal, and background replacement require an explicit owning capability in the current Tool catalog. Never encode them as unsupported Generation operations.

Selection-, layer-, paint-, and project-format mutations remain owned by the relevant image authoring capability; this Skill expresses creative operation intent without importing package internals.
Reference roles and prepared generation inputs are owned by `media-preparation`; this Skill consumes those bindings and returns an observable image result.
