---
name: 'storyboard'
description: '将提示词、文本、剧本、文档、漫画、图像序列或已有分镜探索为灵活 Markdown；仅在明确专业创作意图下创建 canonical 结构化分镜。 Explore source material as flexible Markdown and create canonical structured Storyboards only on explicit professional intent.'
---

# Storyboard

## 中文方法

把提示词、文本、剧本、文档、漫画、有序图像序列或现有分镜修订解释为可评审的视觉规划。普通创作默认使用一份可直接更新的 Markdown 场景/镜头表；只有创作者明确要求专业结构化创作时，才生成并验证 canonical `scenes[] -> shots[]`。

1. 保留来源顺序、场景边界、对白语境、视觉证据和稳定来源引用；证据不足的镜头、时长、对白或画面主张必须标为不确定或 diagnostic。
2. 图像提示词属于 shot，视频提示词属于 scene；视觉说明、机位笔记和状态不能替代可执行生成提示词。
3. 漫画必须有像素、OCR 或面板边界证据才能声称面板、对白或动作。局部样本不能证明全卷情节、集数或总时长；代表性叙事单元可在公开方法和置信度时支持暂定区间。
4. 只有真正执行生成/编辑时才填写对应 prompt；可直接使用的参考图不需要伪造编辑工作。
5. 电影镜头、跨镜头连续性或授权参考视频迁移，仅按需读取对应 relative reference。

## English guidance

Interpret a prompt, prose, script, document, comic, ordered image sequence, or existing storyboard revision as reviewable visual planning. Use one updateable Markdown scene/shot table for ordinary creator review; materialize the canonical structured Storyboard only when the creator explicitly requests professional structured authoring.

## Method

1. Identify the source profile and preserve source order, scene boundaries, dialogue context, and visual evidence appropriate to that profile.
2. For an ordinary multi-shot plan or revision, produce one authoritative Markdown table. Use short local row labels such as `SC01` and `SH01` only to make later edits and generated-result links unambiguous; they are document labels, not a new domain model or workflow state. Preserve useful narrative, visual, action, camera, dialogue, sound, duration, reference, source-trace, and uncertainty content without requiring complete production fields.
3. For explicit professional structured creation or revision, produce stable scene and shot identities, visual intent, narrative context, camera and duration guidance, source trace, and a revision identity, then validate the canonical structure before mutation.
4. Use stable source references for source and reference media. Temporary processing details are never Storyboard truth.
5. Invalid, unsupported, or weakly evidenced source claims must remain explicit uncertainties or visible diagnostics. Do not invent production facts merely to fill a table.
6. Source Markdown never silently creates or rewrites structured production facts. Later edits remain review input until an explicit validated structured apply is requested.

## Markdown planning and structured invariants

- A multi-shot Markdown draft uses one table with only the columns the current work needs. Keep the same row labels and update the existing row when the creator revises a shot or a later capability returns a result; do not append a parallel table or turn review status into a second workflow model. A single-shot answer may remain prose. Missing duration, voice, media binding, or production identity is an uncertainty, not a reason to invent values or reject a useful draft.
- Preserve distinct narrative, visual, action, camera, dialogue, sound, duration, reference, image-generation, and video-generation meaning when present. Neither generation prompt is mandatory for an exploratory plan.

- After explicit structured authoring, the canonical artifact is nested `scenes[] -> shots[]`: a scene owns its ordered shots, and a scene cell in a review table never replaces the scene record. Shot media references remain shot facts.
- A structured review projection keeps distinct `scene`, `shot`, `source`, `imagePrompt`, `videoPrompt`, `duration`, and `dialogue` semantics. Never collapse image and video intent into one generic generation-prompt column.
- `imagePrompt` is shot-level and only describes an executable image generation or edit task. Include subject/appearance, scene, composition, style/light, reference role, preserved details, ordered edit steps when applicable, and constraints.
- `videoPrompt` is scene-level. Write at most one per scene, normally on its first shot, and aggregate the ordered shot beats, subject motion, camera transitions, environmental change, dialogue/audio or silence, total duration, reference roles, and constraints.
- Visual description, camera notes, action summaries, review states, and diagnostics do not substitute for either prompt. Leave a prompt empty when no generation/edit operation is intended; do not fill it with status codes or analysis fragments.
- Resource aliases must resolve unambiguously inside their declared scope. If a token matches multiple resources, emit a visible binding diagnostic and do not select or invent a source.

## Comic source profile

- Require actual pixel-level visual evidence, OCR, or panel boundaries before claiming panel count, dialogue, action, or camera. Metadata, thumbnails, filenames, dimensions, and page labels alone are not visual evidence. When evidence is unavailable, record the limitation and avoid authoritative panel/shot claims; a partial Markdown review may still preserve known source facts and next evidence needs.
- Treat source coverage separately from visual style sampling. A few arbitrary inspected pages may support observations about those pages, but cannot establish the whole work's plot coverage, adaptation runtime, episode count, episode mapping, or completed source analysis. For a local duration estimate, deliberately sample a bounded narrative unit or stratified ranges, account for story pages versus covers, contents, blanks, ads, duplicates and other non-story units, then record scenes or beats, dialogue, action, atmosphere, transitions and pacing. This may support a provisional work-specific range with stated method and confidence; page count alone is never a duration conversion rule. Before proposing fixed scale, state why samples represent the intended adaptation range and what remains unreviewed.
- Determine orientation and reading order before mapping panels. Classify dialogue, narration/caption, visible SFX, signs/background text, and unknown text separately; only spoken dialogue belongs in `dialogue`.
- Decide keep, skip, merge, split, or transition-only use before creating shots. A page may produce multiple shots, and covers, copyright/contents pages, blanks, ads, duplicates, or pure metadata do not become story shots by default.
- Build source trace from stable scoped resource identities. Attachment order and guessed filenames are not identity; a full-page source may be referenced by a stable page-plus-panel locator without pretending that a separate panel asset exists.

## Generation-effective prompt checks

- A non-empty prompt must be executable rather than a fragment, review label, or visual-analysis note. State reference purpose and check ambiguous references, conflicting instructions, overloaded content, unassigned resources, and duration mismatch.
- Image generation prompts cover appearance, environment, composition/camera, style/color/light, reference consistency, and constraints. Image edits additionally state what to preserve and the ordered crop/split/rotate/colorize/redraw/remove-text/inpaint/outpaint/upscale/style-normalization operations.
- Scene video prompts cover source/reference roles, characters and emotion, ordered or time-coded action beats, camera transitions, environmental change/effects, dialogue/narration/SFX or silence, pacing, total duration, and constraints. Long scenes should use explicit beat or time segments instead of an overloaded paragraph.
- When a reference image is directly usable and no image operation is intended, leave `imagePrompt` empty instead of inventing edit work.

Read only the method needed for the current request:

- Cinematic shot decisions: [references/cinematic-shot-design.md](references/cinematic-shot-design.md)
- Cross-shot visual continuity: [references/visual-continuity.md](references/visual-continuity.md)
- Authorized reference-video method adaptation: [references/reference-video-analysis.md](references/reference-video-analysis.md)

Default to the smallest reviewable Markdown result supported by the inspected source. A partial review should end with the next evidence boundary, not grow into a complete source-wide document. Only explicit professional structured authoring applies the validated canonical Storyboard; it keeps each scene as a container and each shot as its owned child while preserving revision, prompt intent, and stable media references. Never flatten a canonical Storyboard into a gallery or asset list. Existing structured Storyboard refinement creates a new revision when intent or ordering changes.
