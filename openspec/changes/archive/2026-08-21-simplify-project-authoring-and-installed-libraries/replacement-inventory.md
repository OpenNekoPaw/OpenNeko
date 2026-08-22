# Canonical replacement inventory

> SUCCESSOR: simplify-project-authoring-and-installed-libraries
>
> Successor scope (2026-08-15): This inventory replaces the relevant paths from
> `refine-character-management-authoring-and-version-graph`,
> `refine-world-management-authoring-and-runtime`,
> `separate-companion-and-narrative-character-conversations`,
> `simplify-resource-entity-character-world-boundaries`, and
> `unify-domain-authoring-workspaces`. Retained records are canonical Project objects,
> global domain versions, Conversations, Rooms, Runs, Saves, and valid exact references;
> all installed/adaptation/recovery/publication-plan data is explicitly deleted in its owner
> scope and is neither read nor migrated.

This inventory defines the atomic replacement boundary for the simplified workspace/global-version model. `delete` means the production path, contract, registration, fixture and owned residual storage are removed together. No deleted path remains readable for migration, recovery or fallback.

## Ownership and path matrix

| Responsibility | Canonical owner and path | Consumers | Delete together | Data disposition |
| --- | --- | --- | --- | --- |
| Agent authoring authority | `@neko/agent-contracts`: exact Project context plus owner-qualified local target | Agent runtime/Webview, Host, Desktop, Chara, World | `standalone-library`, active/recent/default target inference and old fixtures | Discard obsolete transient binding metadata; retain canonical transcripts |
| Project Workspace | `@neko/project`: local membership plus exact global version refs | Project Webview, Agent context, Chara/World reference readers | installed dependencies, publication planning/preview and automatic release replacement | Delete only obsolete composition records; retain canonical Project members and exact refs |
| Character workspace/global model | `@neko/chara` application/repository | Chara Webview/runtime, Project, Agent | installed-release catalog/service/repository/Root, adaptation and recovery paths | Delete installation/adaptation/recovery stores and resources; retain canonical workspace Characters and Character versions |
| World workspace/global model | `@neko/world` application/repository | World Webview/runtime, Project, Agent | installed-release catalog/service/repository/Root, adaptation and recovery paths | Delete installation/adaptation/recovery stores and resources; retain canonical workspace Worlds, World versions, Runs and Saves |
| ZIP transport | Chara/World application plus Node archive adapter | owner management Webview through Host grant | install-for-use, import-for-editing, mounted archive and package destination branching | Delete install copies and temporary residue; external source ZIP is not owned data |
| Runtime launch | Agent/Chara/World exact global version launch | Dialogue, Room, World Run/Save | installed-release lookup, current/latest/name fallback | Retain canonical runtime records and valid exact domain-version refs |
| Desktop composition | `@neko/host` plus thin Desktop | current visible package Roots | installed/adaptation/recovery scenes, handlers, IPC and retained Roots | Shell owns no domain facts |

## Exact production families

- Agent: authoring intent/launch contracts, entry target and launch services, Composer context/selector, Host/Desktop bridges and fixtures.
- Project: target/membership/exact-ref contracts and services, Node persistence, Project Workspace and Desktop delegation.
- Character: domain/global-version/synchronization/portable contracts and services, Node repository/archive adapter, Webview management/runtime and fixtures.
- World: domain/global-version/synchronization/portable contracts and services, Node repository/archive adapter, Webview management/runtime and fixtures.
- Host/Desktop: scene/workspace grant contracts, preload/IPC, sender/path authorization, Shell composition and Electron tests.
- Acceptance: focused package tests, archive-security tests, Agent evaluation scenarios and visible Electron UI inventory.

## Canonical cutover invariants

1. New editable Character and World objects require one exact Project Workspace from first commit.
2. A global object has one stable identity and immutable user-visible versions; Project and runtime consumers save exact version refs.
3. `Synchronize to global` is the only workspace-to-global path and never updates consumers automatically.
4. ZIP import commits directly to a global object/version and ZIP export contains one selected version.
5. Conversation selects zero-or-more global Character versions and at most one global World version.
6. Installed release, adaptation, recovery and Project publication-plan contracts cannot decode, register or succeed.
7. Old installed/adaptation/recovery stores are not read or migrated and are removed within their exact owner scope.
8. Canonical Project objects, Character/World versions, Conversations, Rooms, Runs, Saves and valid exact refs are excluded from residual-data deletion.
