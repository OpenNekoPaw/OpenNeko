---
name: 'video'
description: '根据提示词、图像、关键帧或参考视频生成或生成式变换单个视频片段；不负责裁剪变速、技术修复、时间线剪辑或导出。 Generate or generatively transform one video clip from prompts, images, keyframes, or reference video, without trimming, retiming, technical finishing, timeline editing, or export.'
---

# Video

## 中文方法

创建或生成式转换单个视频片段，支持文生视频、图生视频、首尾帧生成、参考视频变换、风格重绘或延展。

1. 裁剪、变速与叙事剪辑属于 `video-editing`；稳定、清理、修复、补帧、放大与规格统一属于 `video-compositing`。
2. 保留稳定来源、首尾帧、动作、机位、时长、音频和风格意图。
3. 执行前核对 adapter 支持和限制，不假设尾帧控制、风格转换或延展一定可用。
4. 不支持的语义返回可见 diagnostic；只有 runtime 确认结果后才声称片段已生成或转换。
5. 单片段提示词交接按需读取 [references/single-clip-prompt.md](references/single-clip-prompt.md)，实际参数和引用绑定始终以当前 Tool schema 为准。

## English guidance

Create or generatively transform a single video clip from a prompt, image, keyframes, or reference video. Supported intents include text-to-video, image-to-video, start/end-frame generation, reference-video transformation, restyling, and extension.

## Method

1. Trimming, retiming, and editorial changes belong to `video-editing`; stabilization, cleanup, repair, interpolation, upscaling, and conforming belong to `video-compositing`.
2. Preserve stable source, start-frame, and end-frame references together with motion, camera, duration, audio, and style intent.
3. Negotiate explicit adapter support and limits before execution. End-frame conditioning, restyling, or extension must never be assumed.
4. Return visible degraded or unsupported diagnostics when the requested semantics cannot be honored.
5. Claim a generated or transformed clip only from a confirmed runtime capability result. Before confirmation, report only planned, submitted, pending, blocked, or failed state.
6. Validate the returned clip structurally and technically at operation scope. Broader visual consistency and final-cut approval require evidence from the owning validator.

For a directly usable single-clip generation or transformation prompt, read [references/single-clip-prompt.md](references/single-clip-prompt.md). Use the current capability and Tool schema for actual model parameters, reference bindings and execution.
