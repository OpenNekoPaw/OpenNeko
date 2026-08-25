# skill-mcp-extension-management Specification

## Purpose
Expose only DSH-owned Skill and MCP management without restoring generic Plugin catalog or runtime authority.
## Requirements
### Requirement: Extensions exposes only Skill and MCP management

The product SHALL provide an Extensions navigation surface whose only user-visible extension types
are Skill and MCP. The projection, UI, Host contract and IPC route MUST NOT expose Plugin inventory,
installation, enablement, configuration, Marketplace state, executable paths, or third-party Webview
code.

#### Scenario: User opens Extensions

- **WHEN** the user opens the Extensions entry
- **THEN** the surface presents Skill and MCP catalogs from the exact DSH authority
- **AND** no Plugin tab, record, action or configuration is present

#### Scenario: A projection contains Plugin state

- **WHEN** a producer sends a Plugin field or another unsupported extension type
- **THEN** the strict contract rejects that projection visibly
- **AND** sibling scenes and Agent Sessions remain available

### Requirement: DSH owns Skill and MCP runtime facts

Skill discovery/loading and MCP connection/readiness SHALL remain owned by the exact DSH profile.
OpenNeko SHALL own only the native management presentation, sender-bound trust adapter and rebuildable
snapshot projection. It MUST NOT restore a Skill Host, MCP Manager, Plugin runtime, local catalog
authority, private DSH module access, or direct DSH storage writes.

#### Scenario: DSH is running

- **WHEN** the exact sender-bound Extensions surface requests a snapshot
- **THEN** Desktop projects the DSH-owned Skill and MCP facts through the canonical bridge
- **AND** no OpenNeko runtime loads or connects the contribution

#### Scenario: DSH is unavailable

- **WHEN** the surface requests a snapshot while DSH is unavailable
- **THEN** only that surface receives an explicit runtime-unavailable diagnostic
- **AND** no alternate catalog or runtime provides fallback success

### Requirement: Plugin is internal composition only

DSH Plugin packages SHALL remain only as precisely locked, first-party internal composition units for
the official profile. They MUST NOT become a user-installable extension type or a general third-party
execution platform. User-facing extension management SHALL expose only Skill and MCP facts.

#### Scenario: Internal first-party DSH Plugin is loaded

- **WHEN** the official profile loads a qualified first-party domain Tool or MCP contribution
- **THEN** it participates only in DSH internal composition
- **AND** the Extensions surface exposes only the resulting Skill or MCP user-facing facts, if any
