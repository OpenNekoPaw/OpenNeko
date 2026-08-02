## Context

OpenNeko already has a useful classification model in `@neko/local-metadata`, one canonical
user-level database at `~/.neko/neko.db`, Pi Session JSONL, encrypted Desktop secrets, project facts,
and managed log roots. The remaining problem is authority drift:

- Desktop shell/settings still use JSON under Electron `userData`.
- Agent conversation metadata creates a separate `agent/pi/metadata.sqlite`.
- `~/.neko/config.toml` mixes portable Agent definitions, UI-managed runtime preferences, and legacy
  credential input.
- `.neko/` contains project identity, explicit memory, local configuration, logs, cache, and runtime
  locks whose ownership differs even though their paths share a prefix. The directory itself has
  become a misleading mixed-authority container.
- Current storage classifications do not explicitly encode whether users must perceive/manage a datum,
  whether it must travel independently, or whether SQLite is authority or only a projection.

Here, “must migrate” means device/install/workspace transfer or explicit user export. It does not mean
SQLite schema migration: every SQLite namespace still requires versioned, tested schema upgrades.

## Goals / Non-Goals

**Goals:**

- Make authority selection deterministic from responsibility, user management, portability,
  sensitivity, durability, and rebuildability.
- Keep one normal production SQLite file and explicit state/cache namespaces.
- Preserve files for content whose identity, content, location, import/export, or lifecycle users must
  perceive or manage.
- Make the workspace layout visible and minimal: portable facts under `neko/`, with machine-local
  state, logs, and derived data outside the workspace.
- Define concrete Agent configuration, transcript, memory, and workspace decisions.
- Provide restart-safe migration and deletion semantics without fallback or dual authority.

**Non-Goals:**

- Storing logs, media bytes, generated deliverables, project documents, Skills, prompts, profiles,
  explicit memory, transcripts, or secrets in ordinary SQLite.
- Creating cloud sync, cross-device database replication, workspace databases, or a general blob store.
- Treating a setting shown in product UI as user-authored file content. Theme, locale, layout, and recent
  selections are user-visible settings but their storage file is not user-managed.
- Redesigning the Creative Entity fact schema. Entity discovery and representation lifecycle require a
  dedicated change; this policy only classifies confirmed facts versus rebuildable evidence.
- Migrating every classified source in one release; implementation remains owner-scoped and ordered.

## Decisions

### 1. Extend the storage contract with authority dimensions

`@neko/local-metadata` remains the L0 owner through `@neko/local-metadata`'s public storage contract.
The classification records at least:

- semantic owner and scope;
- canonical authority kind (`file`, `sqlite-state`, `sqlite-cache`, `secret`, `log-file`, `memory`);
- user management (`opaque`, `ui-managed`, `user-content`);
- portability (`machine-local`, `workspace-portable`, `user-exportable`);
- durability/rebuildability, backup, deletion, retention, and migration policy;
- whether SQLite may contain authority, a rebuildable projection only, or no representation.

Desktop Main consumes this contract while composing concrete repositories. Logic retained in
`apps/neko-desktop` is limited to Electron paths, `safeStorage`, startup sequencing, windows, and
native adapter wiring; classification and reusable repositories/migration coordinators stay in
packages. Desktop shell/application-settings migration is owned exclusively by
`migrate-desktop-local-state-to-sqlite`.

Alternative rejected: classify by extension or current location. JSON, TOML, Markdown, and SQLite can
all contain either product state or user content; format is not ownership.

### 2. Use a fail-closed admission sequence

Before adding a SQLite table, the owning change must answer in order:

1. Is it a secret or trust credential? Use SecretStorage/keychain.
2. Is it a raw log/audit/journal stream? Use an append-oriented managed file with retention.
3. Must the user perceive/manage its content, identity, path, import/export, or transfer? Use a
   versioned file/bundle as authority.
4. Is it a large byte artifact or retained media? Use the owning file/artifact store.
5. Is it ephemeral? Keep it in process memory or managed scratch storage.
6. Is it rebuildable structured metadata? Use `neko.db#cache` or a managed file cache when large.
7. Is it non-secret, machine-local, UI-managed application/operational state? Use `neko.db#state`.

Unknown classification fails review and the repository gate. It does not default to SQLite or JSON.

### 3. Keep one canonical SQLite file with owner namespaces

All eligible state and cache rows use `~/.neko/neko.db` through `@neko/local-metadata` repositories and
versioned owner migrations. Workspace, package, Electron `userData`, and Agent-specific SQLite files
are forbidden normal authorities.

The existing Agent `metadata.sqlite` is replaced by Agent-owned repositories on the shared database.
Conversation lease, checkpoint, task, and rebuildable index operations remain Agent-owned even though
the generic transaction/schema adapter is Local Metadata-owned. A migration coordinator validates and
imports old rows, commits a marker, verifies through production codecs, then archives the old database.
Normal runtime never opens it afterward.

Alternative rejected: one database per domain. It duplicates backup/integrity/migration policy and
prevents transactional ownership where workspace, task, and conversation identities meet.

### 4. Classify application and Agent configuration by portability

| Data                                                                   | Authority                                | Rationale                                         |
| ---------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Theme, locale, startup behavior, layout, recent selections             | `neko.db#state`                          | UI-managed machine-local application settings     |
| Agent feature flags, active provider/model selection, runtime defaults | `neko.db#state`                          | UI-managed machine-local Agent application state  |
| Reusable provider/model definitions and personal MCP definitions       | versioned user config file/export bundle | User-managed and portable Agent configuration     |
| Project-scoped capability declarations with a current product owner    | owning versioned project file            | Must travel with the project; no generic config   |
| Machine-local workspace overrides                                      | `neko.db#state`, keyed by workspace ID   | UI-managed local state, not portable project fact |
| Skills, prompts, profiles, processors, `AGENTS.md`                     | files                                    | User-authored/exportable content                  |
| API keys, OAuth tokens, credential provenance payloads                 | SecretStorage/keychain                   | Secret boundary; never ordinary SQLite/config/log |

The legacy global TOML reader becomes an explicit import source. Import splits UI-managed selections
to SQLite, portable definitions to a versioned user export/import authority, and credentials to
SecretStorage. Unknown or mixed secret fields fail visibly. A normal runtime does not require
`~/.neko/config.toml` after migration. Workspace `.neko/config.toml`, `.neko/settings.local.json`, and
`.neko/preferences.md` are retired rather than renamed; a real project-scoped capability must define
an owning schema under `neko/` before it can persist portable configuration.

### 5. Split Agent conversation and memory authorities

| Agent data                                                        | Authority                                            | SQLite role                                                  |
| ----------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| Pi messages, tool transcript and compaction                       | Pi Session JSONL                                     | none                                                         |
| User-visible conversation title, branch manifest, export identity | versioned conversation manifest beside session files | optional derived IDs/timestamps only; no user text authority |
| Execution lease, writer epoch, turn durability/checkpoint         | `neko.db#state`                                      | authority                                                    |
| Conversation list/search acceleration                             | `neko.db#cache`                                      | rebuildable projection                                       |
| Explicit accepted shared project memory                           | optional tracked `neko/memory.md`                    | none                                                         |
| Inferred embeddings, semantic index, freshness cursor             | `neko.db#cache`                                      | rebuildable; raw user text is not authoritative              |
| Cross-ring/session scratchpad                                     | process memory                                       | optional restart checkpoint only when a use case requires it |
| Agent runtime/audit/model-call logs                               | managed JSONL files                                  | none                                                         |

Conversation export contains the manifest and referenced Pi Session files. Removing `neko.db` may lose
in-flight leases/checkpoints but must not destroy portable transcript, title, or accepted memory.

This intentionally tightens the active Pi design: product lifecycle mechanics may be SQLite state,
but user-perceived conversation content and portable topology cannot exist only in SQLite.

### 6. Remove the mixed-authority workspace `.neko/` directory

Normal production workspaces contain user documents plus visible, versioned facts under `neko/`.
They do not create or depend on a hidden `.neko/` runtime directory.

| Workspace data                                                     | Authority                                                | SQLite role                              |
| ------------------------------------------------------------------ | -------------------------------------------------------- | ---------------------------------------- |
| Project JSON/NKC/OTIO/Markdown and generated/promoted deliverables | owning project/artifact files                            | none                                     |
| Stable project/workspace identity and minimal project metadata     | tracked `neko/project.json`                              | global registry may cache locator/status |
| Project settings, bindings, source declarations                    | owning versioned files under `neko/`                     | derived projection only                  |
| Explicit user-approved shared project memory                       | optional tracked `neko/memory.md`                        | rebuildable semantic index only          |
| Machine-local workspace preferences and recent/current locator     | `neko.db#state`, keyed by stable workspace ID            | authority for local installation only    |
| Search/media/entity indexes and freshness                          | `neko.db#cache`                                          | rebuildable                              |
| Large previews and derived cache bytes                             | `~/.neko/cache/workspaces/<workspaceId>/`                | optional cache catalog only              |
| Task ledger/checkpoints not exposed as project facts               | `neko.db#state`                                          | operational authority                    |
| Desktop/workspace/Agent logs                                       | `~/.neko/logs/...`, partitioned by stable owner identity | prohibited                               |
| Import staging and temporary files                                 | user-level managed scratch roots                         | prohibited                               |

`neko/project.json` is not a catch-all settings document. It owns only stable identity, schema
version, and explicitly accepted project-wide metadata. Each additional section requires an owning
domain contract. Generic `.neko/config.toml`, `.neko/settings.local.json`, and
`.neko/preferences.md` are not migrated into it.

`neko/memory.md` is created only when the product exposes explicit project memory that the user can
review, edit, delete, and sync. Entity facts, character facts, document content, inferred summaries,
and session scratch MUST NOT be copied into it. If that product surface does not exist, no empty or
implicit memory file is created.

Logs are stored outside the workspace under owner-partitioned roots such as
`~/.neko/logs/desktop/`, `~/.neko/logs/workspaces/<workspaceId>/`, and
`~/.neko/logs/agent/<conversationId>/`. Pi Session JSONL remains conversation authority and is not
reclassified as a log.

Project files never depend on an active-workspace fallback or an absolute path stored as a portable
fact. SQLite loss cannot cause reconstruction or overwrite of project facts.

Legacy `.neko/` migration inventories every entry before mutation. Known valuable data is migrated or
promoted through its owning codec, rebuildable data is discarded only after its source is verified,
and unknown content blocks directory removal with a safe diagnostic. The migration never recursively
deletes the directory merely because its name is deprecated.

### 7. Require owner-scoped migration and proof

Each source migration owns preflight validation, backup/export policy, transaction/atomic publication,
verification through production codecs, a versioned marker, archival/removal, and explicit rollback.
Tests poison the replaced source after commit and assert the canonical path. Raw logs are never imported
as relational rows; file retention/movement is handled by the log owner.

## Risks / Trade-offs

- **[Portable Agent configuration is split from runtime preferences]** → Expose one UI projection while
  preserving source provenance and provide one explicit export/import bundle.
- **[Conversation manifest adds another file type]** → Keep it small, versioned, atomic, and owned by the
  conversation authority; Pi Session remains the sole message/context authority.
- **[Shared database increases coordination needs]** → Keep repository ownership and migrations
  namespaced, use existing transaction modes, and test concurrent readers/writers and disposal.
- **[Legacy TOML or Agent database contains mixed/unknown data]** → Preflight everything, fail closed,
  preserve sources, and never partially switch authority.
- **[Derived SQLite data may contain sensitive excerpts]** → Minimize raw text, apply deletion with the
  source owner, and treat cache access as local sensitive data even though it is rebuildable.

## Migration Plan

1. Extend classification contracts and add static/adapter tests for every authority combination.
2. Let `migrate-desktop-local-state-to-sqlite` make Desktop shell/application settings consume
   `neko.db#state`; this governance change supplies only the admission policy and fixtures.
3. Split global Agent configuration and credentials with explicit legacy TOML import/export.
4. Add portable conversation manifests and rebuildable catalog projection; then migrate eligible Agent
   metadata rows into `neko.db` and retire `metadata.sqlite`.
5. Audit explicit memory, workspace facts, logs, caches, and task state against the matrix; migrate only
   misclassified sources with owner-specific changes. Publish `neko/project.json`, move user-level
   logs/caches, and retire the workspace `.neko/` directory only after a complete preservation audit.
6. Run backup/restore, interruption, poison-path, real Electron restart, and export/import acceptance.

Rollback is owner-scoped. Before installing a build that expects an old authority, run the validated
downgrade exporter for that source. Normal startup never invokes rollback exports or legacy fallback.

## Open Questions

- Automatic cross-device sync remains out of scope; the policy defines portable authorities and export
  boundaries but not a transport.
- Retention duration and user-facing deletion UX for Pi Session files and conversation exports require a
  product policy before automatic cleanup is enabled.
