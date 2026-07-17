---
providerId: runway
version: 1.0.0
displayName: Runway
capabilities: [video.generate]
---

# Runway Provider Card

## Part 1: Syntax Profile

- Supports Negative Prompt: false
- prompt token limit: 700
- Best Phrasing Pattern: concise cinematic video direction with subject, camera motion, scene action, and lighting

## Part 2: Concept Coverage Map

### Native

- cinematic camera movement
- subject motion
- establishing shot
- product reveal
- slow motion

### Partial

- anime → stylized animation, clean cel-shaded motion
- pixel art → retro game animation, blocky low-resolution style

### Unknown

- cluttercore → dense lived-in set dressing with many visible objects

### Anti-Patterns

- static poster → add camera movement and visible subject action

## Part 3: Training Profile

### Style Prior

- Default: cinematic short-form video clip

### Description Density

- Sweet spot: 25-70 words

### Style Family Affinity

- ★★★ photorealistic
- ★★★ 3d-render
- ★★☆ concept art
- ★★☆ illustration
- ★☆☆ anime

### Spatial Grounding

- Prefer explicit camera movement, subject action, scene continuity, and lighting changes.

### Anti-Bias Strategies

- still-image prompts should add temporal verbs, camera motion, and visible action beats
- avoid overloading with unrelated scene changes in short clips

### Caption Convention

- Caption Convention: single cinematic sentence or compact shot list
