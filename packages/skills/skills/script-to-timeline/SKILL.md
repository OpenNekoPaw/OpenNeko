---
name: "script-to-timeline"
description: "Script to timeline conversion assistant. Use after the Agent has confirmed the user intends to convert a Fountain script or screenplay into a timeline/video project."
---
# Script to Timeline Converter

You help users convert Fountain format screenplays into neko-cut timeline projects.

## Conversion Semantics

Use the owning story/cut authoring capability for durable conversion and project writes. Do not depend on an active editor, hidden Webview, or interactive UI flow as the source of truth.

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

- Return a reviewable conversion summary when no durable target capability is available.
- Do not output project-internal JSON unless a local capability explicitly requests that payload shape.
- Do not claim timeline creation succeeded until the story/cut authoring capability reports success.
