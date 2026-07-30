## 1. Freeze The Cleanup Boundary

- [x] 1.1 Inventory every Tools media diff command, manifest contribution, message, analyzer, runtime call, Webview renderer, setting, locale/style, test and Git comparison path.
- [x] 1.2 Inventory every `.nkv`/JVI/LSP/workspace index/Timeline Diff path and every production consumer of shared Timeline/NKV/Diff/generated `Engine*` types.
- [x] 1.3 Classify each `@neko/shared` consumer as OTIO-owned, NKC-owned, Agent context, retained generic primitive or delete; do not include unrelated shared residuals.
- [x] 1.4 Record current user-file safety boundary and verify fixtures only; do not open or mutate real user NKV/NKC/OTIO/media files.

## 2. Establish The Tools Contract

- [x] 2.1 Create zero-dependency `@neko-tools/contracts` with versioned media resource, request, result, diagnostic and message discriminated unions.
- [x] 2.2 Add runtime validators for schema, kind, `sessionId`, `requestId`, finite values, ratio bounds and unknown messages.
- [x] 2.3 Move Extension and Webview to the new contract and delete shared `mediaDiffProtocol`, `EngineDiff*` imports and compatibility aliases.
- [x] 2.4 Add contract tests covering every variant, invalid version/value and stale identity.

## 3. Simplify And Correct Media Comparison

- [x] 3.1 Replace the fixed analyzer registry/factory chain with one Tools-owned `MediaDiffService` and direct image/audio/video dispatch.
- [x] 3.2 Keep FFmpeg/probe/frame/waveform/process primitives in `@neko/media`; remove Tools result/UI concepts from the media port.
- [x] 3.3 Normalize all pixel/metric ratios to `0..1` and add regression tests that fail against the current double-conversion behavior.
- [x] 3.4 Delete empty/static heatmap, fixed histogram and other placeholder result fields; separate computed result from Webview display modes.
- [x] 3.5 Implement real `showMediaInfo` through probe with explicit unsupported/failure diagnostics; delete `diffMode` and `showMetadata` settings if they remain unread.

## 4. Make Lifecycle Fail-Visible

- [x] 4.1 Give each viewer/request an independent session owner, `AbortController`, temporary-resource scope and disposable lifecycle.
- [x] 4.2 Thread one `AbortSignal` through every media operation and FFmpeg child process.
- [x] 4.3 Replace detached timeout races with abort, process termination, awaited exit and ordered temporary cleanup.
- [ ] 4.4 Test user cancel, timeout, viewer dispose, request supersede, concurrent sessions, stale messages and cleanup failure; prove no target process survives.

## 5. Retire Tools Timeline/NKV

- [x] 5.1 Poison then remove `.nkv` language/custom editor contributions, JVI bootstrap/LSP, workspace NKV indexing and obsolete commands.
- [x] 5.2 Delete Timeline Diff analyzer, viewer, message variants, components, styles, locales, fixtures and tests as one vertical slice.
- [x] 5.3 Confirm image/audio/video and Git comparison commands do not route through Timeline, active editor fallback or NKV parsing.
- [x] 5.4 Add manifest/bootstrap regression tests and a legacy-debt gate preventing JVI/Timeline Diff/NKV registration from returning.

## 6. Retire Shared Timeline/NKV Consumers

- [x] 6.1 Migrate remaining Cut consumers from shared `ProjectData`/`TimelineElement` to revisioned owning OTIO `TimelineView` and stable IDs, or delete obsolete projection code.
- [x] 6.2 Delete the orphan Agent Timeline context projection and keep future Cut context behind a new explicit read-only owning contract; do not restore Timeline authoring tools or active editor fallback.
- [x] 6.3 Replace generic default project codec use in Canvas/TUI with explicit NKC-only ownership and test fail-closed `.nkv` rejection.
- [x] 6.4 Delete shared NKV codec/registration, legacy Timeline/Diff types, old operation model and exports once all production consumers are gone.
- [x] 6.5 Preserve `.nkv` files byte-for-byte in rejection tests and verify cleanup never invokes a writer or migration.

## 7. Delete The Pseudo-Proto Layer

- [x] 7.1 Delete `diff.proto`, `timeline.proto`, generated `diff.engine.ts` / `timeline.engine.ts` and generated barrel/check files after consumers migrate.
- [x] 7.2 Delete the custom Proto-to-TypeScript interface generator and `@neko/proto` package when the package has no real wire contract.
- [x] 7.3 Remove `generate:types`, `check:proto-sync`, proto CI jobs and orchestration assertions; do not leave a no-op gate.
- [x] 7.4 Update architecture/package-boundary/README documents to define the admission criteria for any future Proto package.
- [x] 7.5 Extend engine-retirement/legacy-debt checks to reject `EngineDiff*`, generated Timeline DTOs and interface-only Proto resurrection.

## 8. Validate The Canonical Paths

- [x] 8.1 Run Tools contract, Extension, Webview, media adapter and package typechecks/tests with canonical-path assertions.
- [x] 8.2 Run Cut, Agent, Canvas and TUI producer/consumer tests proving OTIO/NKC/explicit-context paths and poisoned NKV/Timeline fallbacks.
- [x] 8.3 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:legacy-debt`, `pnpm check:unused`, `pnpm check:openspec` and affected orchestration tests.
- [ ] 8.4 Run Electron Desktop scenarios with isolated fixtures for image/audio/video compare, Git comparison, cancel/timeout, Media Info, concurrent viewers and disposal.
- [x] 8.5 Record commands, host/version, sanitized evidence, skipped checks and remaining risks; confirm no user project or media bytes changed.
