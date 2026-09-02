---
name: 'media-selection'
description: '基于真实候选素材、镜头契约和连续性参考选择或淘汰图像、视频与音频结果，并给出可执行修复诊断；不执行重新生成。 Select or reject real image, video, or audio candidates against shot contracts and continuity references, producing repair diagnostics without regenerating media.'
---

# Media Selection

## 中文方法

只评审当前模型可实际观察的候选结果。

1. 绑定候选资产、来源/镜头契约、参考职责和下游用途；文件名、prompt、缩略图标签或任务状态不能代替内容观察。
2. 先检查硬失败：身份/数量、关键状态、空间轴线、时长、媒体规格和明显生成缺陷；再检查构图、动作、表演、光色、声音与跨镜头连续性。
3. 每个候选给出“推荐使用”“建议重做”或“需要并排比较”的创作建议，并只记录会改变用户选择或修复的可观察证据；建议本身不等于用户批准或项目写入。
4. 将失败归到一个责任层：参考/状态、构图/空间、运动/表演、光色/风格、声音、剪辑边界或技术规格。
5. 用户选择继续使用某候选后，输出稳定资产引用和下游绑定；修复只给 owning capability 可消费的精确差异，不代替生成、编辑或项目写入。

## English guidance

Review only candidates whose pixels, frames, or audio evidence are actually available. Bind each candidate to its shot contract, reference roles, and downstream use. Check hard identity, count, state, spatial, duration, media-spec, and generation failures before aesthetic or continuity criteria. Recommend use, regeneration, or side-by-side creator comparison with only decision-changing observed evidence; the recommendation is not creator approval or a project mutation. After the creator chooses a candidate, carry its stable asset reference and downstream binding. This Skill does not regenerate, edit, or mutate a project.
