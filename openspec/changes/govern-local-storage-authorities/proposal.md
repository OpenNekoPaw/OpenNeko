## Why

OpenNeko currently classifies some storage correctly, but the runtime still mixes user-authored files,
logs, project facts, rebuildable projections, Agent operational state, and multiple SQLite files under
broad labels such as “configuration” or “Agent data”. Without one admission policy, each migration can
silently turn SQLite into a second authority for content the user expects to inspect, move, export, or
manage.

## What Changes

- Establish one repository-wide decision contract that selects file, canonical user-level SQLite,
  SecretStorage/keychain, managed log file, or process memory from data ownership and portability—not
  from the current file format.
- Require application-owned, non-secret, machine-local settings and operational state that users manage
  only through product UI to use the canonical user-level `~/.neko/neko.db` state namespace.
- Forbid raw logs, journals, user-authored or user-visible content, portable project facts, exportable
  Agent content, credentials, and media/artifact bytes from becoming SQLite-only authority.
- Split Agent storage into distinct authorities: UI-managed global configuration, secrets, Pi Session
  transcripts, conversation metadata, explicit memory, inferred/rebuildable memory, and ephemeral
  session scratch state.
- Collapse workspace persistence to visible, versioned project facts under `neko/`; replace the hidden
  `.neko/workspace.json` identity descriptor with `neko/project.json` and retire the normal-runtime
  workspace `.neko/` directory.
- Move machine-local workspace settings, indexes, runtime recovery, logs, and large derived caches to
  user-level authorities keyed by stable workspace identity. Keep optional explicit shared project
  memory at `neko/memory.md`; do not preserve generic workspace config/preferences files as parallel
  authorities.
- **BREAKING**: retire independent production SQLite authorities, including Agent metadata databases,
  by migrating their eligible rows into `~/.neko/neko.db`; no normal fallback or dual-write path remains.
- Define “must migrate” as data that must survive independently across reinstall, device transfer,
  workspace copy, or explicit export. This is separate from required versioned SQLite schema migration.
- Delegate Desktop shell/application settings repository migration to
  `migrate-desktop-local-state-to-sqlite`; this policy change classifies those values but does not
  implement a second repository or migration path.

## Capabilities

### New Capabilities

- `local-storage-authority-policy`: Repository-wide classification, authority, portability, backup,
  migration, deletion, and recovery rules for application, Agent, workspace, log, secret, and user data.
- `agent-storage-authority`: Canonical ownership and persistence boundaries for Agent configuration,
  transcript, catalog, memory, operational state, and secret data.

### Modified Capabilities

<!-- None. Active Agent and Desktop changes consume this policy without duplicating its requirements. -->

## Impact

- Owning responsibility: `@neko/local-metadata` owns classification and the canonical user-level SQLite
  adapter; Agent owners retain transcript/memory semantics; project domains retain project facts;
  Desktop Main composes repositories but does not own reusable storage policy.
- Affected package roles: `packages/local-metadata` L0 contracts and Node SQLite adapter,
  `packages/agent/runtime` Agent runtime persistence, `packages/host` configuration and host ports, and
  `apps/neko-desktop` application composition/migration adapters.
- Affected data: `~/.neko/neko.db`, the current Agent `metadata.sqlite`, global and workspace Agent
  configuration, Pi Session JSONL, legacy workspace `.neko/` content, `neko/project.json`, optional
  `neko/memory.md`, project facts, managed user-level logs/caches, and encrypted credential storage.
- Asset Library, Media Library and Entity persistence are outside this execution slice and remain in
  their dedicated changes; this policy must not mutate their schemas or authorities.
- Follow-on migrations must declare source authority, target authority, portability, user visibility,
  backup/export behavior, deletion semantics, and proof that the replaced path cannot succeed.
