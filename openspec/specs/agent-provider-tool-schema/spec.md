# agent-provider-tool-schema Specification

## Purpose
TBD - created by archiving change fix-agent-tool-schema-and-media-credential-routing. Update Purpose after archive.
## Requirements
### Requirement: Provider-facing Agent Tools use compatible object schemas

Every Tool definition sent through the canonical Pi provider path SHALL have `type: object` at the top level and MUST NOT contain top-level `oneOf`, `anyOf`, `allOf`, `enum`, `const` or `not`. Nested property constraints, required fields and additional-property policy SHALL remain intact.

#### Scenario: Workspace Tool definitions are submitted to an OpenAI-compatible provider

- **WHEN** a Workspace Agent turn registers `ListDirectory` and the other current Tools
- **THEN** every submitted Tool has a compatible top-level object schema
- **AND** nested enum and structural constraints remain available to the provider
- **AND** one invalid Tool definition does not cause the provider to reject an otherwise ordinary message

### Requirement: Canonical Tool validation preserves exact argument invariants

Provider schema projection SHALL NOT become the authority for invariants that the owning Tool model protocol validates. `ListDirectory` SHALL continue to accept exactly one of `path` or `cursor_ref` and SHALL reject both-present, both-absent, unknown or forged short-reference inputs before filesystem execution.

#### Scenario: Model submits a valid first-page directory request

- **WHEN** `ListDirectory` receives one valid Workspace-relative `path`
- **THEN** the canonical protocol prepares one core Tool request and returns its bounded result

#### Scenario: Model violates the directory argument invariant

- **WHEN** `ListDirectory` receives both `path` and `cursor_ref`, neither field, or a forged cursor reference
- **THEN** only that Tool call fails with an explicit diagnostic
- **AND** no filesystem call, alternate Tool, provider fallback or sibling capability shutdown occurs
