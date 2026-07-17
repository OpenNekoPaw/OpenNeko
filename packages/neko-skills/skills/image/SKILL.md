---
name: "image"
description: "Generate, edit, extend, enhance, colorize, compose, split, or prepare images through capability-neutral operations."
---
# Image

Plan or perform one capability-neutral image operation: generation, editing, inpainting, outpainting, upscaling, colorization, style transfer, compositing, splitting, background removal or replacement, or shot-reference preparation.

## Method

1. Select the canonical operation from user intent; do not infer provider support from a free-form prompt field.
2. Preserve stable input references, masks, composition intent, style constraints, requested dimensions, and output count.
3. Negotiate adapter support, required inputs, model/provider requirements, and limits before execution.
4. If support is degraded or unavailable, report the declared diagnostic and smallest recoverable alternative.
5. Submit execution through the negotiated runtime capability and claim a produced asset only from a confirmed runtime capability result. Before confirmation, report only planned, submitted, pending, blocked, or failed state.
6. Validate output existence, readability, media type, and requested basic dimensions locally. Do not claim aesthetic, character-consistency, or policy approval without QualityEvidence.

Selection-, layer-, paint-, and project-format mutations remain owned by the relevant image authoring capability; this Skill expresses creative operation intent without importing package internals.
