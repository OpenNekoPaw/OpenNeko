## Context

The locked DSH runtime already owns an LLM configurable-provider directory and the `llm-pi-ai` adapter publicly exposes the wire protocols that its profile can serve. OpenNeko currently duplicates both decisions as Desktop Provider presets and protocol unions, then translates its TOML records into the DSH profile during subprocess materialization. That duplication hides catalog Providers DSH can configure and can drift when the pinned DSH runtime changes.

OpenNeko must still own user intent and trust-sensitive state: `~/.neko/config.toml` remains the canonical Provider/model/default document and Host SecretStorage remains the credential authority. DSH capability discovery is read-only execution metadata, not a second settings store.

## Goals / Non-Goals

**Goals:**

- Read the configurable Provider directory and supported profile protocols from the running, pinned DSH composition through a bounded public bridge operation.
- Use that projection to drive dialogue Provider creation and protocol selection in Desktop settings.
- Translate selected DSH identities into the existing OpenNeko TOML Provider/model authority and rematerialize the DSH runtime through the current atomic refresh path.
- Isolate malformed or unavailable capability entries without hiding valid siblings, and reject a selected capability that is no longer advertised.

**Non-Goals:**

- Moving user Provider/model/default configuration into DSH `settings.yaml`.
- Exposing DSH credentials, private plugin schemas, Cordis objects, or arbitrary settings namespaces to Renderer.
- Making generation Provider adapters or media model configuration DSH-owned.
- Automatically enabling every catalog Provider without an explicit OpenNeko user configuration.

## Decisions

### DSH publishes a bounded capability projection over the existing ACP bridge

The bridge will read `ctx.llm.listConfigurableProviders()` and the public `llm-pi-ai` supported-protocol catalog inside the isolated DSH subprocess. It will return detached JSON containing only stable Provider identity, display name, declared/catalog provenance, settings owner/path, and supported protocol identities. Desktop will not import the DSH runtime or inspect staged package files.

Alternative considered: import DSH packages directly in Electron Main. This would violate the isolated-runtime boundary and could let Main and the subprocess observe different installed closures.

### OpenNeko configuration remains authoritative for user choices

The DSH projection answers what the current runtime can execute. Saving a Provider still writes the existing canonical OpenNeko TOML shape and stores only a Host credential reference; the current profile materializer converts that state into the DSH `llm-pi-ai` profile. DSH inventory is not persisted as user data and is re-read after each runtime instance connects.

Alternative considered: write DSH `settings.yaml` from the settings UI. That would create a second user configuration authority and bypass Host credential and runtime-refresh semantics.

### Product policy is metadata, not a capability whitelist

OpenNeko may attach presentation defaults such as a suggested endpoint, connection kind, support label, or credential expectation to known Provider identities, but absence of such metadata cannot remove a Provider or protocol advertised by DSH. Unknown catalog entries remain configurable with explicit user-entered endpoint and model data.

### Capability loss fails visibly at the smallest boundary

The settings projection remains usable when individual DSH directory entries are malformed; each rejected entry produces a diagnostic while valid siblings remain selectable. A save naming a Provider/protocol absent from the current projection is rejected before TOML mutation. If the DSH runtime is unavailable, Provider capability-dependent creation is visibly unavailable while existing OpenNeko records remain inspectable and removable.

## Risks / Trade-offs

- [DSH exposes only opaque protocol identities] → Preserve identities as opaque strings across the capability contract and keep protocol-specific conversion inside the DSH profile boundary.
- [The running DSH instance reflects the pre-edit configuration] → Read immutable adapter capabilities and the configurable directory from the connected instance; continue using the existing atomic restart/rematerialization path after an accepted edit.
- [A newly pinned DSH release changes its public capability contract] → Exact decoders and bridge tests fail visibly; no local fallback whitelist is used.
- [Catalog Providers require auth or endpoint fields OpenNeko does not yet present] → Keep capability visible but disable save with an explicit field-support diagnostic until the bounded OpenNeko form can express the required values.
