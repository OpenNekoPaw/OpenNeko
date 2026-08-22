## Why

Neko Agent currently exposes a `ListDirectory` Tool schema that an OpenAI-compatible provider rejects before inference, and it misclassifies configured media credentials by reading a secret field that is intentionally absent from Provider metadata. These regressions can make ordinary greetings and image requests fail before the requested behavior starts.

## What Changes

- Require every provider-facing Agent Tool definition to use a top-level object schema without provider-rejected top-level combinators while retaining exact argument validation inside the canonical Tool boundary.
- Resolve generation-provider credential availability through the existing CredentialStore authority, preserving configuration-file priority over auth-login SecretStorage.
- Preserve generation-purpose capabilities when Desktop projects the Agent Launch model catalog into Webview configuration so a configured default media model reaches the first Draft submit.
- Keep media target routing as an internal Generation responsibility behind one exact execution-provider resolver instead of exposing `MediaRoutingManager` as an application owner.
- Keep unavailable generation credentials fail-local to the affected generation purpose so unrelated chat and sibling Tools remain usable.
- Give Project Workspace and Assistant Space generation distinct explicit owners. Assistant output and Job state remain durable under the user-owned Assistant Space root without requiring or fabricating a Project Workspace UUID.
- Add deterministic canonical-path regressions and focused Agent Evaluation coverage for ordinary chat, Workspace directory Tools, configured image generation, and missing-generation-credential behavior.

## Capabilities

### New Capabilities

- `agent-provider-tool-schema`: Provider-facing Tool schemas remain compatible top-level object contracts while canonical runtime validation preserves exact Tool argument semantics.
- `agent-generation-credential-routing`: Generation model bindings use the canonical credential authority and isolate unavailable credentials to the affected generation capability.
- `assistant-generation-ownership`: Assistant generation uses an exact Assistant Space owner and durable user storage without weakening Project Workspace identity.

### Modified Capabilities

None.

## Impact

- `packages/agent/runtime` remains the owner of Pi Tool projection, flat model-purpose policy, Tool registration, and fail-visible diagnostics.
- `packages/host` remains the L1 owner of secret-free provider/model configuration and the configuration-file credential source.
- `packages/agent/webview` remains the L2 producer of explicit/default media model selections; it does not gain credential or provider authority.
- `apps/neko-desktop` remains the thin Electron composition root that injects the existing credential runtime and losslessly adapts the package-owned Launch catalog; no secret parsing or generation policy moves into the application root.
- `scripts/agent-eval` gains or updates external evaluation cases for the real Desktop public Agent input path. No Evaluation capability is added to the product.
- Existing Project output and Job records keep their current storage contract. Assistant output is added under the existing user-owned Assistant Space root; no persisted conversation shape, provider configuration format, or credential priority changes.
