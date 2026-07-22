## 1. Contracts And Legacy Audit

- [x] 1.1 Audit media-library settings/source refs, PathResolver/WorkspaceMediaPathContext, workspace guards, Assets/Search/Agent roots, NK codecs, and package/export; record retained owners and retired mapping paths.
- [x] 1.2 Define portable library-name, workspace-linked source, safe diagnostic, link helper, and legacy rejection contracts without changing ContentAccess or ResourceCache APIs.
- [x] 1.3 Add poison fixtures proving normal runtime cannot succeed through media-library variable settings, libraryId lookup, absolute source, or unmanaged symlink fallback.

## 2. Link Helper And Guard

- [x] 2.1 Implement create/replace/remove using Unix directory symlink and Windows junction semantics, atomic replacement, portable name validation, and target-preserving deletion.
- [x] 2.2 Implement exact Git-ignore integration and tests proving the link/target is absent from index/package while `library.json` and unrelated Asset content remain visible.
- [x] 2.3 Derive linked-library list and availability from `readdir/lstat/stat`, with broken-link/relink diagnostics and no persisted registry/accessible state.
- [x] 2.4 Extend the existing workspace guard for direct `neko/assets/<libraryName>` links and final realpath containment; test unmanaged links, nested escape, loops, permissions, workspace move, and target privacy.

## 3. Remove Mapping Services

- [x] 3.1 Remove runtime media-library variable/original-path/local-override writers/readers and libraryId/root-map lookup; reject retired shapes without a compatibility resolver.
- [x] 3.2 Migrate Assets, Search, Agent tree/file tools, Canvas, Cut, Preview, and Tools source projections to exact `neko/assets/<libraryName>/...` workspace paths.
- [x] 3.3 Add path-level tests proving existing ContentAccess/Engine/Preview consumers use ordinary workspace resolution and OS link following with no media-library resolver branch.
- [x] 3.4 Resolve managed Asset and recent-history tree resources plus thumbnail inputs through the existing AssetLibrary path boundary; prove linked workspace paths never become root-absolute `/neko/assets/...` URIs.
- [x] 3.5 Invalidate an incompatible persisted media-library search partition as derived data, rebuild canonical `neko/assets/...` entries, and keep save-time validation strict.
- [x] 3.6 Decouple media-library, managed Asset, and recent Asset TreeItem open/preview URIs from VS Code Git decoration `resourceUri`; prove Git is never asked to inspect symlink-descendant pathspecs from these trees.
- [x] 3.7 Resolve the VS Code built-in Git decoration incompatibility for ordinary Explorer/open-editor `file:` URIs without leaking physical targets or silently adding a second content path.
- [x] 3.8 Rebuild the persisted media-library search partition after every link mutation and prove the next search cannot reload the pre-mutation projection.
- [x] 3.9 Make relink directory-identity semantics explicit and map active linked document source loss to a safe Preview response instead of repeated unclassified 500 errors.

## 4. Project Sources And Legacy Rejection

- [x] 4.1 Update NKC/NKV and Asset source validators/writers to accept linked workspace paths and reject new media-library `${VAR}`, absolute, URI, runtime, or cache paths.
- [x] 4.2 Reject legacy settings and source shapes before mutation with relink/re-import diagnostics and original-byte preservation.
- [x] 4.3 Update Engine registration, relink, package/export, and source verification to consume linked paths and copy target bytes without serializing link object/target.
- [x] 4.4 Add save/reopen/workspace-move/relink/package and legacy rejection tests that poison every normal-runtime compatibility path.

## 5. Documentation And Verification

- [x] 5.1 Synchronize architecture/package/domain/user documentation with OS-owned links and ordinary workspace paths.
- [x] 5.2 Run focused path/settings/Assets/Search/Agent/NK/package tests plus affected builds; record commands and results.
- [x] 5.3 Run `pnpm build`, `pnpm test`, `pnpm check`, legacy/unused gates, and isolated Extension Development Host link/Agent/package scenarios with path non-disclosure assertions.
- [x] 5.4 Run focused stale-index and media-tree regressions, affected builds, and the existing Extension Development Host Agent/tree scenarios; record Git-error and legacy-warning deltas.

## 6. Remove Unreachable Migration Surface

- [x] 6.1 Delete the implementation-only Asset/media inspector, classifier, archive, execution, workspace migration contract, tests, and package exports; retain only the canonical runtime rejection path.
- [x] 6.2 Prove no production/public import remains and run focused package tests plus legacy-debt and unused-code gates.
