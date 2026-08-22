## Context

The current code has three semantic boundary failures that static import gates do not detect. `ProjectIndexCoordinator` constructs usable-looking runtime behavior from partial ports, replaces duplicate registrations, and reports successful freshness after rejected partition work. Canvas Webview media messages are produced by Canvas but their canonical TypeScript contract and codec live in `apps/neko-desktop`; the Webview host also forwards unrecognized string message types to an optional delegate. `DesktopCutRuntime` combines exact Window/Workspace authorization with Cut draft naming, document identity, transactional session creation, and Canvas-to-Cut target policy.

The replacement must be atomic inside each boundary: all producers and consumers move to one package-owned contract or service, and the old successful path is deleted. No persisted user data shape changes.

## Goals / Non-Goals

**Goals:**

- Make missing Search runtime dependencies and partition failures explicit and locally diagnosable.
- Enforce exact, unique Search adapter and semantic-provider registration.
- Give Canvas one typed media protocol owned and decoded by `@neko/canvas-domain`.
- Restrict Canvas Webview host delegation to a closed list of Canvas-owned message kinds.
- Give `@neko/cut-domain` ownership of draft planning, unique naming, transaction rollback, and Canvas handoff target policy.
- Keep Desktop responsible only for sender/window/workspace authorization, concrete Node/Electron adapters, shell mutation, and resource disposal.

**Non-Goals:**

- Redesign Search ranking, index storage, or semantic result schemas.
- Replace Canvas media playback, FFmpeg, resource publication, or renderer UX.
- Redesign the Cut timeline/document model, save-as UI, or media import behavior.
- Add compatibility aliases, versioned messages, feature flags, fallback providers, or generic plugin registries.

## Decisions

### 1. Search requires one complete runtime port object

`ProjectIndexCoordinator` and `ProjectCacheSearchService.create` will require `ProjectSearchRuntimePorts`. Optional capabilities remain optional only when they have a permanent semantic absence; required context resolution, workspace root enumeration, logging, and time are explicit constructor dependencies. The default port object is deleted.

Duplicate partition or provider identity registration throws before mutating or disposing the existing registration. Initialization and refresh collect rejected partition outcomes and throw a typed coordination error containing exact partition diagnostics; they do not mark the project initialized or fresh. Query remains capable of returning sibling partition results only when the returned projection explicitly marks failed partitions and freshness as failed/stale; failure is never reduced to a no-op logger call.

Alternative considered: retain defaults for tests. Rejected because test convenience would preserve the hidden production success path; tests must construct explicit ports.

### 2. Canvas owns the closed media protocol

`@neko/canvas-domain` will export Canvas media request/response types, supported request-kind constants, and strict request/response parsers. Canvas Webview producers, Desktop preload, Desktop Main, and the renderer delegate all import that public entry. The corresponding declarations and codec are deleted from `apps/neko-desktop/src/shared/canvas-bridge-contract.ts`.

`CanvasWebviewDelegate` exposes exact media-message support rather than an arbitrary `supportsMessage(string)` acceptance rule. The host switch handles the Canvas-owned media message set explicitly and rejects all other unknown messages. Desktop remains the consumer adapter that authorizes the workspace locator and calls media/resource services.

Alternative considered: re-export the old Desktop names. Rejected because it would retain a second contract entry and obscure the canonical owner.

### 3. Cut application owns draft and handoff policy through narrow ports

`@neko/cut-domain` will expose a host-neutral `CutDraftApplicationService`. It receives exact owner identities, existing labels, a caller-provided identity generator, and narrow session/presentation ports. It owns canonical draft label selection, transient draft document identity, Cut host identity construction, session-create/open transaction ordering, and rollback on presentation failure.

The same Cut application entry owns `CutCanvasHandoffTarget`, its payload codec, exact target comparison, and the decision between a new draft and an existing active Cut view. Desktop first authorizes and resolves the exact Window/Workspace/Canvas source and passes a minimal active-Cut candidate; the Cut service validates whether that candidate belongs to the same Project/Workspace/View instance.

Desktop retains absolute workspace path resolution because it is a Host authorization concern. The application plan carries only the transient Cut-owned draft identity; the Desktop session port resolves the authorized draft placeholder path immediately before invoking `CutApplicationRuntime`, and the existing Save As path continues to produce the normalized workspace-relative durable `.otio` identity.

Alternative considered: move `DesktopCutRuntime` wholesale into Cut. Rejected because Window projection, native dialogs, resource registry, and authorized absolute paths are genuine Electron/Host boundaries.

### 4. Owner and runtime inventory

| Owner   | Role/public path                                    | Producer                          | Consumer                                   | Runtime boundary                               | Replaced path                                      | User-data impact                             |
| ------- | --------------------------------------------------- | --------------------------------- | ------------------------------------------ | ---------------------------------------------- | -------------------------------------------------- | -------------------------------------------- |
| Search  | `@neko/search-domain/core` application coordination | Search composition                | Search callers/providers                   | host-neutral                                   | partial/default ports and replacing registries     | none; projections expose failures accurately |
| Canvas  | `@neko/canvas-domain` L0 contract                   | Canvas Webview                    | Desktop preload/Main/media adapter         | browser to Desktop trust boundary              | Desktop-local media protocol and wildcard delegate | none                                         |
| Cut     | `@neko/cut-domain` application service              | Desktop authorized owner snapshot | Cut Node runtime and Desktop shell adapter | host-neutral transaction plus Desktop adapters | app-owned draft/handoff policy                     | none; unsaved drafts remain transient        |
| Desktop | `apps/neko-desktop` composition/trust boundary      | sender/window/native state        | package public ports                       | Electron Main/preload/renderer                 | business decisions listed above                    | none                                         |

Production logic retained in Desktop is limited to authorization against exact sender/window/workspace identities, resolving authorized absolute paths, invoking concrete Node/Electron services, applying package-produced presentation plans to the Desktop shell, and releasing resources. Those operations require the Application boundary because they use Electron/Host authority and do not decide domain outcomes.

## Risks / Trade-offs

- [Risk] Search callers currently rely on no-argument construction → update all production and test composition sites atomically and add a compile-time/behavior test proving missing ports cannot construct a service.
- [Risk] Canvas message migration can leave a duplicate old entry → delete the old declarations and add source-boundary tests that poison or scan for Desktop-owned media contract names.
- [Risk] Closing Canvas delegation can break a real message not inventoried → enumerate every current Webview-produced host message and add explicit cases before deleting the default delegate path.
- [Risk] Moving Cut transaction ownership can accidentally move absolute paths into domain code → keep path resolution inside the Desktop session port and test that Cut plans contain only Cut-owned transient draft IDs.
- [Risk] Existing dirty worktree overlaps Desktop files → edit only the targeted imports, media declarations, and Cut runtime methods; preserve unrelated hunks and validate with focused diffs.

## Migration Plan

1. Make Search constructors and registration semantics strict, update all callers, then replace failure tests.
2. Add the Canvas-owned media contract and tests, switch every producer/consumer, close the Webview message switch, then delete the Desktop declarations/tests.
3. Add the Cut application service and unit tests, switch `DesktopCutRuntime` to its ports, then remove app-owned payload/policy helpers.
4. Run package typechecks/tests, Desktop focused tests, architecture/dependency/legacy gates, and inspect the final diff for duplicate paths.

Each step is an atomic source change in this pre-release repository. Rollback is the source revert for that step; no data migration or compatibility path is introduced.

## Open Questions

None. The current callers and ownership rules provide enough information for implementation.
