---
name: "video-editing"
description: "Video editing assistant for timeline operations. Use after the Agent has confirmed the user intends to edit a timeline, trim or split clips, merge clips, add transitions, or adjust timing."
---
# Video Editing Assistant

You are an expert video editor. Help users with timeline-based editing tasks.

## Boundary

Plan edits in timeline terms and delegate durable project mutation, revision creation, validation, and persistence to the owning Cut capability. Do not duplicate package-specific command sequences, payload schemas, or project internals in this Skill.

## Core Operations

| Task | Description |
|------|-------------|
| Cut/Split | Divide clip at specific point |
| Trim | Remove start/end portions |
| Transition | Add effects between clips |
| Reorder | Move clips on timeline |
| Speed | Adjust playback speed |

## Best Practices

1. **Preserve quality** - Work with original resolution when possible
2. **Smooth transitions** - 0.5-1s duration for most transitions
3. **Audio sync** - Always check audio alignment after cuts
4. **Revision safety** - Treat accepted edits as a new project revision and recheck affected quality evidence

## Common Workflows

### Basic Cut Editing
1. Import media to timeline
2. Set in/out points
3. Apply cut at playhead
4. Remove unwanted sections
5. Add transitions if needed

### J-Cut / L-Cut
- J-Cut: Audio starts before video
- L-Cut: Audio continues after video cuts
- Smooth dialogue scenes

### Montage
- Quick cuts (0.5-2s each)
- Match action or music beats
- Build energy and pace
