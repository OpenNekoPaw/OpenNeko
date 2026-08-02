---
name: "scene-to-music"
description: "Analyze timeline scenes and plan matching background music, then hand off to music generation and timeline authoring capabilities when available. Use after the Agent has confirmed the user intends to score a scene, add background music, or generate music for a timeline."
---
# Scene-to-Music Assistant

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
Use the runtime music generation capability only after the user intent and duration are clear. Use the runtime timeline authoring capability for durable placement when a target timeline exists.

The handoff should preserve:
- Music prompt
- Target duration
- Mood or genre hints
- Placement intent, such as background bed, transition sting, or scene score
- Any approval or diagnostic state

### Step 4: Confirm
Report what was planned, generated, or placed based on capability results. Do not claim a generated track or timeline placement exists until the relevant capability reports success.

## Notes
- Always match music duration to timeline length unless user specifies otherwise
- If timeline has no elements yet, ask the user to describe the scene mood instead of reading an empty timeline
- If generation fails, report the capability diagnostic and suggest the smallest recoverable next step
