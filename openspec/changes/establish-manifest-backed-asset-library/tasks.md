## 1. Contracts and package ownership

- [ ] 1.1 Replace flat global Asset item identity with strict manifest, immutable revision, digest, member, dependency, lifecycle, and diagnostic contracts exported by `@neko/assets-domain`; narrow `remote`/`registry` source fields to portable non-secret provenance.
- [ ] 1.2 Add `AssetRemoteRepositoryPort`, instance-scoped sync operation/events, expected-head publication, tombstone, and transfer-plan contracts without provider SDK or credential types.
- [ ] 1.3 Add contract/codec tests for valid packages, unknown fields, absolute/cache/provider paths, revision-digest collisions, dependency cycles, stale request events, and forbidden ordinary-file promotion.
- [ ] 1.4 Decide and document the first remote provider, authentication flow, package limits, retention policy, and public/private discovery scope before implementing its adapter.

## 2. Local package runtime

- [ ] 2.1 Implement managed package layout, content-addressed staging/blob storage, manifest loading, exact revision lookup, and explicit local account/repository binding in `@neko/assets-node`.
- [ ] 2.2 Implement dependency-closure planning, size/policy checks, digest verification, atomic install, cancellation, and cleanup of unreferenced staging content.
- [ ] 2.3 Implement explicit local import, update-head, uninstall, and garbage-collection services with project/dependency pin diagnostics.
- [ ] 2.4 Add producer tests proving interrupted/corrupt installs expose no partial revision and removal preserves pinned or shared bytes.
- [x] 2.5 Add the canonical persistent Asset membership repository and record-only removal; require explicit import for flat files, preserve their bytes and remove the `shell.trashItem` removal path.

## 3. Cloud publication and replication

- [ ] 3.1 Implement the selected remote repository adapter and OS credential reference adapter behind package-owned public ports.
- [ ] 3.2 Implement pull/reconcile with exact dependency transfer, resumable digest checkpoints, atomic closure install, tombstones, and rebuildable remote projections.
- [ ] 3.3 Implement publish with local snapshot validation, missing-blob upload, expected-head compare-and-set, conflict diagnostics, and no discoverable partial revision.
- [ ] 3.4 Add key-free remote contract tests plus producer tests for offline use, auth failure, interruption/resume, integrity conflict, concurrent publication, dependency failure, and non-destructive remote deletion.
- [ ] 3.5 Add a credential-backed focused evaluation for the real provider and record external blocking conditions when credentials or service access are unavailable.

## 4. Metadata and Resource Browser

- [ ] 4.1 Add rebuildable Asset manifest/search, remote-head, reconciliation-cursor, and transfer-checkpoint storage through the local-metadata public port with no credentials or installed-byte authority.
- [ ] 4.2 Replace the flat Asset surface with a distinct Asset Library source showing package identity, revision, dependency, local/remote, transfer, conflict, tombstone, and account states.
- [ ] 4.3 Add typed import, install, update, publish, sync, cancel, inspect, and uninstall intents while keeping ordinary files on Media Library/content ports.
- [ ] 4.4 Add Webview consumer tests proving cross-source search preserves owner identity and no file discovery creates Asset membership.
- [x] 4.5 Rename the ordinary delete affordance/confirmation to record removal and add restart/source-preservation UI coverage.

## 5. Desktop composition and retired paths

- [ ] 5.1 Wire Asset domain/node/webview, local metadata, OS credentials, and typed sender-bound IPC in `apps/neko-desktop` without retaining Asset business rules in the application root.
- [ ] 5.2 Keep current flat managed Assets, retired catalog facts and non-canonical remote/registry values outside product discovery; expose no automatic inventory/import path.
- [ ] 5.3 Import only explicitly selected reusable packages, leave ordinary/unselected files with their existing owners, and atomically publish projections after validation.
- [ ] 5.4 Delete path-derived Asset IDs, flat runtime handlers, legacy AssetEntity/catalog resolvers, dual reads, and fallback success; add producer, consumer/delegation, and retired-path absence tests.

## 6. Verification and documentation

- [ ] 6.1 Update Asset, Media Library, Resource Browser, local storage, cloud credential, and package-boundary documentation in Chinese and English where semantics changed.
- [ ] 6.2 Run affected package tests/typechecks plus `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, and `pnpm check:unused`; record command results and canonical-path evidence.
- [ ] 6.3 Run a real Electron Asset Library scenario covering import, offline open, sync progress/cancel, publish conflict, update, tombstone, and uninstall blockers using isolated fixtures.
- [x] 6.5 Run an isolated Electron record-removal scenario proving the item stays absent after restart while the source file is unchanged and no trash call occurs.
- [ ] 6.4 Complete `pnpm ci:local`, record provider/evaluation gaps and residual storage, performance, credential and untouched-data risks, and verify no retired path returned success.
