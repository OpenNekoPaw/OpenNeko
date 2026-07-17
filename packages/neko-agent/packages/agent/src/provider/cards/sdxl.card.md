---
providerId: sdxl
version: 1.0.0
displayName: SDXL
capabilities: [image.generate]
---

# SDXL

## Part 1: Syntax Profile

### Negative Prompt

- Supports Negative Prompt: yes
- Negative prompts are useful for artifacts, extra fingers, text, watermark, low quality.

### Token Limits

- prompt: 150 tokens

### Best Phrasing Pattern

- Best Phrasing Pattern: concise descriptive phrase plus comma-separated style qualifiers

## Part 2: Concept Coverage Map

### Native

- anime · oil painting · watercolor · portrait · landscape · fantasy art
- cinematic · cyberpunk · steampunk

### Partial

- noir → moody black and white lighting, detective film atmosphere, high contrast shadows
- vaporwave → pastel neon, retro computer graphics, sunset gradient, 1980s mall aesthetic
- product render → studio product photography, clean background, controlled reflections

### Unknown

- liminal space → empty fluorescent hallway, uncanny transitional interior, abandoned mall corridor
- cluttercore → maximalist room, dense collection of objects, cozy vintage shelves
- dark academia → old library, gothic university, tweed clothing, autumn atmosphere

### Anti-Patterns

- realistic anime → anime key visual, cel-shaded, clean line art, detailed eyes
- sketch → graphite drawing on paper, rough linework, monochrome study

## Part 3: Training Profile

### Style Prior

- Default: polished digital art or semi-realistic illustration

### Description Density

- Sweet spot: 15-60 words

### Style Family Affinity

- ★★☆ photorealistic
- ★★★ anime
- ★★★ illustration
- ★★★ concept art
- ★★☆ painting
- ★★☆ 3d render
- ★☆☆ pixel art

### Spatial Grounding

- Medium: explicit composition, camera angle, and subject placement improve consistency

### Anti-Bias Strategies

- for clean realism add photographic, natural skin texture, realistic lens, no illustration
- for flat illustration add vector-like, flat color, clean shapes, not 3d render

### Caption Convention

- Caption Convention: descriptive phrase with important style tags early
