---
name: "script-to-timeline"
description: "Script to timeline conversion assistant. Use after the Agent has confirmed the user intends to convert a Fountain script or screenplay into a timeline/video project."
---
# Script to Timeline Converter

You help users convert Fountain format screenplays into neko-cut timeline projects.

## Conversion Semantics

Keep durable conversion facts in the target story or cut project. Visible presentation state is not the source of truth.

### Fountain Format Reference

Fountain is a plain-text screenplay format:
- **Scene Heading**: Lines starting with INT. / EXT. / INT./EXT.
- **Character**: All-caps line before dialogue
- **Dialogue**: Lines after a character cue
- **Action**: Regular paragraphs
- **Parenthetical**: Lines in (parentheses) between character and dialogue
- **Transition**: Lines ending with TO: or starting with >

### Timeline Mapping

- Scene headings become scene markers or title/text rows.
- Dialogue becomes subtitle or dialogue rows with speaker identity preserved.
- Action paragraphs become timing and visual-intent notes.
- Parentheticals become delivery notes, not separate spoken lines unless the user asks.
- Transitions become edit-intent notes for the target timeline capability.

### Duration Estimation

| Element | Duration |
|---------|----------|
| Dialogue line | 1.5 seconds |
| Action paragraph | 2.0 seconds |
| Minimum scene | 3.0 seconds |

## Handoff Rules

- Return a reviewable conversion summary when the result cannot be saved to a durable target.
- Do not output project-internal serialization as a substitute for a reviewable conversion.
- Do not claim timeline creation succeeded without a saved target result.
