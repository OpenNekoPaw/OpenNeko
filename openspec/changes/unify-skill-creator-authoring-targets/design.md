## Context

The portable `skill-creator` package provides methodology. Portable Skill content does not own filesystem access, authorization or Tool protocol. OpenNeko already has canonical `PortableSkillDefinition`, `CreateSkillInput`, `CreateSkillResult`, SkillHost discovery/validation and personal/Workspace Skill roots.

The previous implementation incorrectly treated Skill creation as a special Entry operation. It added a `skill-package` invocation target, `skill-authoring` receipt, pre-turn destination selector and Skill-name-specific capability. That confused a normal Skill invocation with the authority of a generic Host mutation.

## Goals / Non-Goals

**Goals:**

- Preserve one ordinary, portable `skill-creator` identity.
- Let the generic `CreateSkill` Tool create a new package under the exact Conversation authority.
- Keep authorization outside model arguments and portable Skill content.
- Reuse canonical Skill contracts, validation and path layout.
- Publish atomically without overwriting an existing package.

**Non-Goals:**

- A dedicated Entry mode, target selector, receipt or runtime path for `skill-creator`.
- Choosing an arbitrary Workspace from an Assistant Conversation.
- Marketplace publication, dependency installation, qualification or version management.
- Updating or merging an existing Skill package.
- A generic filesystem editor.

## Decisions

### Every Skill uses the same invocation path

`skill-creator` has no `openneko.authoring-target-kind` metadata and no dedicated command behavior. It is discovered, selected, activated and injected exactly like other builtin, personal, Workspace, plugin and third-party Skills. Runtime capability exposure never branches on Skill name.

### CreateSkill is a generic Host capability

The capability provider is named for Skill creation, not Skill Creator. Its Tool accepts a portable Skill definition and bundled resources. It does not accept a destination or Workspace identity. Any eligible turn can call the Tool, subject to the standard mutation approval.

The provider contributes only generic Tool usage constraints. Portable Skill bodies do not contain Tool tutorials, paths or Host authorization protocol.

### Conversation ownership determines the only destination

Desktop creates the provider within an exact Agent Workspace runtime:

- the Assistant space binds `CreateSkill` to the configured personal Skill root;
- a Workspace runtime binds it to that exact Workspace `.agents/skills` root.

The bound root is not read from active/recent UI state, Tool arguments or Entry receipts. Workspace authority is the already resolved runtime composition input. A turn cannot switch the provider to another root.

This mapping intentionally means that creating a Workspace Skill requires using that Workspace Conversation. It avoids an additional cross-Workspace picker and permission protocol.

### Package creation remains atomic and non-destructive

The Agent-owned Node service validates the portable definition and relative resources, stages the package, validates it through SkillHost and renames it to the bound root only when the same-name target is absent. Path containment is checked against the root authority. Existing packages remain byte-for-byte unchanged on failure.

The existing PersonalSkillManager continues to install a user-selected external directory. `CreateSkill` authors a new package from structured content; these are distinct operations, but both reuse SkillHost as the canonical package validator.

## Risks / Trade-offs

- [CreateSkill is available beyond `skill-creator`] → This is intentional: Tools are Host capabilities and Skills are not privileged callers. Standard Tool approval remains required.
- [Assistant cannot create directly in an arbitrary Workspace] → Use the exact Workspace Conversation; do not add cross-Workspace authority selection until a general product need exists.
- [Generated resources can be unsafe] → Reject absolute, traversal, duplicate and reserved paths before staging and enforce physical root containment.
- [Existing package update remains unsupported] → Reject duplicates visibly and design merge/update independently if required.
- [Real provider execution may be unavailable] → Keep deterministic path evidence and report the provider-backed case as infrastructure-blocked.

## Migration Plan

This is a prelaunch atomic replacement. Remove the dedicated target/binding/selector path before accepting the generic capability path. No persisted user data uses the discarded target shape. Already created portable packages remain ordinary Skills.

## Open Questions

None for creation-only scope.
