## 1. Contracts and package ownership

> Entity Asset and all remote distribution work are outside this change. Every task applies only to
> ordinary reusable packages imported or installed from local sources.

- [ ] 1.1 Replace flat Asset identity with strict manifest, immutable user revision, digest, member,
      dependency, lifecycle and diagnostic contracts exported by `@neko/assets-domain`.
- [ ] 1.2 Reject unknown fields, absolute/cache/runtime/provider paths, revision-digest collisions,
      dependency cycles and ordinary-file promotion in contract/codec tests.
- [ ] 1.3 Remove `identity` Asset and remote/registry/runtime-resolver shapes from the canonical local
      contract; preserve third-party format metadata only where a real local consumer requires it.

## 2. Local package runtime

- [ ] 2.1 Implement managed package layout, isolated staging, manifest loading and exact revision lookup
      in `@neko/assets-node`.
- [ ] 2.2 Implement dependency-closure planning, size checks, member containment, digest verification,
      atomic install, cancellation and staging cleanup.
- [ ] 2.3 Implement explicit local import, update-head, uninstall and garbage collection with exact
      project/dependency pin diagnostics.
- [ ] 2.4 Add tests proving interrupted/corrupt installs expose no partial revision and uninstall preserves
      pinned/shared bytes.
- [x] 2.5 Add canonical persistent membership and record-only removal; preserve source bytes and remove
      the `shell.trashItem` path.

## 3. Metadata and Resources

- [ ] 3.1 Add mutable membership/head and rebuildable local manifest/search projection through the
      local-metadata public port; installed bytes remain authoritative.
- [ ] 3.2 Replace the flat surface with owner-preserving Installed Assets, showing package identity,
      revision, dependency, local availability and blockers.
- [ ] 3.3 Add typed local import, install, update-head, remove-record, inspect, uninstall and garbage-
      collection intents while keeping ordinary files on Content/Media Library ports.
- [ ] 3.4 Add consumer tests proving search preserves owner identity and discovery creates no membership.
- [x] 3.5 Rename ordinary delete to record removal and cover restart/source preservation.
- [x] 3.6 Keep source switching independent and project Character-association failure visible only as a
      Project Elements diagnostic; Installed Assets, Files and Media remain usable.

## 4. Desktop composition and retired paths

- [ ] 4.1 Wire Asset domain/node/webview, local metadata and typed sender-bound IPC without app-owned rules.
- [ ] 4.2 Keep flat managed files, retired catalogs and non-local source shapes outside discovery; expose
      no automatic inventory/import path.
- [ ] 4.3 Import only explicitly selected local packages and commit projections only after validation.
- [ ] 4.4 Delete path-derived Asset IDs, flat runtime handlers, legacy AssetEntity/catalog resolvers,
      dual reads and fallback success; add path-absence and delegation tests.

## 5. Verification and documentation

- [x] 5.1 Update Asset, Media Library, Resources and package-boundary documentation to define local-only scope.
- [ ] 5.2 Run affected tests/typechecks plus repository quality gates and record canonical-path evidence.
- [ ] 5.3 Run a real Electron local Asset scenario covering import, offline open, update, record removal,
      uninstall blockers and source-level failure isolation with isolated fixtures.
- [x] 5.4 Run the isolated Electron record-removal scenario proving restart persistence, unchanged source
      bytes and no trash call.
- [ ] 5.5 Complete `pnpm ci:local` and record residual storage, performance, project-pin coverage and
      untouched-data risks.
