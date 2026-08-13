## ADDED Requirements

### Requirement: Project local files are admitted only when disposable

A package SHALL own bounded machine-local files below project `.neko/` only when deletion initializes the
current canonical local state without losing or fabricating user facts. The package MUST declare its
codec, default, local failure boundary, sync/package exclusion, and whether the state follows the
checkout rather than the user-global catalog.

#### Scenario: Package proposes a project-local setting

- **WHEN** the setting affects only the current checkout binding, presentation, or disposable cache
- **THEN** storage admission permits one package-owned `.neko` record with explicit reset semantics
- **AND** rejects credentials, project identity, domain facts, valuable drafts, background task authority,
  and duplicate SQLite ownership

## MODIFIED Requirements

### Requirement: Retired data is outside product runtime

Product startup, public entries, build output and ordinary tests MUST NOT inspect, import, classify,
archive, delete, repair or rewrite retired databases, mixed config sources, or `.neko` records outside
the exact currently registered package-owned project-local paths. Existing unknown or retired bytes MUST
remain untouched. Canonical package-owned project `.neko` state is not retired merely because it is
workspace-local, but it MUST remain disposable and MUST NOT be read by another owner.

#### Scenario: Unknown retired workspace file exists

- **WHEN** project `.neko/` contains an unknown file outside every registered package-owned local path
- **THEN** normal product runtime ignores and preserves that file
- **AND** no cleanup, initialization, import, or migration is marked successful for it

#### Scenario: Canonical package local record exists

- **WHEN** an owning package reads its exact registered project `.neko` path
- **THEN** it validates only that bounded record and applies its declared local reset semantics
- **AND** it does not enumerate or reinterpret sibling owners or retired files
