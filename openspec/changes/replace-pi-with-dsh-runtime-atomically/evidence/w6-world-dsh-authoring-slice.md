# W6 World DSH authoring slice

This slice adds the first-party `openneko.world` DSH Tool with two operations:
`query` and `fill-draft`. It follows the canonical path:

`DSH plugin -> reverse ACP -> exact Conversation authoring context -> exact Workspace grant -> WorldDshAuthoringService -> WorldAuthoringService/repository`.

The Tool accepts only an exact `WorldProject` target from the durable Conversation
authoring context. Its decoder reuses `parseWorldDefinition`, rejects unknown
fields, and `fill-draft` delegates to the owning fresh-target transaction. The
projection contains bounded WorldProject facts and immutable publication identity;
it does not expose workspace paths, runtime state, active UI selection or a
global/current World fallback. World is not wrapped in MCP and no Pi/provider
runtime is involved.

Deterministic evidence:

- `@neko/world`: 17 files / 64 tests, including strict input, authority,
  exact-target and bounded-publication tests.
- `@neko/world-dsh-plugin`: typecheck, build and registration smoke test.
- `@neko/agent-runtime`: ACP World adapter and runtime suite passed.
- Desktop typecheck and DSH profile/runtime closure tests passed.
- `pnpm check:agent-boundaries`, Tool inventory, package roles and product
  reachability passed with one `openneko.world` registration.

The visible Provider-backed World case remains `infrastructure-blocked`: the
current Evaluation Desktop driver cannot create an exact WorldProject authoring
surface or collect owning project facts. No direct ACP/World service case is
accepted as Agent behavior evidence.
