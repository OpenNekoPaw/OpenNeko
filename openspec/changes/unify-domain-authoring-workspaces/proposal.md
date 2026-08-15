## Why

> World first-closure reconciliation (2026-08-14):
> `refine-world-management-authoring-and-runtime` owns World Management, World authoring preview,
> portable transfer and deterministic Runtime product composition while this change continues to own
> shared Workspace authority, placement and slot geometry.

OpenNeko currently treats a directory-backed Workspace as a Content Project context while Character and World authoring use separate product surfaces and persistence assumptions. This prevents one project from coherently authoring content, project-local Characters, and project-local Worlds, and it also encourages Agent entry, management navigation, authoring targets, and runtime modes to be expressed by one ambiguous selector.

## What Changes

- Define one domain-neutral Authoring Workspace boundary for directory authorization, relative-path access, shared creative resources, Agent authoring context, Workbench presentation, and explicit authoring-target selection.
- Keep Content, Character, and World facts under their existing package owners. Workspace and Desktop composition do not introduce a generic creative aggregate, cross-domain CRUD service, writable registry, or shared fact schema.
- Let a Content Project Workspace contain project-local CharacterProject and WorldProject authoring targets. These records use the canonical Chara and World contracts/services, remain stored under the exact Project Workspace authority, and do not automatically appear in standalone Character or World libraries.
- Let Character and World be authored independently through library-managed Workspace roots using the same Character Studio, World Studio, authoring services, codecs, and publication paths used by project-local targets.
- Add direct Content Project, Character, and World management destinations to the application sidebar. They may share the controlled Workbench shell and package-neutral layout primitives, but each destination mounts only its owner catalog and detail surfaces and exposes no in-scene domain mode switch.
- Compose the visible Workbench from `Workspace authority + exact Authoring target + owner-provided tool surfaces`. Switching targets replaces the visible domain Root and tools; it does not retain hidden editors, infer an active target, or change unrelated runtime ownership.
- Allow a project to create a local Character or World, or bind an exact independently published CharacterVersion/WorldExperienceVersion. Project composition owns only membership and exact references; it does not copy or edit external domain facts.
- **BREAKING**: replace the Agent Entry presentation labels `Assistant | Workspace | Character | World` with intent-qualified `Assistant | Authoring | Character Dialogue | World Experience`. Authoring selects an exact Workspace and target; Character Dialogue and World Experience remain runtime launch intents rather than management or authoring navigation.
- Keep Content authoring non-runnable. Character Dialogue/Room and World Experience continue to materialize only from exact eligible published versions through their owning runtimes; authoring tests/previews remain distinct from formal runs.
- Preserve fail-visible product qualification: an unavailable Character/World owner, invalid local record, missing Workspace grant, stale target, or unresolved dependency disables only the affected target or operation and never falls back to Assistant, Content, an active record, a global library copy, or an empty success path.

## Capabilities

### New Capabilities

- `domain-authoring-workspace-management`: Defines shared Authoring Workspace authority, exact domain targets, project-local versus standalone placement, Creative Management catalogs, project composition references, tool composition, and authoring/runtime separation.

### Modified Capabilities

- `desktop-creative-workbench-layout`: Extends the controlled Workbench from Content-only creative views to explicit Content, Character, and World authoring targets while preserving one visible Root per slot and package-owned tools.
- `home-experience-entry-modes`: Replaces ambiguous domain nouns with Authoring, Character Dialogue, and World Experience intents and requires Authoring to select exact Workspace and authoring-target authority without turning Agent Entry into management navigation.

## Impact

- Owning responsibilities: Workspace/Host owns directory authorization and exact root access; a new narrow `@neko/project` owner owns only Content Project composition membership and exact domain references; Content/Text/Canvas/Cut own traditional content artifacts; `@neko/chara` owns CharacterProject/Version and Character authoring/publication; `@neko/world` owns WorldProject/Story/Gameplay/Experience authoring/publication; Agent owns Draft/Conversation/Turn and typed capability consumption; Desktop owns only Window navigation, Workbench slot composition, trust-boundary adapters, and current visible presentation.
- Package roles: `@neko/project` provides the host-neutral composition contract/application service and `@neko/project-node` its atomic workspace-relative repository; authoring-target and placement contracts otherwise remain in the applicable owning packages and `@neko/host` public authorization ports. Chara/World Node packages own their domain files, package Webviews own Character/World/content tools, and `apps/neko-desktop` wires public Roots and sender-bound grants without implementing cross-domain authoring rules.
- Affected product surfaces: application sidebar Project/Conversation/Character/World sections, Project/Character/World management Workbenches, Project Workspace resource navigation, Character Studio, World Studio, Agent Entry mode/target selection, project-local references, publication diagnostics, and Desktop scene/slot projection.
- Adjacent active changes requiring reconciliation: `add-home-experience-entry-modes`, `compose-desktop-workbench-scenes`, `unify-agent-launch-and-domain-bindings`, `define-character-dialogue-chatroom-world-foundation`, `define-ai-native-interactive-world`, and its World implementation follow-ups.
- User data: new project-local Character/World facts use owning-domain files below an authorized Workspace root; standalone authoring uses library-managed authorized roots; all persisted paths remain relative or variable-based. Existing durable Character/World records are not silently copied, migrated, promoted, hidden, or overwritten. Any later relocation/export must be an explicit owning-domain workflow that preserves the source until success.
- No new internal contract/schema/format version, compatibility reader, dual-write path, active-target fallback, global open-instance registry, retained hidden Root, or cloud/multi-tenant assumption is introduced.
<!-- SUCCESSOR: simplify-project-authoring-and-installed-libraries -->
> **Successor disposition (2026-08-14):** New standalone mutable Character/World authoring, direct domain authoring destinations, and standalone Agent targets are retired. The successor owns project-only editable targets, installed read-only libraries, Conversation/Creation entry, generic Project-bound Creative Workspaces, and recovery; Conversation navigation itself is not a durable Agent Conversation, and compatible Project-local Workspace ownership work in this change remains valid only where it does not require a Content-root identity.
