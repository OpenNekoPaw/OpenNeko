# Builtin content Skill overlap audit

Date: 2026-08-23

## Decision

Keep one ordinary `content-authoring` Skill for cross-domain document depth and structure. Keep independently triggered domain judgment in its existing Skills. Put additional document forms that share the same trigger and five semantic slots into `content-authoring/references/`; create another Skill only when it has an independently testable routing boundary and can compose with `content-authoring` without duplicating it.

No catalog-size target, primary-Skill rule or merge requirement is introduced.

## Inventory disposition

| Group                      | Skills                                                                                                         | Independent owner                                                        | Decision                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Cross-domain content form  | `content-authoring`                                                                                            | Progressive depth, evidence/assumption separation, tables and AI handoff | Keep one Skill plus six on-demand guides                                              |
| Production orchestration   | `media-production`                                                                                             | Adaptive source-to-deliverable capability sequencing                     | Keep separate; its ordinary plan now emits only the next useful work units            |
| Quality review             | `media-quality-review`                                                                                         | Revision-bound evidence and Quality Gates                                | Keep separate; review is not document formatting                                      |
| Narrative/domain creation  | `character-creator`, `world-creator`, `script-generation`, `storyboard`                                        | Character, World, screenplay and Storyboard semantics                    | Keep separate and compose when a formal proposal or report is also requested          |
| Atomic generation          | `image`, `video`                                                                                               | Capability-neutral image/video generation intent and execution checks    | Keep separate; these may execute work while `content-authoring` only shapes a handoff |
| Editing and transformation | `audio-mixing`, `color-grading`, `video-editing`, `subtitle-assistant`, `scene-to-music`, `script-to-timeline` | Exact media/timeline operation judgment                                  | Keep separate; domain correctness checks are not over-generation by themselves        |
| Skill authoring            | `skill-creator`                                                                                                | DSH-native Skill package design and validation                           | Keep separate; it creates reusable guidance rather than ordinary content              |

## Evidence

- Routing: every retained domain Skill has a distinct user intent in its `description`; `content-authoring` explicitly targets document structure, output depth, tables and model/Tool handoff.
- Composition: `multi-skill-storyboard-proposal` requires exact `content-authoring` and `storyboard` receipts without appointing a primary Skill.
- Quality: concise analysis and explicit formal proposal cases protect both progressive contraction and user-requested expansion.
- Context cost: the locked DSH provider loads only the selected `SKILL.md` body. The six guides remain relative links, and `renderSkillContent` instructs the model to load referenced resources only as needed; the deterministic provider test proves guide contents are not preloaded.
- Remaining evidence: only a real-provider repeated run can prove which guide the model actually chose to read and measure output/token variance. Key-free tests cannot establish that behavior.

## Extension rule

Add or update a reference when the new norm:

- shares the same content-planning/formal-document trigger;
- changes sections, examples, table fields or handoff guidance only;
- is useful only after `content-authoring` has already been selected.

Create a separate Skill when the new norm:

- has realistic positive and adjacent-negative requests independent of document formatting;
- owns domain decisions or execution criteria that remain useful in a short answer;
- composes with other Skills without copying their routing or authority;
- justifies its discovery/body context cost through Evaluation evidence.

Do not split only because a future catalog has more references, and do not merge independent Skills merely to reduce their count.
