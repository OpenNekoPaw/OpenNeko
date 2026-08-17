---
name: "video"
description: "Generate or transform a single video clip from prompts, images, keyframes, or reference video, separate from timeline editing."
---
# Video

Create or transform a single video clip from a prompt, image, keyframes, or reference video. Supported intents include generation, transformation, restyling, extension, enhancement, trimming, retiming, and preparation for timeline authoring.

## Method

1. Separate single-clip creation or transformation from timeline-wide editing, which belongs to video-editing and Cut authoring.
2. Preserve stable source, start-frame, and end-frame references together with motion, camera, duration, audio, and style intent.
3. Turn the desired clip into provider-neutral expression constraints: subject continuity, shot scale and camera, action and motion, environment, style and light, audio or dialogue when relevant, duration and pacing, required details, preservation constraints, and unwanted changes. Keep observed source evidence separate from desired output instructions.
4. Negotiate explicit adapter support and limits before execution. End-frame conditioning, restyling, enhancement, or extension must never be assumed.
5. Return visible degraded or unsupported diagnostics when the requested semantics cannot be honored.
6. Claim a generated or transformed clip only from a confirmed runtime capability result. Before confirmation, report only planned, submitted, pending, blocked, or failed state.
7. Validate the returned clip structurally and technically at operation scope. Broader visual consistency and final-cut approval require media-quality-review evidence.
