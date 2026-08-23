---
name: 'script-to-timeline'
description: '剧本转时间线助手；用于将 Fountain 剧本或 screenplay 转换为时间线/视频项目。 Script-to-timeline assistant for converting Fountain screenplays into timeline or video projects.'
---

# Script to Timeline Converter

## 中文方法

把 Fountain 剧本转换为可评审的时间线计划，并把持久转换事实保存在目标故事或剪辑项目中；可见界面状态不是事实来源。

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

| Element          | Duration    |
| ---------------- | ----------- |
| Dialogue line    | 1.5 seconds |
| Action paragraph | 2.0 seconds |
| Minimum scene    | 3.0 seconds |

## Handoff Rules

- Return a reviewable conversion summary when the result cannot be saved to a durable target.
- Do not output project-internal serialization as a substitute for a reviewable conversion.
- Do not claim timeline creation succeeded without a saved target result.
