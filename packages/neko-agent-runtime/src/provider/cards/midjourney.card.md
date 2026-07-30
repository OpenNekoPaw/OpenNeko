---
providerId: midjourney
version: 1.0.0
displayName: Midjourney
capabilities: [image.generate]
---

# Midjourney

## Part 1: Syntax Profile

### Negative Prompt

- Supports Negative Prompt: yes
- Prefer concise avoid lists; strong negative phrasing may be converted to provider-specific exclude syntax by adapters.

### Token Limits

- prompt: 300 tokens

### Best Phrasing Pattern

- Best Phrasing Pattern: evocative natural language with art-direction phrases

## Part 2: Concept Coverage Map

### Native

- cinematic · editorial · fashion photography · fantasy · surrealism · art deco
- cyberpunk · noir · vaporwave · steampunk · brutalist

### Partial

- anime → anime key visual, cel-shaded, expressive character design
- pixel art → pixel art sprite, low-resolution grid, limited palette, crisp edges
- technical diagram → clean technical illustration, labeled schematic, orthographic view

### Unknown

- wabi-sabi → japanese minimalism, imperfect rustic ceramic texture, quiet asymmetry
- cluttercore → maximalist interior, dense vintage objects, layered shelves, cozy chaos

### Anti-Patterns

- logo → flat vector logo mark, simple silhouette, plain background
- exact text → avoid relying on generated text; request blank signs or symbolic marks

## Part 3: Training Profile

### Style Prior

- Default: highly stylized cinematic beauty, dramatic composition, rich lighting

### Description Density

- Sweet spot: 20-70 words

### Style Family Affinity

- ★★★ photorealistic
- ★★☆ anime
- ★★★ illustration
- ★★★ concept art
- ★★☆ painting
- ★★☆ 3d render
- ★★☆ pixel art

### Spatial Grounding

- Strong: cinematic composition emerges well, but explicit lens and framing help art direction

### Anti-Bias Strategies

- for plain utilitarian output say minimal, functional, neutral lighting, no cinematic drama
- for diagrammatic output say clean schematic, orthographic, simple labels, white background

### Caption Convention

- Caption Convention: art-director sentence with mood, subject, medium, and composition
