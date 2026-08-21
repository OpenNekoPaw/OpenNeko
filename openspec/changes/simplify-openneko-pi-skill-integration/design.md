## Context

OpenNeko links `@earendil-works/pi-agent-core` and already uses Pi's Skill loader and invocation formatter. The production path nevertheless overlays a second conceptual platform: `@neko/agent-contracts` declares an extended Skill object, optional `agents/neko.yaml`, workflow/catalog/host-fit types and Skill-owned Tool/model fields; `PiSkillHost` additionally parses OpenNeko target metadata, hosts command artifacts and exposes a Skill-specific processor API. Several of those contracts have no production consumer, while target metadata caused ordinary Skill invocation to affect Entry authoring UI and Conversation binding.

The product is a local Electron Desktop application. OpenNeko must still own the real Host boundaries that Pi core does not provide: product source provenance, project trust, enablement, opaque Renderer-safe locators, exact activation identity, native directory selection/trash and atomic publication. These responsibilities justify a thin adapter, not a parallel Skill runtime.

This change intersects active work without replacing its owners:

- `clarify-desktop-capability-catalog` owns installation and management projection;
- `unify-agent-launch-and-domain-bindings` owns Entry/Conversation binding and typed input identity;
- `purify-agent-contracts` owns removal of non-contract behavior and dead exports;
- `unify-skill-creator-authoring-targets` already established Conversation-owned `CreateSkill` destination.

## Goals / Non-Goals

**Goals:**

- Make Pi the only Skill parser, discovery, progressive disclosure and prompt-formatting implementation.
- Retain only OpenNeko Host facts with demonstrated correctness or security consumers.
- Keep every builtin, personal, project, plugin and third-party Skill on one ordinary invocation path.
- Separate Skill management inventory, executable catalog, Commands and domain Capability authority.
- Establish `~/.agents/skills` and `.agents/skills` as the only Portable Skill roots.
- Remove dead overlay, processor and duplicate-contract surfaces atomically without reading or rewriting retired user data.

**Non-Goals:**

- Replacing Pi Agent, adopting the complete Pi Coding Agent UI, or delegating Desktop trust to Pi.
- Adding marketplace publication, automatic dependency installation, Skill update/merge or cross-Workspace copying.
- Removing `~/.neko`; it remains the user-global OpenNeko configuration/state root.
- Changing owning-domain Character, World, Canvas, Cut or Generation contracts.
- Automatically importing, migrating, deleting or repairing existing `.neko/skills` bytes.

## Decisions

### 1. Pi Skill is the only portable runtime model

`@neko/agent-runtime/pi` will consume Pi's `Skill`, `loadSourcedSkills`, `formatSkillsForSystemPrompt` and `formatSkillInvocation` contracts directly. The OpenNeko adapter may attach Host-owned provenance and immutable execution identity, but it will not parse a second body, interpret workflow metadata or inject Tool/model definitions from a Skill package.

The executable public shape is intentionally small: canonical name and description, source identity, fingerprint, activation id and opaque Skill locator. Full content remains behind the Pi snapshot and is loaded only through exact activation or an authorized locator read.

Alternative rejected: preserve the extended OpenNeko `Skill` interface as a UI superset. Its fields combine author metadata, runtime authority and management projection, most have no consumers, and optional fields invite future parallel paths.

### 2. Host policy wraps discovery without redefining Skill semantics

The Agent runtime owns source-root composition and applies exact trust and enablement policy to each loaded item. Fingerprints cover the selected package bytes and form part of the turn-snapshot activation identity. Opaque locators prevent Renderer exposure of physical paths and relative-resource resolution rejects traversal and package escape.

Source precedence remains `project > personal > plugin > builtin`, with stable plugin identity for ties and explicit duplicate diagnostics. Failure of one Skill remains local to that item and does not clear sibling Skills or Commands.

Alternative rejected: expose Pi's physical `filePath` directly. Renderer and model-visible paths would leak Host layout and weaken package containment.

### 3. Skill activation cannot select domain authority

`openneko.binding` and `openneko.authoring-target-kind` are removed from loader interpretation, executable records, input catalog and Renderer selection behavior. A Skill activation only contributes instructions to the current exact Conversation turn.

Conversation/Launch application services own Assistant or Workspace binding. Domain capability providers own Character, World, Canvas, Cut and other Tool requirements. A global `character-creator` invocation can propose a reviewable character, but it can mutate a Character draft only when the current turn's generic Capability snapshot already contains an authorized exact Character Tool. Selecting the Skill never creates, switches or navigates to that target.

Alternative rejected: keep target metadata as a generic third-party extension. Although name-neutral, it still lets author-controlled prompt metadata alter product authority and Entry UI before the Capability owner participates.

### 4. Capability and permission remain outside Skill packages

The runtime ignores and removes OpenNeko contracts for Skill-owned `toolDefinitions`, `toolsRef`, model override, file-save trigger and workflow execution hints. Agent Skills `allowed-tools` remains a portable experimental author hint when read by Pi, but OpenNeko does not treat it as a permission grant or Tool registration.

Tool schemas, approval, target binding and mutation live in registered Capability providers. Provider names and prompt fragment ids describe the domain capability, not a caller Skill. `@neko/chara` therefore exposes a generic Character authoring capability rather than a `CharacterRoleSkillCapabilityProvider`.

### 5. Remove the unconsumed Neko Skill overlay

`agents/neko.yaml`, `NekoSkillOverlay`, dependency/relationship/host-fit envelopes and their creation fields are removed because the product currently writes but does not read or enforce them. The portable `metadata` map remains available for interoperable author metadata, but unknown metadata never grants authority or changes the canonical path.

A future structured extension requires a separate OpenSpec with named producers and at least two real consumers. It cannot be reintroduced as a speculative compatibility layer.

### 6. Scripts use ordinary Host execution

`PiSkillHost.executeExternalProcessor` and its Skill-specific authorizer/executor contracts are deleted. Skill package resources remain addressable through contained locators. If an Agent must run `scripts/*`, it resolves the exact resource and invokes a registered ordinary process/command Tool subject to that Tool's standard permission, workspace trust, cancellation and result handling.

Alternative rejected: complete the Skill processor framework. It has no production caller and duplicates the existing process and external-processor authorities.

### 7. Command discovery is a separate application owner

`command-artifact` no longer enters `PiSkillHost`. A CommandHost/CommandCatalog owner loads `neko/commands/*.md` and `~/.neko/commands/*.md`, validates argument interpolation and supplies `/command` executable identities. It may reuse package-local Markdown, source, fingerprint and diagnostic utilities, but it has a distinct record, collision namespace and invocation formatter.

The canonical input catalog continues to combine Skill and Command projections for one Composer UI; combination at the presentation/application boundary does not merge their lifecycle owners.

Because `unify-agent-launch-and-domain-bindings` currently consumes command-artifact identities, the replacement updates all producers, consumers, fixtures and tests in one step and deletes old handler ids and branches.

### 8. Management and executable records are separate

The management catalog records installed source, enabled state, removal capability, plugin provenance and diagnostics. The executable catalog contains only current trusted/enabled Pi-validated records with exact activation identity. Management card ids, display names and installed state cannot execute a turn or act as fallback when an activation is stale.

Desktop Main retains native picker, authorized source-directory access and move-to-trash adapters because these require Electron and OS APIs. The host-neutral Personal Skill manager and package creation service retain validation, containment, staging, duplicate rejection and atomic publication. Renderer owns only localized presentation and sends typed management requests.

### 9. Storage follows data ownership

Portable Skills use:

- personal: `~/.agents/skills/<name>/SKILL.md`;
- project: `<workspace>/.agents/skills/<name>/SKILL.md`.

User-global OpenNeko data remains under `~/.neko`, including `config.toml`, `neko.db`, prompts, commands, caches, logs, assets and assistant-space state. Portable project facts remain under `<workspace>/neko/`. Normal runtime does not create or read workspace `.neko/`.

The obsolete `skills` member in `neko-content-layout` is removed. Existing `~/.neko/skills` and retired workspace `.neko/` files are unknown/retired bytes: no startup scan, auto-migration, cleanup or compatibility read is added. A future explicit import feature would copy one user-selected valid package into the canonical root through the same Personal Skill manager.

### 10. Creation contracts expose stable results only

`CreateSkill` keeps its Conversation-bound destination and typed portable definition/resources input. The public success result contains the created name, source and fingerprint. Physical root, absolute path, internal root id and empty diagnostic arrays remain inside the owning Node service or are removed.

Creation, external-directory installation and removal are different user intents but reuse Pi validation and package containment. None automatically enables a disabled Skill, updates an existing package or activates the created Skill.

### 11. Package ownership and runtime path

| Responsibility | Owner / public path | Producer | Consumer | Replaced path | User-data impact |
|---|---|---|---|---|---|
| Pi Skill adapter and executable catalog | `@neko/agent-runtime/pi` | Pi loader + Host source policy | Agent application turn snapshot | Extended OpenNeko Skill runtime | None |
| Skill/Command input projection | `@neko/agent-runtime/application` | SkillHost + CommandHost | Desktop Agent bridge/Webview | `command-artifact` inside SkillHost | None |
| Minimal wire contracts | `@neko/agent-contracts` | owning application services | Main/preload/Renderer | workflow/overlay/catalog business model | None |
| Character mutation capability | `@neko/chara/application` | Chara application service | Agent Capability registry | Skill-branded provider | Existing projects unchanged |
| Portable package mutation | `@neko/agent-runtime/pi` or package-owned Node service | Create/install requests | filesystem roots | `.neko/skills` layout and overlay writer | Existing bytes untouched |
| Native management adapters | `apps/neko-desktop` composition root | Electron picker/trash/sender | host-neutral Agent manager | app-owned Skill policy | None |
| Local storage projection | `@neko/local-metadata` | global layout resolver | Desktop composition | generic `.neko/skills` projection | Existing `.neko` data retained |

Logic retained in `apps/neko-desktop` is limited to Electron sender validation, native picker/trash calls and concrete path/port wiring. Skill selection, validation, precedence, creation policy and management rules are host-neutral and remain in owning packages.

## Risks / Trade-offs

- [Third-party Skill depends on OpenNeko overlay] → Current runtime has no overlay reader, so removal cannot reduce actual executable behavior; reject unsupported files only where they conflict with reserved creation paths and preserve package bytes on install.
- [Removing target metadata changes `character-creator` Entry UX] → Keep target selection as an explicit product/Conversation action, and verify Skill activation stays in the current scene and cannot mutate without a current authorized Character capability.
- [CommandHost split overlaps active launch work] → Update the canonical input catalog atomically and coordinate task ordering with `unify-agent-launch-and-domain-bindings`; no compatibility handler remains.
- [Management and executable catalog separation adds two projections] → They have genuinely different consumers and authority; share immutable source/diagnostic helpers without sharing record identity.
- [Pi dependency behavior changes] → Pin and test the consumed Pi API surface; keep all OpenNeko security policy outside undocumented Pi behavior.
- [Old `.neko/skills` remains on disk] → This is required user-data safety. Report it only through a future explicit import workflow, never startup migration or cleanup.

## Migration Plan

1. Add boundary/path-absence tests that define the final Pi-only Skill surface and classify all existing Skill contracts and consumers.
2. Remove dead contract/overlay fields and stop writing `agents/neko.yaml`; switch all creation producers and consumers atomically.
3. Remove Skill invocation requirements and Renderer target derivation; rename Character capability ownership and verify ordinary Skill behavior.
4. Split CommandHost from SkillHost and update the unified input catalog, handler identities, fixtures and tests in one replacement.
5. Remove Skill external processor contracts and route any proven script execution through the ordinary Tool path.
6. Split management and executable projections, then simplify creation result and Desktop IPC projections.
7. Remove `.neko/skills` layout exports/tests and audit all production roots; leave existing filesystem bytes untouched.
8. Audit builtin Skill content and run deterministic SkillHost, application, Webview, Desktop and focused Agent evaluation gates.

Rollback reverts the code replacement as a unit. It does not restore compatibility readers, move user data, recreate overlays or duplicate Skill roots.

## Open Questions

None. A future user-visible legacy Skill import or structured Host overlay requires its own proposal with explicit consumers and authority.
> **后继处置（2026-08-21）**：本文的 Pi Skill 路径不再是实现约束，当前唯一路径见 `replace-pi-with-dsh-runtime-atomically`。
