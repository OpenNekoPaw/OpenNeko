## Why

Users need management actions that change the effective DSH Skill and MCP catalog rather than a read-only or Renderer-owned shadow state.

## What Changes

- Add exact import, enable, disable, remove, readiness, configuration, and diagnostic workflows for supported Skills and MCP contributions.
- Reflect only DSH-accepted runtime state and keep paths, secrets, and Host authority out of renderer projections.
- Keep invalid records fail-local without restoring an OpenNeko Plugin runtime.

## Capabilities

### New Capabilities

- `dsh-skill-mcp-lifecycle`

### Modified Capabilities

<!-- None. -->

## Impact

DSH remains runtime authority; OpenNeko owns trusted product intents and management projection. Existing valid Skills, MCP contributions, Conversations, and user configuration remain preserved.
