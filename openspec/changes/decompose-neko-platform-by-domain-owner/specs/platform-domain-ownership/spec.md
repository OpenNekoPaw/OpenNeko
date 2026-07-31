## ADDED Requirements

### Requirement: Every Platform export has one canonical owner

The migration SHALL maintain an export-level inventory for `@neko/platform` containing the current
entry, runtime layer, consumers, storage effects, target owner, target public entry, and disposition.
Every retained export MUST resolve to one established bounded context or the Desktop composition
root; no export may target a generic replacement Platform/Shared facade.

#### Scenario: Inventory is validated before implementation

- **WHEN** the Platform migration begins
- **THEN** every public and consumer-reachable export has exactly one target owner and disposition
- **AND** an unmapped, multiply owned, or ownerless export fails validation

### Requirement: Platform responsibilities move according to domain and runtime ownership

Agent configuration/provider contracts SHALL move to Agent or AI SDK ownership, Generation job and
output lifecycle behavior SHALL move to `@neko/generation`, and concrete configuration, credential,
filesystem, and OS integration SHALL remain in Desktop Main adapters. Renderer/Webview consumers
MUST NOT gain Node or Electron access through the migration.

#### Scenario: A migrated capability crosses Desktop runtime boundaries

- **WHEN** Desktop composes a migrated Platform capability
- **THEN** it imports a narrow public contract or runtime entry from the owning package
- **AND** concrete host effects execute in Desktop Main
- **AND** no domain, renderer, or Webview package imports Desktop, Node, or Electron code illegally

### Requirement: Consumers use direct canonical owners

Each migrated producer and consumer SHALL use the target package public entry. The implementation
MUST NOT retain a Platform facade, compatibility alias, fallback import, dynamic optional import,
dual registration, or old-path success response.

#### Scenario: A stale Platform import is introduced

- **WHEN** repository architecture and legacy-debt guards scan production code, manifests, tests, and
  package exports after migration
- **THEN** the stale import or re-export fails visibly
- **AND** no fallback resolves the request through `@neko/platform`

### Requirement: Platform retirement protects local user data

Configuration or storage ownership changes SHALL identify affected user-data locations and schemas.
Supported state MUST be migrated or reused explicitly; unknown or unsupported state MUST return a
diagnostic rather than reset or report success.

#### Scenario: Existing Desktop configuration is loaded after migration

- **WHEN** a supported isolated user-data fixture is opened
- **THEN** the owning Desktop adapter preserves the configured values and credential references
- **AND** the removed Platform path does not participate

### Requirement: Platform package is removed after path-level verification

Completion SHALL remove `packages/neko-platform`, the `@neko/platform` manifest identity, lockfile
entry, root orchestration references, active documentation references, and executable test aliases.
Verification MUST prove both target behavior and absence of old-path participation.

#### Scenario: Repository gates run after retirement

- **WHEN** build, test, check, dependency, unused, legacy-debt, and affected Desktop runtime gates run
- **THEN** retained Agent, Generation, and Desktop paths pass through their canonical owners
- **AND** the removed package cannot build, resolve, or return success
