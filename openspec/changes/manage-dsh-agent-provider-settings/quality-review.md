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
