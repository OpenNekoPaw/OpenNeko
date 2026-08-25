---
name: 'video'
description: '根据提示词、图像、关键帧或参考视频生成或转换单个视频片段，并与时间线剪辑区分。 Generate or transform one video clip from prompts, images, keyframes, or reference video, separate from timeline editing.'
---

# Video

## 中文方法

创建或转换单个视频片段，支持生成、变换、重绘风格、延展、增强、裁剪、变速或时间线素材准备。

1. 单片段操作与 timeline-wide 剪辑分离，后者属于 `video-editing` 和 Cut authoring。
2. 保留稳定来源、首尾帧、动作、机位、时长、音频和风格意图。
3. 执行前核对 adapter 支持和限制，不假设尾帧控制、风格转换、增强或延展一定可用。
4. 不支持的语义返回可见 diagnostic；只有 runtime 确认结果后才声称片段已生成或转换。
5. 单片段提示词交接按需读取 [references/single-clip-prompt.md](references/single-clip-prompt.md)，实际参数和引用绑定始终以当前 Tool schema 为准。

## English guidance

Create or transform a single video clip from a prompt, image, keyframes, or reference video. Supported intents include generation, transformation, restyling, extension, enhancement, trimming, retiming, and preparation for timeline authoring.

## Method

1. Separate single-clip creation or transformation from timeline-wide editing, which belongs to video-editing and Cut authoring.
2. Preserve stable source, start-frame, and end-frame references together with motion, camera, duration, audio, and style intent.
3. Negotiate explicit adapter support and limits before execution. End-frame conditioning, restyling, enhancement, or extension must never be assumed.
4. Return visible degraded or unsupported diagnostics when the requested semantics cannot be honored.
5. Claim a generated or transformed clip only from a confirmed runtime capability result. Before confirmation, report only planned, submitted, pending, blocked, or failed state.
6. Validate the returned clip structurally and technically at operation scope. Broader visual consistency and final-cut approval require evidence from the owning validator.

For a directly usable single-clip generation or transformation prompt, read [references/single-clip-prompt.md](references/single-clip-prompt.md). Use the current capability and Tool schema for actual model parameters, reference bindings and execution.
