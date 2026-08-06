## Why

OpenNeko persists settings, Agent sessions, project facts, logs, cache projections, artifacts and
credentials across multiple local authorities. File extension or a broad label such as “configuration”
is not enough to decide ownership, portability, deletion or recovery. The product needs one admission
policy that respects its local Electron boundary without introducing generic migration/version machinery.

## What Changes

- Require every durable datum to declare owner, scope, user-management class, portability, sensitivity,
  durability, rebuildability, backup, deletion and retention before a repository is introduced.
- Keep one user-level `~/.neko/neko.db` for eligible machine-local structured state/cache through
  package-owned stable repositories; do not create workspace/package/Agent-specific databases.
- Keep user-visible project facts and portable definitions in owning domain files/bundles. Retain a
  business version only when users explicitly publish, select, pin, compare or restore that object.
- Keep Agent transcripts/session facts with Pi/Agent owners, logs with Logger/Journal owners, large
  bytes with file/artifact owners and credentials with SecretStorage/keychain.
- Prohibit product-runtime migration, legacy import, compatibility readers, migration markers,
  automatic repair and recursive cleanup. Retired bytes remain untouched and product-unreachable.
- Require record-local diagnostics so one invalid row/file/component does not disable valid siblings,
  another workspace or Desktop.
- Keep cloud synchronization out of scope; portability means explicit local export/copy/device transfer.

## Capabilities

### New Capabilities

- `local-storage-authority-policy`: Repository admission, ownership, portability, security, local failure
  and product-retired-path rules.
- `agent-storage-authority`: Agent config, transcript, operational state, cache, memory and credential
  authority boundaries without internal data versions or product migration.

### Modified Capabilities

<!-- None. -->

## Impact

- `@neko/local-metadata` owns the stable SQLite store primitive and package-scoped repositories.
- Domain packages remain authoritative for portable/user-managed facts and business versions.
- Agent/Pi, Logger/Journal, file/artifact and SecretStorage owners retain their data classes.
- Desktop Main only wires Electron paths and concrete adapters; it does not own classification or
  migration policy.
- Existing retired files and databases remain unchanged and outside product imports/build/startup.
