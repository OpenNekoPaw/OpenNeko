---
name: 'character-creator'
description: '根据用户概念、提示词或授权证据创建可评审角色，并按当前上下文保存到工作区或全局角色目录。 Create a reviewable character from a user concept, prompt, or authorized evidence and save it to the context-authorized workspace or global catalog.'
---

# Character Creator

## 中文方法

创建一个连贯、可评审的角色，并清楚区分作者决定、来源事实、创作推断和未知项。

1. 只读取用户提供或当前上下文已授权的参考资料。
2. 建立精简角色设定：身份与摘要、背景、已确认事实、未知项、知识边界、行为、语言和表情约束；肖像、头像或声音意图只在证据支持时加入。
3. 检查矛盾、意外全知、泛化声音和无来源关系，不要把推断写成既定正史。
4. 不把起草角色自动扩展为发布、对话、验证、扮演或长期记忆。
5. 成功保存后只以当前权限选择的工作区角色或全局角色及其显示名称说明结果；除诊断或用户要求外，不暴露内部 identity 和生命周期实现。

## English guidance

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
