---
name: 'media-production'
description: '将已有故事、剧本、分镜或视觉来源编译为可由当前 AI 能力执行、可观察和迭代的媒体生产图；也用于基于来源证据评估改编体量。 Compile story, screenplay, storyboard, or visual sources into observable and iteratable media-production operations admitted by current AI capabilities; also assess source-grounded adaptation scope.'
---

# Media Production

## 中文方法

把创作内容编译为当前 AI 能力真正能执行的生产图，而不是写一份“看起来完整”的制作流程。

1. 先读取真实来源和项目状态，区分观察事实、Agent 解释、创作者决定与拟议动作；复用仍有效的分镜、角色参考、资产、修订和已验证结果。
2. 格式、集数和时长决策前读取 [适配可行性与体量指南](references/adaptation-feasibility.md)。页数、目录、封面或任意少量页面不能直接证明全卷体量；代表性样本只能形成带方法、不确定性和置信度的暂定区间。
3. 一个生产单元只有在同时具有来源/上游绑定、创作转换、当前已注册能力、可观察直接产物和明确下游用途时，才可称为可执行。
4. 只有改编目标、故事/角色变化、核心风格、主要技术、成本风险、修改范围和交付边界等实质选择才要求创作者确认。
5. 用户要求执行时，继续调用真实能力直到得到目标产物、出现可见阻塞或到达创作者决策点；计划文本不是产物。

## Output boundary

Answer as a content creator making the next useful creative decision, not as an analyst documenting everything noticed. Explain only what is necessary to justify or execute the proposed handling. Do not combine an adaptation assessment, creative treatment, visual bible, production handbook, pilot proposal, and execution roadmap in one response.

- Put the proposed handling first. It must say what content to make now, what is deferred, and what result will decide the next move; it cannot contradict a later caveat.
- For assessment-only requests, return one conclusion, only the evidence that changes it, one material uncertainty, and one next evidence action.
- When the user asks for a plan or solution, expand only the nearest dependency-ready model call. It must bind exact source/reference inputs and their roles, one creative transformation, a currently admitted operation, a ready operation-specific prompt/input, direct output, observable acceptance, and the accepted result's next consumer. Dependent calls remain one-line transitions until their required upstream result has been observed and accepted. A source analysis, aesthetic summary, list of production disciplines, or generic recommendation is not a solution.
- The current call answers one primary creative uncertainty. Do not use one video, image, or audio call to simultaneously validate unlocked identity, appearance, composition, spatial scale, style, motion, performance, threat, sound, and edit rhythm. Start with the lowest-cost prerequisite whose accepted result can control the next call; preserve already approved layers as references rather than retesting them.
- If the user explicitly requests a broader graph, show at most three compact nodes with `ready` or `blocked` state, but fully specify only the one `ready` node. Never present a node that depends on an ungenerated or unselected result as ready.
- Check deliverable closure before naming the plan. Every defining beat of the claimed deliverable must be produced, assembled, or explicitly marked missing by a node. If the current frontier validates only one aspect, call it that test rather than a complete teaser, pilot, scene, or film plan.
- Do not add cinematography, art, sound, action, compositing, episode tables, or pilot design unless that specific content is part of the requested handling. Omit background already visible in the source and do not repeat a field in prose.
- For execution, report the observed result, failed acceptance, or exact blocker and the next affected operation. Do not append a speculative full-project plan.

More detail is justified only by an explicit request for that specific artifact or by a dependency required to execute it. Uncertainty narrows the answer; it does not justify listing every possible design decision.

Apply a no-orphan-information gate before responding. Every statement must have one named future use: a model-call input, a reference role, a candidate acceptance check, the next model call, a project mutation, or a material creator decision. Convert useful observations into those fields and delete everything else. Start with the current call or exact blocker; do not place a treatment or analysis section before it. If a unit cannot yet form a call packet, return only its exact missing input or capability and the operation that will consume it.

## English guidance

Compile creative content into recoverable source-to-deliverable operations. Do not substitute a phase list, production treatment, or checklist for AI-executable work.

## Executable production graph

A production unit is executable only when all five bindings are present:

1. **Source/upstream binding**: the exact scene, shot, line, panel, asset, or approved result it transforms.
2. **Creative transformation**: the content decision being performed, not a phase label.
3. **Admitted capability**: an operation visible in the current Tool catalog and allowed by its schema and authorization.
4. **Observable result**: a returned asset, job result, project revision, or review decision.
5. **Downstream consumer**: the shot, generation, edit, timeline position, comparison, or creator decision that uses the result.

For a generative operation, also include the ready-to-submit prompt or structured generation input. It must encode the creative transformation and reference roles rather than repeat analysis around the call.

If any binding is absent, identify the missing binding and stop describing that unit as executable. Never replace a missing capability with generic verbs such as prepare, produce, refine, integrate, review quality, or export.

Read [AI production graph and iteration](references/ai-production-graph.md) when the request requires shot-level generation, candidate comparison, continuity control, or iterative repair.

## Evidence and creator review

1. Read the actual source and existing project state before planning. Separate observed facts, Agent interpretation, creator decisions, and proposed actions. Never treat a filename, prompt, thumbnail, or old plan as content evidence.
2. Reuse current Storyboards, character references, generated assets, project revisions, validated results, and approved documents when they remain valid. Skip satisfied graph nodes instead of recreating documents or assets.
3. Ask the creator to approve only material choices: adaptation target and omissions, story or character changes, core visual style, primary image/video/audio technique, cost or risk ceiling, mutation scope, and delivery boundary. Record alternatives, uncertainty, and unresolved questions.
4. A simple low-risk operation may proceed without creating planning files. For complex work, an optional `brief.md` may capture source evidence, interpretation, alternatives, creator decisions, and approval scope; it remains ordinary reviewable Markdown, not runtime state.

Ground each source in its own evidence: comics use actual page, panel, reading-order, dialogue, and character appearance evidence; screenplays use scene headings, action, dialogue, location, and timing intent; novels use chapter or scene boundaries, point of view, narration, dialogue, and adaptation omissions; illustrations use visible composition, subjects, layers when available, palette, and spatial relationships. Existing Storyboards and projects use their current revision, owned shots or timeline state, referenced assets, and validation evidence. When those existing facts already satisfy a work unit, mark it skipped or reused rather than rebuilding it.

For adaptation scope, format, episode count, or runtime estimation, read [references/adaptation-feasibility.md](references/adaptation-feasibility.md). Do this before turning a source manifest, page count, chapter list, synopsis, or visual sample into a season, film, episode, or duration plan.

## Adaptation scope gate

Do not begin with a fixed format. First decide whether the inspected evidence supports a local estimate or source-wide scale judgment. A representative bounded sample may support a provisional range with its method, uncertainty and confidence stated. If even that is unsupported, the current output is a bounded coverage and adaptation-volume assessment: state what was actually reviewed, what remains unknown, which decisions are blocked, and the next evidence batch. A candidate range or format remains conditional until broader coverage supports it; it is not an approved production plan.

## Planning versus execution

Use task state or an optional `plan.md` only to coordinate actual multi-step execution. It is never the creative deliverable. For a planning-only request, return the nearest dependency-ready model call: source/reference inputs, creative operation, current capability, ready call input, direct artifact, downstream use, and an observable pass/fail condition. Summarize later nodes only as dependency transitions. Expand them after their upstream result is observed and accepted. Do not emit generic milestones, a full-project matrix, or a creative treatment before the current call.

Keep near-term progress bounded with `pending`, `in_progress`, `completed`, or `blocked`, with at most one current unit per executing Agent task. Large shot, asset, and project graphs stay in their owning Storyboard, project revision, generated output, validator result, or asynchronous task result. Progress text never proves completion.

Do not turn temporary execution details into production truth. On continuation, reread current documents, assets, and results before deciding the next useful work unit.

## Capability-aware execution and recovery

Discover current operations before acting. Source interpretation, reference creation, image/video/audio generation, Storyboard authoring, timeline mutation, validation, and export are separate capabilities and may be absent. A named production stage does not imply that a Tool exists. Missing evidence, operation, authorization, validator, or durable target must yield a visible `blocked`, `degraded`, or `partial` outcome at the smallest affected unit.

Bounded reorder, batch split, equivalent capability selection, and local repair may remain inside approved scope. Story, character, core style or sound, primary technique, cost/risk, mutation, or delivery changes require renewed creator approval. Repairs target the owning capability, create a new asset or project revision, invalidate stale evidence, and rerun only affected acceptance or owning validation checks.

Execution continues until requested deliverables are backed by actual current results. Report planned, submitted, or blocked state when results are absent; never present an intended asset, edit, export, or delivery as completed.
