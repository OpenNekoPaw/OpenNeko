## Why

OpenNeko discovers builtin, personal, Workspace and third-party Skills through one portable Skill model. `skill-creator` is one ordinary builtin Skill in that model; it must not acquire a dedicated Entry target, receipt, selector or runtime path merely because it can use a Host mutation Tool.

The Host still needs one safe `CreateSkill` capability that any eligible Skill or Agent turn can call. Its destination is derived from the exact Conversation owner: Assistant creates a personal Skill and a Workspace Conversation creates a Skill in that Workspace. The model cannot select another authority.

## What Changes

- Keep one ordinary builtin `$skill-creator` identity and run it through the same invocation path as every other Skill.
- Provide one generic confirmation-gated `CreateSkill` Host capability, independent of Skill name and portable Skill content.
- Derive the write destination from the exact Conversation owner instead of an Entry target selector or model-generated target.
- Create one validated package atomically and reject malformed, duplicate or unauthorized writes visibly.
- Remove the dedicated `skill-package` target kind, `skill-authoring` binding/receipt, target metadata and Webview selector.

## Capabilities

### New Capabilities

- `skill-authoring-targets`: Defines uniform Skill invocation and a generic, Conversation-authorized Skill package creation capability.

### Modified Capabilities

None.

## Impact

- `packages/agent/contracts` retains the existing portable Skill creation contract and generic `CreateSkill` Tool identity; it does not model a `skill-creator`-specific target.
- `packages/agent/runtime` owns the generic capability provider and canonical package creation service.
- `apps/neko-desktop` binds the provider to the exact Assistant or Workspace runtime root at composition time.
- `packages/agent/webview` uses the ordinary Skill command flow and adds no Skill-specific destination UI.
- Agent Evaluation covers ordinary Skill activation plus the generic Tool path and forbids the removed target-required path.
