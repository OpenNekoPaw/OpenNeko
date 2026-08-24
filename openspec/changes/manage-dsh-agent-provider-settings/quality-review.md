## Findings

No blocking findings in the scoped implementation.

Risk is L3 for Provider/model configuration because it changes the effective Agent runtime profile and crosses Renderer/preload/Main plus the credential boundary. Storage and appearance changes are L2.

## Architecture review

- Responsibility: Provider/model validation and projection live in `@neko/host`; Desktop owns only sender-bound IPC, native directory actions, and composition.
- Dependency: Renderer imports only package-owned contracts and receives projections through preload. It does not import Node/Electron or credential implementations.
- Interface: strict request/response codecs reject unknown fields, and Provider projections contain credential status rather than secret material.
- Extension: one typed default-model mutation supports `llm`, `image`, `video`, and `audio` without copying DSH or generation routing into Settings UI.
- Testing: contract, application service, ConfigManager, DSH profile, generation resolver, Renderer, storage runtime, typecheck, OpenSpec, and key-free Agent Evaluation checks passed.

The canonical configuration owner remains `~/.neko/config.toml` through `ConfigManager`; credentials remain owned by `ProviderCredentialAuthority`. No parallel `models.json`, Renderer secret store, provider retry chain, or alternate generation router was added.

## Verification limits

Focused lint on the new contracts, services, runtime, and Settings UI passed. A broader lint invocation that included the concurrently modified `app-host.ts` reported unrelated unused Character imports and an empty block outside these settings hunks, so repository-wide lint is not claimed.

The progressive-disclosure follow-up is L1 presentation state: it does not change the canonical
configuration, credential, routing, or generation authorities reviewed above. A visible Electron run
verified the compact initial state and mutually exclusive Provider/model expansion at 1220×768. Dark
theme and a narrower supported window remain advisory visual evidence gaps; real Provider execution
is unchanged by this presentation-only follow-up.

The default-model card follow-up remains L1 Renderer presentation and reuses the existing canonical
`setDefault` bridge. Removing the duplicate selector surface does not remove or duplicate the Agent
default authority: the projection still supplies current defaults and the card action writes the same
type/ref contract. No Renderer secret access, alternate provider/model registry, or fallback routing was
introduced.

The Provider-scoped editor follow-up is L1 Renderer presentation. It removes the parallel model-management
entry and filters the existing projection by exact Provider identity; provider, model and default mutations
still call the same typed bridge independently. New custom Providers are saved before model configuration,
so the UI does not create a second draft catalog or batch authority. Model editing prevents Enter from
submitting the surrounding Provider form, and no credential value is read back into Renderer state.

The title-action and model-group layout follow-up remains L1 Renderer presentation. It removes duplicate
advanced-settings copy while retaining the same `openAgentAdvanced` Host action as the single canonical
configuration-file entry. Provider records are not assigned a fabricated dialogue/generation type and are
not duplicated; only their owned model catalog is split into responsive dialogue and generation columns.

The Provider capability-group follow-up remains L1 Renderer presentation. Group membership is derived from
the canonical projected model `type` values, so Host contracts, ConfigManager, credentials and runtime routing
remain unchanged. Dialogue-only and generation-only Providers use separate columns; mixed Providers appear
once and model-less Providers remain fail-visible as unconfigured instead of being classified by name or URL.

The flattened Provider-catalog follow-up remains L1 Renderer presentation. It removes only the outer summary,
accordion state and visual wrapper; capability grouping still derives from the same projection and each Provider
card still opens the same scoped editor. No Provider/model authority, credential path, runtime routing or save
semantics changed. Focused tests and direct Electron inspection found no blocking regression.

The local Provider and removal follow-up is L3 because it changes effective DSH Provider projection and adds
destructive mutations across Renderer/preload/Main. Locality remains orthogonal to capability: the Host projects
canonical `connectionKind`, while dialogue/generation grouping continues to derive only from model `type`.
Ollama is mapped by the existing DSH Provider runtime adapter and is rejected for non-LLM model creation; no
second local-model registry, endpoint fallback or credential path was added.

Provider protocol changes recompute connection kind, credential requirement and authorization metadata as one
canonical record update; protocol-specific metadata is preserved only when the effective protocol is unchanged.
Ollama requests carrying an API key fail before either configuration or credential authority is mutated.

Deletion is owned by the Host service. It requires exact identity, rejects Providers that still own models and
models referenced by any default. Provider configuration is removed before credential cleanup and
restored if the credential authority fails, protecting user configuration without reporting false success. Every
Provider record comes from the canonical TOML owner; config-only `builtin` metadata is neither projected nor used
as deletion authority. The Renderer only requests the operation after explicit confirmation and never receives
secret bytes.

No blocking quality findings were found in the scoped diff. The new Electron acceptance scenario is advisory
blocked by development process `74442`, which owns the checkout's Vite bundle. The launcher consequently timed
out waiting for a CDP target after the child process rejected startup; deterministic contract, service, runtime
and UI tests remain green.
