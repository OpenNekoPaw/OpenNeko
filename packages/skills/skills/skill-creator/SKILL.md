---
name: skill-creator
description: '使用 DSH 原生布局、frontmatter、调用策略和可选资源创建或改进可复用 Skill；用于 Skill 设计、编写、验证与评审。 Create or refine reusable DSH Skills with native layouts, frontmatter, invocation policy, and optional resources.'
whenToUse: '用于 DSH Skill 编写和 package 评审；普通一次性任务不需要此 Skill。 Use for DSH Skill authoring and package review; ordinary one-off tasks do not require it.'
---

# Skill Creator

## 中文方法

创建聚焦、可复用且不约束无关任务的 DSH Skill。保持用户任务意图，并以当前 Tool catalog、schema、permission 和 Host authority 作为执行边界。

1. 使用原生目录 `<name>/SKILL.md` 或 flat `<name>.md`；资源使用相对路径并保留无关用户内容。
2. frontmatter 必须有小写 kebab-case `name` 和能区分能力与触发条件的简短 `description`；只按真实意图使用 DSH 支持的可选字段，不新增 OpenNeko 私有 manifest/schema。
3. 主体保留共同目的、关键判断和路由；长流程、schema、示例或领域变体进入按需资源，不创建占位目录或重复指令。
4. 同时定义正向和负向真实请求，按需要验证发现、加载、scope、调用策略和复杂行为。
5. 目录/flat、多 Skill 组合及四种 model/user 调用组合均有效；不得强制主 Skill、固定数量、artifact 前置或通过正文授予 Tool 权限。

## English guidance

Create focused reusable guidance that changes an Agent's decisions without constraining unrelated work. Preserve the user's intended task and rely on current Tool catalogs, schemas, permissions, and Host authority for execution.

## Choose the package

Use one of the native filesystem layouts:

- directory bundle: `<name>/SKILL.md`, with optional relative resources;
- flat Skill: `<name>.md`; any relative resources share that Skill root, so use collision-safe paths and preserve unrelated entries.

The Markdown frontmatter requires `name` and `description`. Use a lowercase kebab-case name and a short description that distinguishes both capability and trigger. Preserve supported optional `whenToUse`, `metadata`, `disable-model-invocation`, and `user-invocable` only when their semantics are intended. Do not add a manifest or private OpenNeko schema.

Keep shared purpose, essential judgment, and routing in the main body. Put substantial conditional procedures, schemas, examples, or domain variants in relative resources and link them where the Agent should read them. Do not create placeholder directories or duplicate instructions.

## Author and validate

1. Identify realistic requests that should and should not use the Skill.
2. Write the smallest body that improves those tasks. Prefer outcome criteria for open-ended work and exact steps or scripts only for fragile deterministic work.
3. Inspect existing package resources before updating them; preserve unrelated user content.
4. Validate the package through the available DSH-native authoring or filesystem path, then confirm the exact scoped catalog discovers and loads the intended definition.
5. Forward-test observable behavior when the change is complex enough to justify it.

Directory and flat layouts, all model/user invocation-policy combinations, and composition with multiple applicable Skills are valid. Do not impose a primary Skill, a fixed Skill count, an artifact-profile prerequisite, or Tool permission through Skill prose.

Report the created or changed package, validation evidence, and unresolved uncertainty. Do not claim publication, discovery, or execution until the corresponding runtime result confirms it.
