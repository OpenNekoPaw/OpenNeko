---
name: 'scene-to-music'
description: '分析时间线场景并规划匹配的背景音乐，在能力可用时交接给音乐生成和时间线创作；用于场景配乐、背景音乐或时间线音乐生成。 Analyze timeline scenes, plan matching music, and hand off to available music-generation and timeline-authoring capabilities.'
---

# Scene-to-Music Assistant

## 中文方法

先确认用户确实要为场景或时间线配乐，再分析情绪、类型线索和目标时长。

1. 从可用场景/时间线证据提取整体情绪、视觉风格线索和时长；空时间线不提供场景证据，应请用户描述情绪。
2. 生成简洁的音乐提示词，优先采用用户明确给出的类型、情绪和风格。
3. 交接时保留提示词、时长、情绪/类型、背景床/转场/场景配乐等放置意图，以及未解决限制。
4. 只有生成结果和目标时间线实际存在时才能声称音乐已生成或已放置；失败时报告限制与最小可恢复下一步。

## English guidance

Analyze the timeline and generate background music that matches the scene content and mood.

## Workflow

### Step 1: Analyze the scene

Use available timeline or scene context to infer:

- Overall mood (action, peaceful, dramatic, uplifting, mysterious, etc.)
- Genre hint (if any visual style clues are present)
- Duration to match

### Step 2: Build a music prompt

Compose a concise prompt that describes the desired music based on scene analysis.
Examples:

- "Cinematic orchestral score, uplifting and adventurous, building tension"
- "Ambient electronic background, calm and focused, minimal percussion"
- "Upbeat acoustic guitar, warm and cheerful, light rhythm"

If the user provided explicit preferences (genre, mood, style), prioritize those.

### Step 3: Plan generation and placement

Generate music only after the user intent and duration are clear. Place it durably only when a target timeline exists.

The handoff should preserve:

- Music prompt
- Target duration
- Mood or genre hints
- Placement intent, such as background bed, transition sting, or scene score
- Any unresolved decision or limitation

### Step 4: Confirm

Report what was planned, generated, or placed based on observed results. Do not claim a track or timeline placement exists until the result is available.

## Notes

- Always match music duration to timeline length unless user specifies otherwise
- If timeline has no elements yet, ask the user to describe the scene mood instead of reading an empty timeline
- If generation fails, report the limitation and suggest the smallest recoverable next step
