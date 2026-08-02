---
name: "storyboard"
description: "Explore prompts, text, scripts, documents, comics, image sequences, or existing Storyboards as flexible Markdown, and create canonical structured Storyboards only on explicit professional intent."
---
# Storyboard

Interpret a prompt, prose, script, document, comic, ordered image sequence, or existing storyboard revision as reviewable visual planning. Keep exploratory planning flexible; materialize the canonical structured Storyboard only when the creator explicitly requests professional structured authoring.

## Method

1. Identify the source profile and preserve source order, scene boundaries, dialogue context, and visual evidence appropriate to that profile.
2. For unspecified exploration, analysis, planning, alternatives, or a first draft, produce ordinary Markdown. Preserve useful narrative, visual, action, camera, dialogue, sound, duration, reference, source-trace, and uncertainty content without requiring fixed columns, complete production fields, or stable scene/shot identities.
3. For explicit professional structured creation or revision, produce stable scene and shot identities, visual intent, narrative context, camera and duration guidance, source trace, and a revision identity, then validate the canonical structure before mutation.
4. Use stable resource references for source and reference media. Cache paths, render URIs, provider task handles, and session handles are never Storyboard truth.
5. Invalid, unsupported, or weakly evidenced source claims must remain explicit uncertainties or visible diagnostics. Do not invent production facts merely to fill a table.
6. Source Markdown never silently creates or rewrites structured production facts. Later edits remain review input until an explicit validated structured apply is requested.

## Markdown planning and structured invariants

- Exploratory Markdown may use headings, prose, lists, or a table. Choose the smallest structure that helps review, and retain source-specific columns when useful. Missing duration, voice, media binding, or production identity is an uncertainty, not a reason to invent values or reject a useful draft.
- Preserve distinct narrative, visual, action, camera, dialogue, sound, duration, reference, image-generation, and video-generation meaning when present. Neither generation prompt is mandatory for an exploratory plan.

- After explicit structured authoring, the canonical artifact is nested `scenes[] -> shots[]`: a scene owns its ordered shots, and a scene cell in a review table never replaces the scene record. Shot media references remain shot facts.
- A structured review projection keeps distinct `scene`, `shot`, `source`, `imagePrompt`, `videoPrompt`, `duration`, and `dialogue` semantics. Never collapse image and video intent into one generic generation-prompt column.
- `imagePrompt` is shot-level and only describes an executable image generation or edit task. Include subject/appearance, scene, composition, style/light, reference role, preserved details, ordered edit steps when applicable, and constraints.
- `videoPrompt` is scene-level. Write at most one per scene, normally on its first shot, and aggregate the ordered shot beats, subject motion, camera transitions, environmental change, dialogue/audio or silence, total duration, reference roles, and constraints.
- Visual description, camera notes, action summaries, review states, and diagnostics do not substitute for either prompt. Leave a prompt empty when no generation/edit operation is intended; do not fill it with status codes or analysis fragments.
- Resource aliases must resolve unambiguously inside their declared scope. If a token matches multiple resources, emit a visible binding diagnostic and do not select or invent a source.

## Comic source profile

- Require actual pixel-level visual evidence, OCR, or panel boundaries before claiming panel count, dialogue, action, or camera. Metadata, thumbnails, filenames, dimensions, and page labels alone are not visual evidence. When evidence is unavailable, record the limitation and avoid authoritative panel/shot claims; a partial Markdown review may still preserve known source facts and next evidence needs.
- Determine orientation and reading order before mapping panels. Classify dialogue, narration/caption, visible SFX, signs/background text, and unknown text separately; only spoken dialogue belongs in `dialogue`.
- Decide keep, skip, merge, split, or transition-only use before creating shots. A page may produce multiple shots, and covers, copyright/contents pages, blanks, ads, duplicates, or pure metadata do not become story shots by default.
- Build source trace from stable scoped resource identities. Attachment order and guessed filenames are not identity; a full-page source may be referenced by a stable page-plus-panel locator without pretending that a separate panel asset exists.

## Generation-effective prompt checks

- A non-empty prompt must be executable rather than a fragment, review label, or visual-analysis note. State reference purpose and check ambiguous references, conflicting instructions, overloaded content, unassigned resources, and duration mismatch.
- Image generation prompts cover appearance, environment, composition/camera, style/color/light, reference consistency, and constraints. Image edits additionally state what to preserve and the ordered crop/split/rotate/colorize/redraw/remove-text/inpaint/outpaint/upscale/style-normalization operations.
- Scene video prompts cover source/reference roles, characters and emotion, ordered or time-coded action beats, camera transitions, environmental change/effects, dialogue/narration/SFX or silence, pacing, total duration, and constraints. Long scenes should use explicit beat or time segments instead of an overloaded paragraph.
- When a reference image is directly usable and no image operation is intended, leave `imagePrompt` empty instead of inventing edit work.

Default to one reviewable Markdown document. Only explicit professional structured authoring applies the validated canonical Storyboard; it keeps each scene as a container and each shot as its owned child while preserving revision, prompt intent, and stable media references. Never flatten a canonical Storyboard into a gallery or asset list. Existing structured Storyboard refinement creates a new revision when intent or ordering changes.
