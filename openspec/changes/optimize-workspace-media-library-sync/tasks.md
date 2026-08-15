> Superseded scope (2026-08-13): completed tasks record the existing `neko/assets` implementation.
> Replacing that path with project `.neko` target-free bindings and owner-qualified Media Library locators
> is tracked only by `separate-project-facts-local-state-and-media-bindings`; do not extend the old path.

## 1. Contracts And Storage Ownership

- [x] 1.1 Define host-neutral requirement, owner/source-fingerprint, link-state, recovery-plan, portability, and
      diagnostic contracts in `packages/shared` without Node paths, runtime URLs, global IDs, or
      target-bearing fields.
- [x] 1.2 Add contract tests that reject unknown states, stale source/request identities, absolute paths, symlink
      targets, active-workspace fallback, `library.json`, and alternate resolver payloads.
- [x] 1.3 Bind requirement freshness/diagnostics and referenced-media probe cache to stable projection
      and `media_metadata` repositories under stable workspace partitions, with no
      persisted link availability, new Media Library table, or workspace database.
- [x] 1.4 Define canonical portable-snapshot task/checkpoint payloads on the existing `tasks` and
      `task_checkpoints` repositories, excluding media bytes, full documents, credentials, absolute
      paths, and link targets.
- [x] 1.5 Add local-metadata tests proving stale cache rebuild, state/cache transaction separation,
      explicit SQLite failure, and the absence of JSON fallback or target-mapping rows.

## 2. Authoritative Reference Projection

- [x] 2.1 Implement minimal fingerprinted reference readers for Canvas, Cut, Entity representation
      bindings, and every project-document kind required for initial complete coverage.
- [x] 2.2 Compose the fixed owner readers in Desktop Main and aggregate canonical
      `neko/assets/<libraryName>/<descendant>` locators by library and owner/source fingerprint.
- [x] 2.3 Add aggregation tests for deduplication, unreferenced links, unsupported owner coverage,
      malformed locators, and deterministic rebuild after clone with no cached metadata.
- [x] 2.4 Persist only freshness/diagnostic and referenced-media probe projections and prove every
      recovery plan re-reads current project facts and OS link state rather than trusting cached
      requirement membership or availability.
- [x] 2.5 Require canonical NKC Media/File nodes to use workspace-file locators, keep path-only and
      non-portable records unchanged but invalid at their document boundary, and prevent Canvas
      authoring from persisting new path-only media nodes.

## 3. Link Inspection And Recovery

- [x] 3.1 Extend workspace link inspection to classify available, required-unlinked,
      global-connection-missing, target-unavailable, content-incomplete, entry-conflict, and
      unreferenced-linked states with target-free diagnostics.
- [x] 3.2 Implement immutable exact-name recovery planning against project identity, owner revisions,
      link/source fingerprint, global alias identity, bounded descendant validation, and existing realpath
      containment guards.
- [x] 3.3 Implement explicit confirm/apply with stale-plan rejection, atomic workspace link mutation,
      cancellation semantics, and rollback limited to a newly created global connection.
- [x] 3.4 Route new Desktop add/relink operations through the machine-global alias while keeping
      existing direct physical links readable until explicit normalization.
- [x] 3.5 Add regression tests proving fuzzy lookup, basename guessing, target history, unmanaged entry
      replacement, direct retired commands, JSON manifests, and target-record fallback cannot return success.

## 4. Portability And Snapshot Execution

- [x] 4.1 Implement coverage-aware `linked-ready`, `sync-requires-relink`, and
      `portable-snapshot-ready` computation without claiming that normal sync includes linked bytes.
- [x] 4.2 Build an immutable collection plan from authoritative references with destination conflict,
      capacity, containment, byte-length, fingerprint, and shared-reference deduplication checks.
- [x] 4.3 Implement sibling staging that copies the project tree without managed links, cache, scratch,
      or local metadata and collects only referenced linked bytes into deterministic project-owned paths.
- [x] 4.4 Implement owner-specific staged document rewrites and validate all rewritten locators before
      publishing the independent destination with one atomic rename.
- [x] 4.5 Integrate cancellation and cross-restart lifecycle with the existing task ledger, ensuring a
      failed checkpoint is never reported as resumable and no job JSON fallback is written.
- [x] 4.6 Add failure-path tests for stale owners, missing bytes, fingerprint conflicts, nested
      symlink escape, checkpoint failure, cancellation, publish conflict, staging cleanup, and source
      project/external library immutability.

## 5. Desktop And Assets Surfaces

- [x] 5.1 Extend typed Desktop IPC and preload ports for target-free requirement projection,
      revisioned recovery intents, portability planning, progress, cancellation, and diagnostics.
- [x] 5.2 Project required-but-unlinked and degraded libraries into the Assets-owned project Media
      facet without reading or mutating global Asset center selection, filters, or layout state.
- [x] 5.3 Preserve item identity, selection, diagnostics, status icons, thumbnails, and capabilities
      across list and grid layouts, with double-click directory navigation and no redundant open button.
- [x] 5.4 Add explicit recover, relink, remove-link, and portability actions with confirmation,
      progress, cancellation, empty, stale, and failure states.
- [x] 5.5 Add renderer/preload tests proving global Asset center and project Resource Browser remain
      independent and that Renderer receives no Node path, `file:` URL, registry root, or credential.
- [x] 5.6 Keep Media Library browsing available when one project-document owner is invalid by
      projecting incomplete coverage with a bounded owner diagnostic, and align the global Library
      header/toolbars with the shared Home management composition.
- [x] 5.7 Remove the persistent portability icon from the primary sidebar, expose the exact Project
      portability command through the Project context menu, and retain library-level status and
      recovery presentation in the Media facet.

## 6. Canonical And Retired Paths

- [x] 6.1 Keep canonical workspace identity, project JSON/NKC/OTIO facts, JSONL journals/logs, managed
      media bytes, and SecretStorage/keychain data with their existing owners; document why Media
      Library does not read or rewrite those authorities.
- [x] 6.2 Verify no project link, target content, or project fact is mutated during open or metadata
      rebuild and no whole-library copy occurs during add/relink.
- [x] 6.3 Remove or fail-close temporary dual routes so new recovery succeeds only through
      plan/confirm/apply and package/export continues to dereference only authoritative references.
- [x] 6.4 Record Desktop Shell and application settings as separate canonical authorities that Media
      Library does not read, import, rewrite or repair; exclude secrets and workspace identity.

## 7. Verification And Documentation

- [x] 7.1 Add producer/consumer, project codec, local-metadata, Desktop Main, preload, renderer, and
      Assets package tests with canonical-path and retired-path absence assertions.
- [x] 7.2 Run affected package typechecks/builds and focused tests, then run `pnpm build`, `pnpm test`,
      `pnpm check`, `pnpm check:legacy-debt`, and `pnpm check:unused`.
- [x] 7.3 Run isolated real Electron Desktop scenarios for clone-without-links, exact-name recovery,
      partial content, direct-link normalization, list/grid state, global/project surface independence,
      cancellation, restart recovery, and atomic portable snapshot publication.
- [ ] 7.4 Validate Unix symlinks and Windows directory junction behavior, record UNC/NAS coverage or
      its release blocker, and verify link exclusions and folder/Git sync behavior.
      macOS acceptance verified the two-level Unix symlink topology, exact
      `/neko/assets/Footage` Git exclusion, and a Git clone that retained the authoritative locator
      while omitting the link and target bytes. Windows directory junction and real UNC/NAS behavior
      remain a release blocker until a Windows host and network target are available.
- [x] 7.5 Update Media Library, local metadata, Desktop, sync/package, and user-facing documentation
      with the final storage classification, recovery topology, portability semantics, diagnostics, and
      residual risks.
- [x] 7.6 Add regression coverage for the reported legacy NKC search failure and run real Electron
      visual acceptance for the aligned global Media/Asset Library surface.
- [x] 7.7 Reset stale retained Media facet containers against fresh root projections, add remount/facet-switch regression coverage, and prove an isolated Electron project still displays linked libraries.
  - Assets Webview regression tests distinguish an explicit empty child container from a stale retained container. The packaged Electron report at `reports/desktop-functional/replace-desktop-media-scheme-with-http-resource-gateway/2026-08-05T09-54-49.980Z-resource-browser-entity-management-packaged/report.json` proves a facet switch returns to the linked `Assets` library root instead of retaining the stale `portrait.png` child view.
