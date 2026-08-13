# Character Creator Evaluation

## Authoring decision

- `update` `skill.character-creator/reviewable-character-proposal`: the builtin Skill content
  changed, so its Pi Host package fingerprint is updated. The case continues to prove that an
  ordinary unbound invocation remains an Assistant proposal and cannot mutate Character facts.
- `create`, currently `infrastructure-blocked`: management quick generation requires a visible
  Character Management action, an exact standalone or project-local CharacterProject creation
  context, the resulting authoring target receipt, a Character Creator submit, and standard Tool
  approval. The strict Evaluation workflow currently supports only Assistant `draft-bind`; it has
  no product-neutral operation for the Character Management transition or Character authoring
  target creation/binding. A per-case Character branch in the runner is forbidden.

## Required positive evidence

The future executable scenario must prove:

1. Character Management opens one fresh unbound Agent Draft and injects the exact builtin
   `character-creator` identity even when a same-name personal or project Skill exists.
2. The full prompt, mentions and authorized reference receipts survive the handoff.
3. The user explicitly selects standalone or project-local placement and creates one fresh exact
   CharacterProject target; no current/recent Workspace is inferred.
4. `chara.character.fillDraft` is present only after the exact authoring receipt, pauses for the
   standard Tool approval, and succeeds after approval.
5. The result exposes exact `open-character` and `open-character-studio` handoffs without creating
   a CharacterVersion, Conversation, Room, Storyline, continuity, memory or runtime fact.
6. Cancellation before target creation leaves all Character and Project facts unchanged.

Deterministic contract, Webview and Desktop tests cover this path until the external Evaluation
platform gains the missing public operation. `pnpm test:agent:eval` remains key-free harness
readiness only and is not Agent behavior evidence.
