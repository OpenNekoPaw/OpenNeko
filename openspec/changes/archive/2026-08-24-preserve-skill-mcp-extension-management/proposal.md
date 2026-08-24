## Why

The Desktop Extensions entry is the product management surface for DSH-owned Skills and MCP
contributions. It was incorrectly retired while removing the obsolete OpenNeko Plugin management
runtime. Removing that entry deletes retained product behavior even though Plugin execution and
Plugin catalog management are the actual retired boundary.

## What Changes

- Restore the Desktop Extensions navigation scene and its sender-bound, snapshot-only management
  projection.
- Restrict the canonical projection and UI to exactly two user-visible extension kinds: Skill and
  MCP.
- Keep DSH Plugin as a precisely locked, first-party internal composition unit. Do not expose Plugin
  inventory, installation, enablement, configuration, Marketplace, or Webview code through the
  product surface.
- Keep DSH as the sole owner of Skill discovery and MCP connection/readiness; OpenNeko owns only the
  native management UI, typed trust boundary, and rebuildable projection.
- Add path-level tests that reject Plugin fields, tabs, routes, and legacy Plugin authority while
  proving Skill and MCP remain available.

## Capabilities

### New Capabilities

- `skill-mcp-extension-management`: A sender-bound Desktop surface presents only DSH-owned Skill and
  MCP inventory/readiness without becoming a second runtime authority.

## Impact

- `@neko/agent-contracts`: restores the L0 Skill/MCP management projection and Host request contract.
- `@neko/agent-webview`: restores the browser-only Skill/MCP catalog Root.
- `@neko/agent-runtime`, `@neko/dsh-bridge`: restore the read-only ACP projection from the exact DSH
  runtime authority.
- `@neko/host`: restores the Extensions Window scene and navigation intent.
- `apps/neko-desktop`: restores the native navigation, sender-bound IPC/preload adapter, runtime and
  composition wiring; it owns no catalog facts or Plugin lifecycle.
- User data is not migrated or rewritten. A previously persisted Extensions scene becomes valid
  again through the canonical scene decoder.
