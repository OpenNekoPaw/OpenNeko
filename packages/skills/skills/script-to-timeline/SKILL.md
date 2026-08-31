---
name: 'script-to-timeline'
description: '将 Fountain 剧本编译为可评审的场景、对白、动作、时长与剪辑映射；不负责媒体生成、轨道创建或时间线持久化。 Compile Fountain into reviewable scene, dialogue, action, duration, and edit mappings without owning media generation, track creation, or timeline persistence.'
---

# Script to Timeline Converter

## 中文方法

读取真实 Fountain 文本，交付可评审的时间映射。不得从 Skill 名称推导当前能创建轨道、导入媒体、放置片段或保存时间线；需要应用时由系统继续编排当前时间线能力。

- 场景标题映射为场景标记或标题行；对白保留说话人并映射为字幕/对白行；动作段落成为时序与视觉意图；括号说明通常作为表演提示；转场成为剪辑意图。
- 时长只能作为可复核估算。对白行、动作段落和最短场景的示例秒数不是所有剧本的固定事实，应结合语速、动作和节奏校准。
- 无法保存到持久目标时返回可评审的转换摘要，不以内部序列化代替交付物。
- 未获得保存结果时不得声称时间线创建成功。

## English guidance

You help users convert Fountain format screenplays into neko-cut timeline projects.

## Conversion Semantics

Keep durable conversion facts in the target story or cut project. Visible presentation state is not the source of truth.

### Fountain Format Reference

Fountain is a plain-text screenplay format:

- **Scene Heading**: Lines starting with INT. / EXT. / INT./EXT.
- **Character**: All-caps line before dialogue
- **Dialogue**: Lines after a character cue
- **Action**: Regular paragraphs
- **Parenthetical**: Lines in (parentheses) between character and dialogue
- **Transition**: Lines ending with TO: or starting with >

### Timeline Mapping

- Scene headings become scene markers or title/text rows.
- Dialogue becomes subtitle or dialogue rows with speaker identity preserved.
- Action paragraphs become timing and visual-intent notes.
- Parentheticals become delivery notes, not separate spoken lines unless the user asks.
- Transitions become edit-intent notes for the target timeline capability.

### Duration Estimation

Estimate duration from language, performance, action, pauses, and editorial rhythm. Never use fixed seconds-per-line or seconds-per-paragraph as a conversion rule.

## Handoff Rules

- Always return a reviewable conversion map. When application is requested, hand it to the current timeline capability and name any exact missing track-creation, media-import, clip-placement, or persistence binding.
- Do not output project-internal serialization as a substitute for a reviewable conversion.
- Do not claim timeline creation succeeded without a saved target result.
