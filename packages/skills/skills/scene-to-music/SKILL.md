---
name: 'scene-to-music'
description: '把已确认的场景节拍编译为配乐结构并生成可观察音乐候选；不负责对白音效、时间线放置或最终混音。 Compile approved scene beats into a score structure and generate observable music candidates, without owning dialogue/SFX, timeline placement, or final mixing.'
---

# Scene-to-Music Assistant

## 中文方法

先确认用户确实要为场景或时间线配乐，再分析情绪、类型线索和目标时长。

1. 从可用场景/时间线证据提取节拍变化、情绪转折、对白空间、声音功能和时长；空时间线不提供场景证据。
2. 把音乐需求编译为可生成的乐段结构：时间段、能量曲线、配器/声音材质、节拍与必须避让的对白或音效。
3. 用户要求执行时，调用当前音乐生成能力并检查真实返回的乐段；仅有提示词不算生成。
4. 返回真实音乐候选、生成记录和精确放置意图；时间线导入与片段放置由对应时间线能力处理。
5. 只有生成结果实际存在时才能声称音乐已生成；没有时间线保存结果时不得声称已放置。

## English guidance

Analyze the timeline and generate background music that matches the scene content and mood.

## Workflow

### Step 1: Analyze the scene

Use available timeline or scene context to infer:

- Overall mood (action, peaceful, dramatic, uplifting, mysterious, etc.)
- Genre hint (if any visual style clues are present)
- Duration to match

### Step 2: Build a generation operation

Compile time segments, energy curve, instrumentation or sound material, rhythm, dialogue/SFX exclusions, and duration into a generation prompt based on scene evidence.
Examples:

- "Cinematic orchestral score, uplifting and adventurous, building tension"
- "Ambient electronic background, calm and focused, minimal percussion"
- "Upbeat acoustic guitar, warm and cheerful, light rhythm"

If the user provided explicit preferences (genre, mood, style), prioritize those.

### Step 3: Generate and inspect

When execution is requested, submit a real music generation through the currently admitted capability and inspect the returned track. Prompt text alone is not generated music.

The handoff should preserve:

- Music prompt
- Target duration
- Mood or genre hints
- Placement intent, such as background bed, transition sting, or scene score
- Any unresolved decision or limitation

### Step 4: Handoff placement

Return the selected result and exact placement intent to the timeline capability. Do not import or place media from this Skill, and do not claim placement without an observed saved timeline result.

## Notes

- Always match music duration to timeline length unless user specifies otherwise
- If timeline has no elements yet, ask the user to describe the scene mood instead of reading an empty timeline
- If generation fails, report the limitation and suggest the smallest recoverable next step
