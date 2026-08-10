## Context

Two independent pre-provider regressions currently share the same Agent surface. `PiContentToolModelProtocol` gives `ListDirectory` a top-level `anyOf`, and `projectOpenNekoTool` copies it into the actual Pi provider definition even though the older `ToolRegistry` projection removes provider-rejected top-level combinators. Separately, Entry Draft and Conversation submits correctly carry default media purpose bindings, but `projectAgentGenerationModelPolicy` checks `provider.apiKey`; canonical TOML parsing intentionally separates that secret from Provider metadata, so a configured media credential is reported missing.

The same stale assumption continues at media execution: `MediaRoutingManager` and `MediaGenerationExecutor` inspect the secret-free Provider object. Fixing only Agent preflight would allow chat to start but leave the canonical Generation Job provider call broken.

### Five-layer analysis

| Layer          | Decision                                                                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Agent runtime owns Pi Tool projection and immutable purpose policy; Host owns provider configuration and credential resolution; Generation owns media routing/execution and receives an injected provider-runtime port. |
| Dependency     | Webview emits only model identity; Agent and Generation consume narrow Host-injected dependencies; neither imports Electron or reads `config.toml`; Desktop retains only concrete credential/runtime wiring.            |
| Interface      | Provider-facing Tool schemas are strict top-level objects; media execution resolves one exact provider identity to an ephemeral execution provider immediately before use.                                              |
| Extension      | New Tools use the same Pi projection invariant; new media providers use the same exact provider resolver and cannot add a second credential source or provider fallback.                                                |
| Test           | Producer, consumer and complete-path tests prove schema shape, source priority, no secret projection/persistence, ordinary-chat isolation, exact media provider use and no fallback.                                    |

## Goals / Non-Goals

**Goals:**

- Make every actual Pi provider Tool definition acceptable to providers that require a top-level object without `oneOf`, `anyOf`, `allOf`, `enum`, `const` or `not`.
- Preserve exact `ListDirectory` `path` versus `cursor_ref` validation inside its existing canonical model protocol.
- Use the existing CredentialStore as the single authority over configuration-file and interactive-login credentials.
- Keep generation credential absence local to the affected purpose while allowing `agent.main` and unrelated Tools to run.
- Resolve the credential again at the exact media provider execution/observation/cancellation boundary without persisting or projecting it.
- Keep media routing private to the Generation composition and expose only the execution service to Desktop and Agent callers.
- Persist Assistant generation Jobs and outputs under an exact Assistant Space owner without treating that owner as a Project Workspace identity.

**Non-Goals:**

- Changing the TOML schema, credential priority, auth UI, media model selection UI or Entry Draft persistence.
- Adding provider fallback, default-provider inference, retry-to-another-provider behavior or a second credential cache.
- Refactoring Prompt Generation, unrelated provider adapters or existing Project Generation Job records.
- Importing Assistant outputs into a Project or the global Asset catalog without an explicit user action.
- Running a paid real-provider Evaluation without explicit provider/model/cost authorization.

## Decisions

### Sanitize only the provider-facing top-level Tool schema

`projectOpenNekoTool` remains the canonical Pi Tool projection. Its object-schema options will retain properties, nested constraints, required fields and `additionalProperties`, but will not copy provider-rejected combinators from the domain/model protocol to the top level. This matches the existing `ToolRegistry` invariant and does not weaken owning validation: `PiContentToolModelProtocol.prepareListDirectory` already rejects both-present and both-absent arguments before the core Tool executes.

Alternative considered: replace the two-field `ListDirectory` contract with separate first-page and continuation Tools. That would create two operations for one stable responsibility and is unnecessary because short-reference resolution already owns the distinction.

### CredentialStore remains the single source-priority authority

Agent generation-policy projection will query the injected `OpenNekoCredentialStore` status instead of Provider metadata. `HostSecretUserCredentialPersistence.read` already implements the canonical order: valid TOML credential first, otherwise interactive SecretStorage. The policy consumes status only and never receives secret bytes.

For a configured exact generation purpose, policy resolution includes the exact provider/model. When a required media credential is absent, that purpose is omitted from the policy, so the bridge does not register its required Tool; `agent.main`, sibling purposes and Workspace Tools remain available. No provider/model fallback is attempted.

Alternative considered: restore `apiKey` on `ProviderConfig`. This is rejected because it would leak secrets into renderer-safe configuration projections and duplicate CredentialStore priority semantics.

### Desktop injects an exact media execution-provider resolver

`@neko/generation/media` will accept a narrow asynchronous provider-runtime port in addition to its read-only model/config port. The port resolves one requested provider ID to an ephemeral provider object usable by the existing media adapters, or returns unavailable. Generation does not know CredentialStore, TOML, SecretStorage or auth-login semantics.

Desktop implements the concrete adapter using the Host-owned `ConfigManager` view plus the application `credentialRuntime.credentials`. Project owners use their exact Workspace config instance; Assistant owners use the application config because provider/model configuration is user-owned and Assistant has no Project Workspace. The adapter validates exact provider identity and supported API-key credential shape, adds the credential only to an ephemeral copy, and never mutates ConfigManager. Routing checks this resolver for availability; execution, external-task observation and cancellation resolve the same exact provider again so an auth change is visible without recreating the Generation owner.

Alternative considered: hydrate all providers once when the Workspace owner is created. This is rejected because application-lifetime owners would retain stale credentials after login/logout and unnecessarily keep secret copies alive.

`MediaRoutingManager` remains an internal Generation implementation detail used by `MediaGenerationService` to validate the exact requested target or the configured purpose default. `createMediaPlatform` exposes only the service consumed by the Job owner; Desktop and Agent do not receive the router, executor or adapter registry as alternate execution entries.

### Generation uses an explicit owner instead of a synthetic Workspace

Generation application ownership is a closed union:

```ts
type GenerationOwner =
  { kind: 'workspace'; workspaceId: string } | { kind: 'assistant'; assistantSpaceId: string };
```

The application runtime keys one owner by exact kind and identity and rejects the same owner bound to another root. Workspace owners continue through the canonical Workspace identity descriptor and UUID validation. Assistant owners use the existing `${HOME}/.neko/assistant-spaces/<space>/` authority, a user-global metadata partition qualified by the exact Assistant Space identity, and an Assistant-specific Job persistence partition without a Workspace foreign key. Both owners reuse the same Generation Job coordinator, provider execution and result finalizer.

Assistant outputs are durable generated drafts under `neko/generated/<media-kind>/` relative to the Assistant Space root. Temporary files may exist only during bounded download/materialization and never become a `ContentLocator`, transcript attachment or successful Job result. Assistant generation must not read or fall back to an active/recent Project Workspace, create a Project identity descriptor, or appear in the Project registry.

Workspace Board delivery follows the same explicit interaction owner. The Agent application host passes the closed Workspace/Assistant owner into the conversation runtime. A Workspace owner collects terminal creator-visible artifacts and invokes the exact injected Board delivery port; an Assistant owner skips that Workspace-only stage entirely while retaining the Tool result, generated-output locator, Job and transcript projection. Absence of a Workspace Board request is normal Assistant semantics, not a successful no-op adapter and not a swallowed delivery failure. Workspace delivery remains fail-visible when its port is absent or rejects the request.

Alternative considered: replace `assistant-space:local-user` with a UUID or create a hidden Workspace UUID. This is rejected because it introduces a second identity authority and can leak the Assistant root into the Project catalog. Weakening the Workspace UUID validator is also rejected because it removes a real Project trust and portability invariant.

### Ownership and runtime path

| Owner/package role              | Producer -> consumer                                         | Canonical path                                     | Replaced path                                                      |
| ------------------------------- | ------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------ |
| `@neko/agent-webview` L2        | media selection -> Draft/turn contract                       | existing `purposeModels` projection                | none; selection behavior remains authoritative                     |
| `@neko/agent-runtime` L1        | Tool/model protocol -> Pi provider and capability bridge     | `projectOpenNekoTool` plus flat `AgentModelPolicy` | top-level combinator forwarding and `provider.apiKey` status check |
| `@neko/host` L1                 | TOML credential source/SecretStorage -> CredentialStore      | existing config-first persistence chain            | no new path                                                        |
| `@neko/generation/media` L1     | exact provider runtime port -> router/executor/adapters      | one exact provider/model Generation Job execution  | reading credential availability from secret-free config metadata   |
| `@neko/generation/job` L1       | exact Generation owner -> one recoverable Job port           | owner-kind-qualified application runtime           | treating every Agent runtime as a Project Workspace                |
| `apps/neko-desktop` Application | ConfigManager + CredentialStore -> package public media port | Electron Main composition only                     | direct `createMediaPlatform({ configManager })` wiring             |

The production logic retained in Desktop is only the concrete composition adapter because it has access to the application credential runtime and Workspace ConfigManager instances. Source priority, purpose policy, routing and generation behavior remain package-owned and host-neutral.

### Evaluation decision

- `reuse` `agent-runtime.stream-delivery/directory-format-routing` to prove the real provider accepts `ListDirectory` and the canonical directory/read path completes.
- `update` `agent-runtime.model-binding` with an adjacent negative ordinary-message case that carries a configured image purpose, completes `agent.main`, and proves `GenerateImage` is absent.
- `reuse` `agent-runtime.creative-media-workflow/generated-output-workspace-board` for configured image generation, exact provider/model, Job, artifact and no-fallback evidence.
- `create` an Assistant Space case in `agent-runtime.creative-media-workflow` proving generation without a Project, durable user-root output, exact Assistant owner, reopen recovery and absence of Workspace Board/Asset/tmp fallback.
- Missing-credential source priority and fail-local Tool registration remain deterministic because real Evaluation credentials cannot intentionally expose or mutate secret state per case.

The foundational session matrix changes for generation persistence: Assistant application reopen, restored generation records and Assistant/Workspace artifact isolation require focused evidence. Compaction and unrelated conversation switching remain unaffected unless implementation changes their owner.

## Risks / Trade-offs

- [Some provider adapter expects a non-API-key credential] -> The Desktop resolver rejects unsupported credential types for media instead of fabricating a token or falling back; add an explicit adapter contract only when a real provider requires it.
- [Provider credentials change between routing and execution] -> Resolve the exact provider again at execution and fail the current Job visibly; never switch provider/model.
- [Removing top-level combinators gives the model a less expressive schema] -> Keep descriptions and properties precise and enforce the full invariant in `prepareArguments` before Tool execution.
- [A missing media credential makes the Tool absent, so the model may explain unavailability rather than emit a Tool diagnostic] -> Deterministic tests prove no provider call and ordinary-chat continuity; the product already allows required-purpose Tools to be unregistered when their binding is unavailable.
- [Global metadata can mix Assistant projections] -> qualify every Assistant projection and Job partition by exact Assistant Space identity; tests poison sibling owners and reject cross-root recovery.
- [Assistant identity is represented through the Workspace-shaped runtime shell] -> carry the explicit closed owner into the runtime and gate Board delivery on `owner.kind`; never infer delivery eligibility from an active Workspace, root path or delivery-port availability.

## Migration Plan

1. Add red canonical-path tests for the actual Pi schema, config-first and login credential projection, missing-credential chat isolation, and media provider execution.
2. Atomically replace the two stale `provider.apiKey` reads with CredentialStore status and the injected provider-runtime port.
3. Update Evaluation authoring and run key-free validation, focused deterministic suites, typechecks and architecture gates.
4. With explicit cost authorization, run the visible ordinary-chat case plus focused hidden directory and generated-image cases.
5. Replace the Workspace-only Generation application binding with the closed owner union, add Assistant persistence, and validate visible Assistant generation plus application reopen when provider/cost authorization is available.

No existing Project record migration is required. The Assistant persistence table and owner-qualified global projection entries are additive; rollback is code-only for existing Project data.

## Open Questions

None for implementation. Paid real-provider execution remains authorization-dependent verification rather than a design dependency.
