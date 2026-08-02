---
name: "skill-creator"
description: "Guide for creating or updating reusable portable Agent Skills. Use when the user wants to design, create, refine, validate, or forward-test a Skill package without imposing a host-specific authoring gate."
---
# Skill Creator

Guide the creation or refinement of reusable, portable Agent Skills. A Skill is a focused package of instructions and optional resources that helps an Agent perform a recurring class of work consistently.

This guidance does not own filesystem access, permissions, activation, or trust. Any host-supported authoring path may create the same portable package. Choose the available path that best fits the task and the user's instructions.

## Decide Before Writing

1. Confirm that reusable guidance is more appropriate than a one-off answer or a product feature.
2. Identify the recurring trigger, expected outcome, important constraints, and evidence of success.
3. Choose the smallest useful package: instructions only, or instructions plus reusable scripts, references, assets, or host metadata.
4. Keep the portable method in the Skill and keep host runtime protocols, internal schemas, and product-specific wiring outside it.

Use a short lowercase hyphenated name. Write a description that states both what the Skill does and when it should be used.

## Portable Package

A portable Skill package has this shape:

~~~text
skill-name/
├── SKILL.md
├── scripts/              # optional
├── references/           # optional
├── assets/               # optional
└── agents/
    └── <host>.yaml       # optional host metadata
~~~

- `SKILL.md` is required. Its frontmatter defines `name` and `description`; its body contains the guidance loaded when the Skill is used.
- `scripts/` contains deterministic or frequently repeated operations.
- `references/` contains detailed material that should be loaded only when needed.
- `assets/` contains templates or files used in produced output rather than prompt context.
- `agents/<host>.yaml` is an optional host overlay. Preserve overlays for other hosts when updating a shared Skill.
- A root `manifest.json` is not part of the portable Skill contract. Do not require one for creation or reuse.

## Authoring Principles

- Be concise. Assume the Agent already knows general concepts and include only task-specific judgment, procedure, or constraints.
- Match specificity to risk: use flexible guidance for contextual work and scripts or exact steps for fragile deterministic work.
- Put the main workflow in `SKILL.md`; move large examples, schemas, and background material into `references/`.
- Make references discoverable from `SKILL.md` and avoid deep chains of references.
- Reuse existing files when updating a Skill. Do not replace user-authored resources or other-host overlays without a task-specific reason.
- Keep secrets, machine-specific absolute paths, runtime tool schemas, and host-internal protocols out of portable content.

Draft, review, and apply may be useful authoring techniques, but they are not mandatory Skill-creation gates. User approval is required only when the active host policy or the user's instructions require it; the Skill itself must not invent an approval barrier.

## Validation

Before reporting completion:

1. Check the package shape, frontmatter, names, links, and referenced files.
2. Run bundled scripts or focused tests when present.
3. Inspect the Skill for duplicated generic knowledge, hidden host coupling, obsolete manifest requirements, and unsupported claims.
4. Forward-test with realistic prompts that should trigger the Skill and nearby prompts that should not.
5. Report what was created or changed, what was validated, and any remaining uncertainty. Do not claim files were written unless the selected authoring path confirmed the write.
