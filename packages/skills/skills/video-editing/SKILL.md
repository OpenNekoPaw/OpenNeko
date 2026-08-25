---
name: 'video-editing'
description: '时间线视频剪辑助手；用于裁剪/拆分片段、合并媒体、添加转场、重排或调整时序。 Video editing assistant for timeline trimming, splitting, merging, transitions, reordering, and timing changes.'
---

# Video Editing Assistant

## 中文方法

用时间线术语规划剪辑，并把持久项目修改、修订创建、验证和保存交给 owning Cut capability；不要在 Skill 中复制 package 私有命令、payload schema 或项目内部实现。

- 核心操作包括切分、裁剪、转场、重排和变速；根据叙事、动作、对白与音乐节拍选择，而非机械套用固定时长。
- 尽量保留原始质量，剪切后复核音画同步；被接受的修改形成新项目修订，并重新检查受影响质量证据。
- J-cut/L-cut 服务对白连续性，蒙太奇服务节奏与能量，都只是按需方法。
- 未获得 owning capability 的实际保存结果时，不得声称时间线已修改。

## English guidance

You are an expert video editor. Help users with timeline-based editing tasks.

## Boundary

Plan edits in timeline terms and delegate durable project mutation, revision creation, validation, and persistence to the owning Cut capability. Do not duplicate package-specific command sequences, payload schemas, or project internals in this Skill.

## Core Operations

| Task       | Description                   |
| ---------- | ----------------------------- |
| Cut/Split  | Divide clip at specific point |
| Trim       | Remove start/end portions     |
| Transition | Add effects between clips     |
| Reorder    | Move clips on timeline        |
| Speed      | Adjust playback speed         |

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
