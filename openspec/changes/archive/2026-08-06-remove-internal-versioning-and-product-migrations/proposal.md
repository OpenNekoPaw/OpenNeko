## Why

OpenNeko currently versions internal contracts, component state, project facts, caches, and runtime messages, then carries product-startup migrations and compatibility readers for those generations. This causes ordinary package updates or stale bundled code to invalidate unrelated local state and can escalate one malformed record into a disabled surface, workspace, or application.

## What Changes

- **BREAKING** Remove meaningless OpenNeko-owned `version`, `schemaVersion`, `contractVersion`, `protocolVersion`, versioned names/paths, and equivalent data-generation discriminators from internal contract shapes, messages, component state, caches, and indexes. Retain versions that users actually manage as domain data.
- **BREAKING** Delete product-runtime migrators, legacy readers/writers, compatibility codecs, migration markers, automatic repair/rebuild paths, and startup migration registration. Existing invalid data remains untouched and is rejected only at its smallest owning boundary.
- Replace unnecessary version/revision/epoch/generation-based internal routing and invalidation with exact instance identity, request identity, ownership isolation, serialized owner operations, or boundary-local content fingerprints. Retain a narrow correctness token only when a verified consumer and invariant prove it cannot be removed safely.
- Keep third-party service, library, API, protocol, model, file-format, build-tool, dependency, and release versions at their required adapter, provider-specific config/contract, lockfile, or manifest boundary.
- Add a repository quality gate that rejects new meaningless internal version fields, versioned paths, migration code, and compatibility dispatch while requiring exact evidence for every third-party, user-managed domain, or unavoidable correctness allowance.
- Require record-, component-, instance-, sender-, or request-local failure containment so one invalid input cannot disable unrelated data, surfaces, workspaces, or the Desktop application.

## Capabilities

### New Capabilities

- `internal-version-free-contracts`: Defines canonical OpenNeko-owned contract shapes and component data without technical version discriminators, plus governed third-party, user-managed domain, and verified correctness exception processes.
- `product-runtime-migration-retirement`: Removes all product-reachable data migration, legacy compatibility, and automatic repair paths while preserving user data for explicit offline handling.
- `local-invalid-data-containment`: Requires malformed or stale local inputs to fail visibly only within the smallest owning record, operation, instance, sender, or surface.

### Modified Capabilities

- `standard-3d-model-preview`: Removes versioned Preview staging and protocol state while keeping failures panel-local.
- `desktop-media-consumer-projection`: Replaces migration/poison requirements with deletion of legacy product paths and version-free canonical consumers.
- `legacy-asset-catalog-retirement`: Removes product migration planning and migration archives from the normal runtime boundary.
- `media-library-resource-entry`: Makes media projection refresh independent of schema generations and prevents one invalid projection entry from disabling the library or workspace.

## Impact

- `@neko/host` owns version-free Shell, Workbench, Scene, settings, grant, and application contracts plus local failure semantics; Desktop remains the Electron composition and sender/trust adapter.
- `@neko/agent-contracts`, `@neko/agent-runtime`, and `@neko/agent-webview` own version-free Agent messages, conversation/component state, projections, and instance-local recovery behavior.
- `@neko/assets-domain`, `@neko/assets-node`, and `@neko/assets-webview` own version-free Resource Browser, Asset Center, media-library, and portability contracts plus retained managed Asset revision facts and entry-local diagnostics.
- Domain owners retain immutable user-managed versions such as `CharacterVersion` and managed Asset revisions while removing file schema, component, transport, migration, and unnecessary concurrency versions.
- Canvas, Cut, Preview, Entity, Generation, Chara, Search, Content, Media, Quality, and Local Metadata owning packages remove their internal version fields and product-reachable migration implementations without moving business behavior into `apps/neko-desktop`.
- `apps/neko-desktop` removes versioned bridge payloads, versioned local filenames, startup migration wiring, and release-version projection into internal contracts; it retains only externally required Electron/build metadata and third-party adapter values.
- Existing stored data is never silently deleted or rewritten. Canonical readers accept the stable current shape, reject only the invalid record or instance, and leave explicit user-directed offline repair outside product imports, build, startup, and CI paths.
