## Product boundary

DSH owns effective Skill and MCP discovery, loading, enablement, execution, and runtime lifecycle. OpenNeko owns Host authorization, product settings intents, secret-safe configuration handoff, and read-only management projection.

## Core invariants

- Management state reflects the effective DSH catalog rather than a Renderer or OpenNeko shadow registry.
- Import, enable, disable, remove, and configuration changes target exact records and become visible only after DSH accepts them.
- Secrets and physical paths remain Host-owned and never enter renderer projections.
- One invalid Skill or MCP record produces a local diagnostic without disabling valid siblings.
- No Plugin runtime, wildcard contribution, fallback Tool, or parallel catalog is introduced.

## Product acceptance

The capability is complete when users can manage supported Skills and MCP contributions and observe their exact runtime effect through the authoritative Desktop path.

## Non-goals

This change does not define a general plugin marketplace or executable extension host.
