## Context

Desktop shell state and application settings are machine-local, structured, non-secret application
state. `@neko/host` owns their contracts and services, `@neko/local-metadata` owns the user-level SQLite
repositories, and Desktop Main owns only Electron path resolution and concrete wiring.

The original change implemented runtime import and downgrade paths for retired JSON repositories. The
cross-cutting `remove-internal-versioning-and-product-migrations` decision supersedes that design. The
repository is prelaunch, internal contracts ship together, and no independently deployed peer requires
schema negotiation. Keeping migration machinery creates a second successful authority path and lets one
old record affect global startup.

## Goals / Non-Goals

**Goals:**

- Keep `neko.db` as the only normal runtime authority for Desktop shell state and settings.
- Keep contracts and stable tables version-free and additive.
- Contain invalid data to the smallest Project, Window, Workbench instance, Scene, component or settings
  record that can be identified.
- Prove retired JSON and migration/export modules are unreachable from product runtime.
- Preserve all existing bytes without automatic conversion or deletion.

**Non-Goals:**

- Importing, classifying, archiving or exporting retired Desktop JSON.
- Adding schema registries, migration markers, compatibility readers, dual writes or automatic repair.
- Moving Agent, workspace, project, media, artifact, log or credential authorities into these tables.

## Decisions

### 1. Stable package-owned SQLite repositories are canonical

`@neko/host` owns shell/settings contracts and services. `@neko/local-metadata` provides stable tables
through narrow repositories. Desktop Main constructs the concrete store and delegates; renderer and
preload consume typed package projections without database or path access.

Initialization creates a missing stable table but never dispatches by schema generation. Updating an
existing authority row changes only canonical owned columns and preserves unknown columns. New optional
columns must have one permanent absence meaning.

### 2. Product migration paths are deleted

Startup, product imports, package public entries, build output and ordinary tests do not reference
retired JSON adapters, migration markers/coordinators, archive steps, downgrade export or compatibility
codecs. A retired file may remain on disk, but product code does not inspect its name or contents.

If valuable data requires repair, the operation is an explicitly authorized offline tool outside the
product dependency graph. It must require an exact target and confirmation, create an immutable backup,
write atomically and validate the bounded result.

### 3. Failure stays local

Authority roots validate required semantic collections. Unknown top-level metadata is preserved as
opaque data and reported by exact field name; it never selects a parser or business behavior. Child
records validate independently, so one invalid Window, Workbench instance, Scene or settings component
does not clear valid siblings or disable Desktop.

### 4. Ownership remains unchanged

| Data                         | Canonical owner                          |
| ---------------------------- | ---------------------------------------- |
| Desktop shell state          | `@neko/host` + local-metadata state repo |
| Desktop application settings | `@neko/host` + local-metadata state repo |
| Workspace/project facts      | Owning project codecs                    |
| Agent transcript/context     | Agent/Pi owners                          |
| Logs/journals                | Logger/Journal owners                    |
| Media/artifact bytes         | File/artifact owners                     |
| Credentials                  | SecretStorage/keychain                   |

## Risks / Trade-offs

- [Retired JSON contains valuable state] -> Preserve its bytes and report a product-unreachable offline
  repair requirement; never silently import or delete it.
- [One stored child is invalid] -> Reject only that exact owner and project a visible diagnostic while
  valid siblings remain usable.
- [A future change cannot be additive] -> Stop implementation until an explicit user-data and offline
  repair decision is approved.

## Replacement Plan

1. Establish version-free Host contracts and stable local-metadata repositories.
2. Switch Desktop composition atomically to those repositories.
3. Delete migration/export/legacy modules, exports, imports, registrations and commands.
4. Add product reachability and record-local failure tests.
5. Validate focused packages, full repository gates and real Electron startup/restart/workspace switching.

Rollback is source-level only. It must not restore product migration or rewrite user data.
