---
name: 'video-compositing'
description: '对已生成或拍摄的视频片段执行遮罩、分层合成、清理、稳定、修复、补帧、放大或规格统一；不负责叙事剪辑、调色或导出。 Composite and technically finish existing video clips through masks, layers, cleanup, stabilization, repair, interpolation, upscaling, or conforming, separate from editorial cutting, grading, and export.'
---

# Video Compositing

## 中文方法

处理一个已有视频片段或明确合成范围。

1. 绑定精确片段、时间范围、前景/背景/遮罩/参考输入、要修复的问题和期望直接产物。
2. 只执行当前 Tool schema 承认的合成、清理、稳定、修复、补帧、放大或规格统一 operation；不存在的能力必须明确 blocked。
3. 保留帧率、时长、色彩空间、透明度、音频和时间码要求，除非目标 operation 明确改变其中一项。
4. 检查真实结果的边缘、遮罩泄漏、闪烁、漂移、形变、接缝、同步和技术规格；只修复观察到的问题。
5. 返回处理后片段的稳定引用、受影响范围和下游时间线位置；镜头选择、叙事剪辑、调色、混音与导出不属于本 Skill。

## English guidance

Process one existing clip or bounded composite range. Bind exact clip/time, foreground, background, mask and reference inputs, the observed defect, and direct output. Execute only compositing, cleanup, stabilization, repair, interpolation, upscaling, or conform operations exposed by the current Tool schema. Preserve frame rate, duration, color space, alpha, audio, and timecode unless the admitted operation intentionally changes them. Inspect real results for edges, matte leakage, flicker, drift, warping, seams, sync, and technical conformance. Return a stable processed-clip reference and downstream timeline position; selection, editorial cutting, grading, mixing, and export remain separate.
