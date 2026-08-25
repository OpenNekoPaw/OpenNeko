---
name: 'media-production'
description: '基于来源证据评估动画化/影视化体量、格式与时长，并用当前能力组织从来源到交付物的自适应制作。 Assess source-grounded adaptation scope, format, and runtime, then guide adaptive source-to-deliverable production with current capabilities.'
---

# Media Production

## 中文方法

依据当前证据和可用能力组织可恢复的来源到交付物制作，不强制固定流水线。

1. 先读取真实来源和项目状态，区分观察事实、Agent 解释、创作者决定与拟议动作；复用仍有效的分镜、角色参考、资产、修订和质量证据。
2. 格式、集数和时长决策前读取 [适配可行性与体量指南](references/adaptation-feasibility.md)。页数、目录、封面或任意少量页面不能直接证明全卷体量；代表性样本只能形成带方法、不确定性和置信度的暂定区间。
3. 普通请求只给下一批有用工作及验收证据；仅在正式执行计划或当前决定确实需要时加入完整字段和矩阵。
4. 只有改编目标、故事/角色变化、核心风格、主要技术、成本风险、修改范围和交付边界等实质选择才要求创作者确认。
5. 缺失能力必须返回可见的 `blocked`、`degraded` 或 `partial`；只有实际结果才能证明资产、编辑、导出或交付完成。

## English guidance

Coordinate an Agent-directed, recoverable source-to-deliverable production. Select and reorder work from current evidence and available capabilities; do not force every request through one fixed pipeline.

## Evidence and creator review

1. Read the actual source and existing project state before planning. Separate observed facts, Agent interpretation, creator decisions, and proposed actions. Never treat a filename, prompt, thumbnail, or old plan as content evidence.
2. Reuse current Storyboards, character references, generated assets, project revisions, Quality evidence, and approved documents when they remain valid. Skip satisfied work instead of recreating documents or assets.
3. Ask the creator to approve only material choices: adaptation target and omissions, story or character changes, core visual style, primary image/video/audio technique, cost or risk ceiling, mutation scope, and delivery boundary. Record alternatives, uncertainty, and unresolved questions.
4. A simple low-risk operation may proceed without creating planning files. For complex work, an optional `brief.md` may capture source evidence, interpretation, alternatives, creator decisions, and approval scope; it remains ordinary reviewable Markdown, not runtime state.

Ground each source in its own evidence: comics use actual page, panel, reading-order, dialogue, and character appearance evidence; screenplays use scene headings, action, dialogue, location, and timing intent; novels use chapter or scene boundaries, point of view, narration, dialogue, and adaptation omissions; illustrations use visible composition, subjects, layers when available, palette, and spatial relationships. Existing Storyboards and projects use their current revision, owned shots or timeline state, referenced assets, and validation evidence. When those existing facts already satisfy a work unit, mark it skipped or reused rather than rebuilding it.

For adaptation scope, format, episode count, or runtime estimation, read [references/adaptation-feasibility.md](references/adaptation-feasibility.md). Do this before turning a source manifest, page count, chapter list, synopsis, or visual sample into a season, film, episode, or duration plan.

## Adaptation scope gate

Do not begin with a fixed format. First decide whether the inspected evidence supports a local estimate or source-wide scale judgment. A representative bounded sample may support a provisional range with its method, uncertainty and confidence stated. If even that is unsupported, the current output is a bounded coverage and adaptation-volume assessment: state what was actually reviewed, what remains unknown, which decisions are blocked, and the next evidence batch. A candidate range or format remains conditional until broader coverage supports it; it is not an approved production plan.

## Actionable plan

Use an optional living `plan.md` only when it improves review or coordination. For ordinary planning, state the next useful work units, their intended result, and acceptance evidence. Add trigger and skip conditions, stable inputs, capability intent, creative and technical constraints, failure branches, dependencies, and approval requirements only for a formal execution plan or when those fields affect the next decision. Do not emit a full work-unit matrix merely because production may later become complex.

Keep near-term progress bounded with `pending`, `in_progress`, `completed`, or `blocked`, with at most one current unit per executing Agent task. Large shot, asset, and project graphs stay in their owning Storyboard, project revision, generated output, Quality result, or asynchronous task result. Progress text never proves completion.

Do not turn temporary execution details into production truth. On continuation, reread current documents, assets, and results before deciding the next useful work unit.

## Capability-aware execution and recovery

Choose milestones only when applicable: source interpretation; creator review; Storyboard or shot planning; character/reference preparation; image, video, or audio production; animatic or project authoring; Quality review; export; deliverable verification. Missing panel/OCR, character/reference, Storyboard, animatic/project, audio, Quality, export, or delivery capability must yield a visible `blocked`, `degraded`, or `partial` outcome with the smallest useful next decision.

Bounded reorder, batch split, equivalent capability selection, and local repair may remain inside approved scope. Story, character, core style or sound, primary technique, cost/risk, mutation, or delivery changes require renewed creator approval. Repairs target the owning capability, create a new asset or project revision, invalidate stale evidence, and rerun only affected acceptance or Quality checks.

Execution continues until requested deliverables are backed by actual current results. Report planned, submitted, or blocked state when results are absent; never present an intended asset, edit, export, or delivery as completed.
