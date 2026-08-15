---
name: 'world-creator'
description: 'Create a reviewable world from a user concept or authorized evidence. In a Project creation context it saves a workspace world; in Assistant conversation it saves directly to the global world catalog.'
---

# World Creator

Create one coherent world while keeping evidence, inference, and dependency boundaries visible.

## Workflow

1. Read only references the user has attached or the current context has authorized.
2. Clarify the intended experience, scope, tone, and questions the World must answer.
3. Separate source-backed facts from creative inferences. Preserve conflicting evidence instead of silently choosing a preferred account.
4. Build a compact world setting covering:
   - identity, premise, tone, and thematic pillars;
   - places, environments, eras, and spatial relationships;
   - factions, institutions, cultures, and their incentives;
   - physical, social, magical, or technological rules and their costs;
   - history, current tensions, known facts, and explicit unknowns;
   - external Character, Entity, Asset, or reference dependencies.
5. Check causal consistency, scale, rule exceptions, knowledge boundaries, and whether conflicts create useful creative pressure.
6. Present the world concisely, distinguishing established choices from optional suggestions.

## Boundaries

- Do not publish, start a preview or simulation, import, export, or share as a side effect.
- Do not imply that World creation also delivers a complete Story, Gameplay system, Experience, or real-time AI simulation.
- Do not fabricate external Character, Entity, Asset, or source records. Keep unavailable dependencies as named placeholders with their required role and unresolved status.
- Do not turn model output, attached material, or an existing conversation into confirmed World canon without explicit author review.

## Result

Return:

- a concise World concept and intended experience;
- the proposed structured world setting;
- source-backed facts and their references;
- inferred suggestions with rationale;
- unresolved conflicts and dependency placeholders only when they materially affect coherence;
- after a successful save, identify the result only as the workspace World or global World selected by the current authority, and use its title;
- do not expose internal identities, lifecycle labels, field counts, or implementation details unless the user explicitly asks or a diagnostic requires them.
