## Why

Desktop currently projects recent Projects and Agent conversations as two unrelated flat lists, while every conversation navigation identity is forced through `projectId + workspaceId + conversationId`. That model misrepresents Assistant conversations as synthetic Workspace Projects, cannot represent future Character/Room owners, and prevents Codex-style conversation management under an explicit Project without conflating navigation grouping with capability, memory, or Scene ownership.

## What Changes

- Add a package-owned, versioned conversation navigation projection that carries one closed runtime context owner (`assistant | workspace | character | room`) plus an optional Project grouping identity.
- Group Workspace conversations under their exact Project in PrimarySidebar; show ungrouped Assistant, Character and Room conversations in owner-qualified standalone groups.
- Keep Project grouping organizational only: it MUST NOT grant Workspace access, merge memory, change transcript ownership, or permit active/recent Project fallback.
- Restore an exact conversation through its persisted context owner and complete Workbench Scene; keep same-Workspace navigation idempotent and preserve fail-visible unavailable behavior for Character/Room until qualified owners exist.
- Make Project/container activation distinct from conversation restore: opening a Project enters or reuses its Workspace-bound Draft, while selecting a conversation restores that exact session.
- **BREAKING** Replace Workspace-only `AgentHomeNavigationIdentity` and the separate recent Project/recent conversation rendering contract; migrate current Assistant and Workspace catalog projections to the new canonical representation without a dual-success compatibility path.

## Capabilities

### New Capabilities

- `desktop-conversation-context-navigation`: Defines conversation context ownership, optional Project grouping, grouped PrimarySidebar presentation, exact Scene restore, lifecycle operations, migration, and unavailable owner behavior.

### Modified Capabilities

None.

## Impact

- `@neko/agent-contracts` owns the host-neutral conversation context/navigation and catalog projection contract; `@neko/agent-runtime` produces it from Pi catalog plus exact lifecycle context metadata.
- `@neko/host` consumes the package-owned projection, validates Project membership and exact context identities, and coordinates typed Scene/container transitions without owning Agent, Character, Room, or Workspace business state.
- `apps/neko-desktop` remains the Electron/Application composition boundary: Main wires the lifecycle and Host ports, preload carries the existing typed projection, and renderer maps grouped projection data into the persistent PrimarySidebar using existing shared UI primitives.
- Existing Pi transcript/branch/lease storage remains Agent-owned. Valuable existing Assistant and Workspace conversations are reprojected from their authoritative lifecycle context; unresolved records fail visibly rather than being assigned to a recent Project.
- Character/Room context variants are contract-qualified but cannot be produced or restored successfully until their package owners expose exact run/session adapters; Desktop must return owner-qualified unavailable diagnostics instead of placeholders.
