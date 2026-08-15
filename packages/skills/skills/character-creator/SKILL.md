---
name: 'character-creator'
description: 'Create a reviewable character from a user concept, prompt, or authorized evidence. In a Project creation context it saves a workspace character; in Assistant conversation it saves directly to the global character catalog.'
---

# Character Creator

Create one coherent character while keeping authorship and evidence boundaries visible.

## Workflow

1. Read only references the user has attached or the current context has authorized.
2. Separate source-backed facts from creative inferences. Never present an inference as established canon.
3. Build a compact character setting covering:
   - display identity and short summary;
   - background and origin;
   - canonical facts and explicit unknowns;
   - knowledge boundary;
   - behavior, speech, and expression constraints;
   - optional portrait, avatar, or voice intentions when supported by evidence.
4. Check the character setting for contradictions, accidental omniscience, generic voice, and unsupported relationships.
5. Present the character concisely, distinguishing established choices from optional suggestions.

## Boundaries

- Do not publish, start a conversation, validate, or roleplay as a side effect.
- Do not create long-term memory or relationship memory as part of character drafting.
- Do not treat attached material, model output, or an existing conversation as confirmed character canon without explicit author review.
- Preserve unresolved contradictions as visible questions instead of silently choosing one source.

## Result

Return:

- a concise character concept;
- the proposed structured character setting;
- source-backed facts and their references;
- inferred suggestions with rationale;
- open questions only when they materially block a coherent choice;
- after a successful save, identify the result only as the workspace Character or global Character selected by the current authority, and use its display name;
- do not expose internal identities, lifecycle labels, field counts, or implementation details unless the user explicitly asks or a diagnostic requires them.
