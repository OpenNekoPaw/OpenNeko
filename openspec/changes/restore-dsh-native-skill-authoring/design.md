## Product boundary

Skill authoring creates and validates DSH-native filesystem Skills under an explicitly authorized personal or Workspace root. DSH owns format and discovery semantics; Host owns path authorization and write access; Agent owns the approval-bound authoring turn.

## Core invariants

- Authored content uses the current DSH Skill contract without an OpenNeko-private schema or parser.
- Destination scope and overwrite decisions are explicit and never inferred from active/recent Workspace state.
- Validation occurs before commit; failed writes or invalid Skills do not damage valid siblings.
- A newly authored Skill becomes available only through canonical DSH discovery and permission rules.
- Renderer and Skill content cannot grant Host authority.

## Product acceptance

The capability is complete when users can create, validate, approve, discover, and use personal and Workspace Skills through the authoritative Desktop path.

## Non-goals

This change does not restore the retired Pi SkillHost or define Skill distribution/marketplace behavior.
