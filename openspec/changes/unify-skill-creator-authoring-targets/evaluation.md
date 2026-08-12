## Evaluation Scope

- Change/feature: ordinary `skill-creator` invocation plus generic Conversation-owned `CreateSkill` capability.
- Decision and owning suite: update the existing `skill.skill-creator` suite; delete the target-less rejection case because absence of a Skill-specific receipt is now the canonical path.
- Why real Evaluation is required: Skill injection and Tool routing can affect real Agent behavior and durable artifact creation.
- Canonical path: ordinary builtin Skill identity → prompt composition → generic `CreateSkill` → Conversation-owned Skill root → SkillHost validation.
- Forbidden fallback: Skill-name routing, `skill-package` target, `skill-authoring` receipt, model-selected destination, active/recent Workspace, generic Write Tool or `.neko/skills`.

## Cases

- Updated: `create-portable-skill`, `reject-invalid-skill`, `reject-resource-traversal`, and `reject-existing-target` no longer pass a Tool target; the Workspace Conversation owns the destination.
- Removed: `reject-missing-authoring-target`, because an ordinary Skill invocation without a dedicated receipt must proceed rather than reject.
- Deterministic evidence: contracts reject the removed target shape; Webview submits `$skill-creator <prompt>` with `entryTargetReceipt: null`; provider tests prove personal/project destination injection and reject a model-supplied target; package service tests prove containment, validation, duplicate preservation and atomic publication.

## Verification

- Key-free validation: `pnpm test:agent:eval` passed 45 files / 307 tests and the all-suite dry-run passed 26 suites / 76 cases.
- Real provider case: not executed; this pass intentionally stopped before model submission and mutation.
- The positive artifact cases still require the complete Desktop session owner, a configured provider, standard Tool approval and post-run filesystem evidence. A direct runtime runner or prewritten receipt is not acceptable.

## UI Validation

- Applicable surface: Assistant and Workspace composer Skill invocation.
- Expected visible behavior: selecting or typing `$skill-creator <prompt>` follows the ordinary Skill path, displays no destination selector or target chip and does not navigate.
- Desktop evidence: Computer Use inspected the current repository Electron dev runtime. Typing `$skill-creator` exposed the localized ordinary Skill menu entry; selecting it produced `$skill-creator ` in the Assistant composer. The Assistant tab remained selected and no destination selector, target chip or navigation change appeared. The accessibility tree and screenshot agreed. The draft was cleared after inspection; no model turn or file mutation was started.

## Residual Risk

- Provider-backed confirmed mutation remains unverified until the complete Desktop driver can approve `CreateSkill` and inspect the created package under the Conversation-owned root.
