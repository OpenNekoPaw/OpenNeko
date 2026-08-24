## ADDED Requirements

### Requirement: DSH Session policy is the sole Agent permission authority for Host domain Tools

Every first-party DSH domain Tool request SHALL carry the effective sandbox mode resolved from the exact
calling DSH Session at dispatch time. OpenNeko SHALL transport and enforce that fact without defining a
second preset catalog, Renderer-controlled permission, Symlink permission mode or permissive default.

#### Scenario: Read-only Session queries Host state

- **WHEN** an exact DSH Session in `read-only` mode invokes a query or content-read operation
- **THEN** the owning Host adapter may execute the read through the exact Conversation resource grant
- **AND** existing locator, protected-state and domain authorization remain enforced.

#### Scenario: Read-only Session requests a mutation

- **WHEN** an exact DSH Session in `read-only` mode invokes Canvas create, Generation submit, Cut mutation
  or Character/World draft mutation
- **THEN** the exact Tool call fails with `DSH_DOMAIN_TOOL_READ_ONLY` before resolving or invoking the
  mutating application service
- **AND** sibling Tools, Conversations and Workspaces remain available.

#### Scenario: Workspace-write Session requests an authorized mutation

- **WHEN** an exact DSH Session in `workspace-write` mode invokes a mutation against its exact Host
  Workspace or authoring grant
- **THEN** the owning adapter delegates to the same canonical application service
- **AND** the mode does not bypass Content/path authorization, protected project state or resource identity.

#### Scenario: Permission fact is missing or invalid

- **WHEN** a reverse ACP domain Tool request omits the effective sandbox mode, supplies an unknown value or
  adds a non-canonical permission field
- **THEN** the request is rejected locally before domain service access
- **AND** Host does not infer a preset, use Renderer state, select the active Workspace or default to a
  writable mode.

#### Scenario: Session mode changes between Tool calls

- **WHEN** the user changes the exact DSH Session permission preset between two Host domain Tool calls
- **THEN** the bridge resolves the current Session sandbox policy independently for each call
- **AND** no cached preset name or earlier Tool request decides the later call's permission.
