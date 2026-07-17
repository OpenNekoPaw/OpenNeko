---
providerId: dalle
version: 1.0.0
displayName: DALL-E
capabilities: [image.generate]
---

# DALL-E

## Part 1: Syntax Profile

### Negative Prompt

- Supports Negative Prompt: no
- Rewrite avoidances as positive constraints, such as empty room instead of no people.

### Token Limits

- prompt: 400 tokens

### Best Phrasing Pattern

- Best Phrasing Pattern: clear natural language instruction with explicit constraints

## Part 2: Concept Coverage Map

### Native

- photorealistic · illustration · watercolor · children's book · product photo
- cyberpunk · noir · art deco · minimalist · cinematic

### Partial

- anime → anime-inspired illustration, cel-shaded character, expressive eyes
- 3d render → high quality 3D render, studio lighting, smooth materials
- pixel art → pixel art style, low resolution game sprite, blocky shapes

### Unknown

- liminal space → empty fluorescent hallway, uncanny quiet indoor space, transitional architecture
- dark academia → old library, gothic university, warm lamps, tweed and books

### Anti-Patterns

- no text → blank sign, symbol-only design, no readable lettering
- realistic hands → natural hand pose, five fingers, relaxed anatomy

## Part 3: Training Profile

### Style Prior

- Default: literal interpretation, clean composition, friendly illustration or polished realism

### Description Density

- Sweet spot: 25-90 words

### Style Family Affinity

- ★★★ photorealistic
- ★★☆ anime
- ★★★ illustration
- ★★☆ concept art
- ★☆☆ pixel art
- ★★☆ painting
- ★★★ 3d render

### Spatial Grounding

- Strong: follows explicit layout, object counts, and constraints better when stated plainly

### Anti-Bias Strategies

- for darker cinematic mood specify low-key lighting, deep shadows, restrained palette
- for non-cute output specify mature editorial tone, realistic proportions, subdued colors

### Caption Convention

- Caption Convention: plain-language instruction with subject, style, layout, and constraints
