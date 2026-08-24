## Why

The Extensions surface currently receives a read-only DSH Skill catalog and an empty MCP projection.
It cannot honestly add, enable, disable or remove either capability. Reintroducing the retired
OpenNeko Plugin manager or storing Renderer-only flags would create a second runtime authority and
would not change the Agent's effective catalog.

## What Changes

- Extend the OpenNeko DSH bridge with precise Skill and MCP management inventory and commands backed
  by the running DSH Skill provider and Cordis Loader.
- Add personal Skill import with DSH validation; only personal Skills are removable. Bundled and
  project Skills retain source-aware restrictions.
- Adopt the official `@deepseek-ai/dsh-mcp-client` contribution for qualified MCP servers and let the
  DSH Loader own create, enable, disable, remove and live tool exposure.
- Keep executable arguments and endpoint configuration out of the read projection; credential fields
  are not accepted by this initial lifecycle contract.
- Add sender-bound Desktop commands and UI actions; do not expose generic Plugin management.

## Capabilities

### New Capabilities

- `dsh-skill-mcp-lifecycle`: Users manage personal Skills and qualified MCP server entries through
  exact DSH-owned lifecycle commands.

## Impact

- `@neko/agent-contracts`, `@neko/agent-runtime`: strict inventory and command contracts.
- `@neko/dsh-bridge`: adapter over public DSH Skill and Loader APIs; no second Agent or MCP runtime.
- `@neko/agent-webview`: source-aware add, enable, disable and remove controls.
- `apps/neko-desktop`: native Skill directory selection and sender-bound IPC.
- Packaged DSH profile: precisely locked official MCP client dependency.
- Personal Skill bytes and MCP entries are user data. Removal requires explicit confirmation and is
  scoped to the selected exact entry.
