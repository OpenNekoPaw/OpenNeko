## Why

Desktop shell state and application settings are UI-managed machine-local application state. Their
canonical authority is the existing user-level `neko.db`, owned through package contracts rather than
Desktop-local JSON repositories. The earlier runtime migration design is superseded by
`remove-internal-versioning-and-product-migrations`: product startup must open the canonical authority
directly and must not import, archive, downgrade-export or otherwise inspect retired JSON data.

## What Changes

- Keep state-owned SQLite repositories for Desktop shell state and application settings in the
  existing user-level `neko.db`.
- Use stable tables and version-free package-owned contracts; initialization creates only missing
  tables and ordinary writes update canonical owned columns.
- Delete product-reachable migration markers, legacy JSON readers/writers, startup import/archive
  workflow, downgrade export, dual-read/dual-write and automatic repair.
- Leave retired JSON bytes untouched and outside product imports, build, startup, public entries and
  ordinary tests. Any separately authorized offline repair must target exact data and preserve a backup.
- Reject invalid child records at their exact owner boundary while valid sibling Shell/settings state
  remains available.
- Keep portable/user-managed Agent configuration, conversation content, explicit memory, workspace
  identity and project facts, journals/logs, media/artifact bytes, and credentials with their distinct
  owners.

## Capabilities

### New Capabilities

- `desktop-local-state-sqlite-migration`: Retained capability name for this completed prelaunch change;
  its final requirement is the stable canonical SQLite authority and explicit retirement of every
  product migration path.

### Modified Capabilities

<!-- None. -->

## Impact

- `@neko/host`: version-free shell-state and application-settings contracts/services.
- `@neko/local-metadata`: stable SQLite repositories and record-local diagnostics.
- Desktop Main: Electron path resolution, repository wiring and diagnostic projection only.
- Product startup/restart reads only canonical SQLite authorities; retired files remain untouched.
