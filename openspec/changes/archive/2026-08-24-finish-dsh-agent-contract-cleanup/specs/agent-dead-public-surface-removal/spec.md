## MODIFIED Requirements

### Requirement: Dead pre-DSH Agent public surface is removed

`@neko/agent-runtime` and `@neko/agent-contracts` MUST NOT re-export or retain the removed OpenNeko
ProviderCard/provider-routing subsystem, generic Tool/Platform registry contracts, profile registry
contracts, approval/permission strategy engines, validation/perception pipelines, external
processor/research providers, legacy conversation controls, PluginTransfer graph, or unreachable
composite/storyboard/shot/comic/multimodal artifact projection graphs. Dead modules MUST be deleted
together with their exports, package subpaths, fixtures, tests and dead-only consumers.

#### Scenario: Deleted modules are unreachable from public entries

- **WHEN** the repository resolves `@neko/agent-contracts`, `@neko/agent-runtime` and their public subpaths
- **THEN** no deleted symbol, file, compatibility alias or replacement barrel is reachable
- **AND** generic `ToolRegistry`, `IPlatform`, `ProviderCard`, `AgentProfileRegistry`, PluginTransfer and
  retired perception/artifact planning contracts remain absent

### Requirement: Canonical DSH Agent paths are preserved

Cleanup MUST preserve the canonical DSH ACP application boundary, DSH Session/runtime/permission Host
contracts, closed Conversation owner and Agent Entry codecs, Conversation context/binding, current
composer/input contracts, authorized attachment transport, Skill/MCP management and exact
package-owned domain Tool contracts.

#### Scenario: Canonical exports remain

- **WHEN** current Main, preload, renderer, DSH bridge, Agent runtime and first-party domain Tool
  contributions typecheck against their public package entries
- **THEN** they resolve one canonical DSH/Agent shape for each boundary
- **AND** no removed Pi or generic OpenNeko Tool/Platform path participates

### Requirement: No retired capability is migrated to another package

This cleanup deletes unreachable code. It MUST NOT move a removed capability into Desktop, Agent
Domain, another domain package or a replacement registry, and MUST NOT add a compatibility re-export.

#### Scenario: No replacement export exists

- **WHEN** the repository searches for deleted module names and symbols
- **THEN** no new package, public entry, adapter or alias re-exposes them
- **AND** live package-owned domain facts and operations remain under their existing owners

## RENAMED Requirements

- FROM: `### Requirement: Dead pre-Pi Agent public surface is removed`
- TO: `### Requirement: Dead pre-DSH Agent public surface is removed`
- FROM: `### Requirement: Canonical Agent paths are preserved`
- TO: `### Requirement: Canonical DSH Agent paths are preserved`
- FROM: `### Requirement: No capability is migrated to another package`
- TO: `### Requirement: No retired capability is migrated to another package`
