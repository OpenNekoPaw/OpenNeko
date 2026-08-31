---
name: 'sound-generation'
description: '根据已确认台词、表演、时码或声音意图生成对白、旁白、环境声和音效；配乐与混音分别由对应能力处理。 Generate dialogue, narration, ambience, and sound effects from approved text, performance, timing, or sound intent, separate from music composition and mixing.'
---

# Sound Generation

## 中文方法

为一个明确声音单元生成可观察音频，不处理配乐编曲或最终混音。

1. 绑定台词/声音事件、说话人或声源、表演/材质、语言、时码、时长和下游镜头/轨道。
2. 仅使用当前 Tool schema 承认的 TTS、语音、环境声或 SFX operation；声音克隆、受保护身份和授权参考必须满足当前权限边界。
3. 将对白表演、环境声结构和单次音效拆为可独立失败的调用，不用一个 prompt 同时生成整段混音。
4. 检查真实返回音频的存在、可读性、时长、声道/采样信息和可观察内容；未实际听取或测量时不声称表演、同步或响度通过。
5. 返回入选音频引用、生成记录和目标时间范围；最终放置、编辑与混音交给时间线和混音能力。

## English guidance

Generate one observable dialogue, narration, ambience, or SFX unit. Bind approved text or sound event, speaker/source, performance or material, language, timing, duration, and downstream shot or track. Use only operations admitted by the current Tool schema and respect voice/identity authorization. Keep dialogue performance, ambience structure, and discrete effects independently callable. Validate the returned audio structurally and from available listening or measurement evidence. Return the selected stable audio reference, generation record, and target time range; music composition, timeline placement, editing, and final mixing remain separate capabilities.
