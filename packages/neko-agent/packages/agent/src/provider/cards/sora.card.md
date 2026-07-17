---
providerId: sora
version: 1.0.0
displayName: Sora
capabilities: [video.generate]
---

# Sora Provider Card

## Part 1: Syntax Profile

- Supports Negative Prompt: false
- prompt token limit: 1000
- Best Phrasing Pattern: natural language scene description with physics, camera path, and temporal continuity

## Part 2: Concept Coverage Map

### Native

- cinematic realism
- continuous motion
- character action
- camera tracking
- environmental detail

### Partial

- anime → animated film style with expressive character motion
- pixel art → retro animated game scene

### Unknown

- cluttercore → richly decorated room with dense personal objects

### Anti-Patterns

- impossible cuts → describe one continuous shot or explicit transition

## Part 3: Training Profile

### Style Prior

- Default: coherent cinematic video with realistic motion

### Description Density

- Sweet spot: 40-110 words

### Style Family Affinity

- ★★★ photorealistic
- ★★★ 3d-render
- ★★☆ concept art
- ★★☆ anime
- ★★☆ illustration

### Spatial Grounding

- Use clear temporal ordering, camera path, subject action, and environmental interactions.

### Anti-Bias Strategies

- ambiguous image prompts should be expanded with motion, duration, and camera continuity
- physically implausible actions should be phrased as stylized or surreal when intentional

### Caption Convention

- Caption Convention: descriptive paragraph with temporal sequence
