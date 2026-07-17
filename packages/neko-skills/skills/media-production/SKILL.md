---
name: "media-production"
description: "Guide adaptive source-to-deliverable production by selecting current owning capabilities and reassessing each actual result."
---
# Media Production

Coordinate an Agent-directed, recoverable source-to-deliverable production. Select and reorder work from current evidence and available capabilities; do not force every request through one fixed pipeline.

## Evidence and creator review

1. Read the actual source and existing project state before planning. Separate observed facts, Agent interpretation, creator decisions, and proposed actions. Never treat a filename, prompt, thumbnail, or old plan as content evidence.
2. Reuse current Storyboards, character references, generated assets, project revisions, Quality evidence, and approved documents when they remain valid. Skip satisfied work instead of recreating documents or assets.
3. Ask the creator to approve only material choices: adaptation target and omissions, story or character changes, core visual style, primary image/video/audio technique, cost or risk ceiling, mutation scope, and delivery boundary. Record alternatives, uncertainty, and unresolved questions.
4. A simple low-risk operation may proceed without creating planning files. For complex work, an optional `brief.md` may capture source evidence, interpretation, alternatives, creator decisions, and approval scope; it remains ordinary reviewable Markdown, not runtime state.

Ground each source in its own evidence: comics use actual page, panel, reading-order, dialogue, and character appearance evidence; screenplays use scene headings, action, dialogue, location, and timing intent; novels use chapter or scene boundaries, point of view, narration, dialogue, and adaptation omissions; illustrations use visible composition, subjects, layers when available, palette, and spatial relationships. Existing Storyboards and projects use their current revision, owned shots or timeline state, referenced assets, and validation evidence. When those existing facts already satisfy a work unit, mark it skipped or reused rather than rebuilding it.

## Actionable plan

Use an optional living `plan.md` only when it improves review or coordination. For every applicable work unit state: the object to change or create; trigger and skip conditions; stable inputs; capability intent; creative and technical constraints; expected output kind; acceptance evidence; failure or degraded branch; dependencies; and approval requirement. Broad phase lists are not execution-ready.

Keep near-term progress bounded with `pending`, `in_progress`, `completed`, or `blocked`, with at most one current unit per executing Agent task. Large shot, asset, and project graphs stay in their owning Storyboard, project revision, generated output, Quality result, or asynchronous task result. Progress text never proves completion.

Do not persist selected executors, provider handles, operation schemas, polling state, or workflow nodes in Markdown. Editing Markdown does not execute it. On continuation, reread the current documents and files, discover current capabilities again, and execute through their normal authorization and result lifecycle.

## Capability-aware execution and recovery

Choose milestones only when applicable: source interpretation; creator review; Storyboard or shot planning; character/reference preparation; image, video, or audio production; animatic or project authoring; Quality review; export; deliverable verification. Missing panel/OCR, character/reference, Storyboard, animatic/project, audio, Quality, export, or delivery capability must yield a visible `blocked`, `degraded`, or `partial` outcome with the smallest useful next decision.

Bounded reorder, batch split, equivalent capability selection, and local repair may remain inside approved scope. Story, character, core style or sound, primary technique, cost/risk, mutation, or delivery changes require renewed creator approval. Repairs target the owning capability, create a new asset or project revision, invalidate stale evidence, and rerun only affected acceptance or Quality checks.

Execution continues until requested deliverables are backed by actual current results. Report planned, submitted, or blocked state when results are absent; never present an intended asset, edit, export, or delivery as completed.
