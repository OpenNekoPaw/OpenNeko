# Validation status

Updated: 2026-08-03

The migration is implemented through `@neko/host` shell/settings contracts and services,
`@neko/local-metadata` repositories/migration/export workflow, and Desktop-only Electron path plus
retired-JSON adapters. Normal startup has one authority at `~/.neko/neko.db`; there is no JSON fallback
or dual write.

Evidence:

- `@neko/local-metadata`: 20 files / 91 tests passed, including preflight, atomic import, marker,
  interruption, partial/corrupt input, repeated startup, archive failure and downgrade export.
- `@neko/host`: 33 files / 280 tests passed for package-owned shell/settings contracts, services and
  repository behavior.
- Desktop: 57 files / 315 tests passed, including delegation, migration adapter and adjacent-owner
  negative fixtures.
- `pnpm test:local:ui --scenario=desktop-state-sqlite-migration --target=development` passed isolated
  real Electron migration plus restart restoration.
- `pnpm ci:local`, `pnpm check:legacy-debt`, `pnpm check:storage-authorities`, Knip and strict OpenSpec
  passed.

Negative fixtures prove the migration does not read or mutate Agent configuration/transcripts/logs,
workspace `.neko/workspace.json`, target `neko/project.json`, or `neko/memory.md`. Downgrade remains an
explicit command and never participates in normal startup.
