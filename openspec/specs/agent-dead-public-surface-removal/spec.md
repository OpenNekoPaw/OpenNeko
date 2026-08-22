# agent-dead-public-surface-removal Specification

## Purpose
TBD - created by archiving change remove-dead-agent-public-surface. Update Purpose after archive.
## Requirements
### Requirement: Dead pre-Pi Agent public surface is removed

`@neko/agent-runtime` and `@neko/agent-contracts` MUST NOT re-export the ProviderCard/ProviderRouter
routing subsystem, the approval strategy-pack engine, the permission rule engine, the validation and
perception pipelines, the external processor/research runtime providers, the profile registries, the
legacy conversation-control runtimes, or the dead contract files. These modules MUST be deleted together
with their exports, package subpaths, fixtures, and tests.

#### Scenario: Deleted modules are unreachable from public entries

- **WHEN** a test imports `@neko/agent-runtime` and its `./runtime` subpath
- **THEN** none of the deleted symbols are present in the resolved exports
- **AND** `ProviderRouter`, `createApprovalEngine`, `PermissionRuleMatcher`, `createOutputValidator`,
  `createPerceptionPipeline`, `createExternalProcessorRuntime` (or equivalents), and
  `createProviderCardRegistry` are absent

### Requirement: Canonical Agent paths are preserved

Deleting the dead surface MUST NOT remove the canonical Pi conversation authority, the
`PiToolConfirmationRegistry` approval path, the tool `schema-validator`, the live `tools/perception`
tools, the MCP runtime (including external-research tool creation options), the capability tool/manifest
registration path, or the live contract types in `composite-artifact.ts`, `agent-capability.ts`,
`provider-card.ts`, `agent-profile.ts`, and `external-research.ts`.

#### Scenario: Canonical exports remain

- **WHEN** a test imports `@neko/agent-runtime`
- **THEN** `createMCPClient`, `ToolRegistry`, `createToolRegistry`, `CapabilityRegistryRuntime`,
  `createCoreTools`, and the live image-batch transport symbols remain exported

### Requirement: No capability is migrated to another package

This change deletes dead code; it MUST NOT move any removed capability into another package or introduce
a replacement registry, adapter, or compatibility re-export.

#### Scenario: No replacement export exists

- **WHEN** the repository searches for the deleted module names and symbols
- **THEN** no new package, public entry, or re-export re-exposes them
