## 1. Contract and user-data inventory

- [x] 1.1 Inventory every `ContentLocator`, fingerprint-bearing locator and `ContentRepresentationLocator` producer, consumer, persisted codec and released user-data location; record whether invalid-state preservation is sufficient or a separate preservation change blocks implementation.
- [x] 1.2 Define canonical `ContentFileLocator`, `ContentSelector` and `ContentLocator` contracts in `@neko/content`, with equality/validation tests that exclude fingerprint, Generation lifecycle and representation fields.
- [x] 1.3 Move expected fingerprints to Content IO options/results and add stale-read/write tests proving the locator identity remains unchanged while exact-byte preconditions fail visibly.

## 2. Canonical producer and consumer replacement

- [x] 2.1 Update Workspace/package/document Content read dispatch and producer tests to use file plus optional selector through one handler chain.
- [x] 2.2 Update Generation, package, Project and entity producers so domain identity/provenance remains owner-held while committed bytes expose one canonical content locator.
- [x] 2.3 Update Canvas/Board codecs and consumers atomically; preserve invalid old authoritative records locally with diagnostic and prove valid sibling nodes/Workspaces remain available.
- [x] 2.4 Delete old generated-output/document-entry top-level locator dispatch, locator fingerprint fields, legacy guards/fixtures and any dual-shape registration; add compile-time/runtime poison tests for the replaced shape.

## 3. Representation and Agent façade

- [x] 3.1 Replace public `ContentRepresentationLocator` with a runtime-owned opaque handle and update Content/Preview/provider loaders plus lifecycle/restart/release tests.
- [x] 3.2 Replace model-facing ReadDocument/ReadImage raw locator schemas with `input_ref`, `unit_ref`, `cursor_ref` and `image_ref` façades; add producer/consumer tests for exact Conversation binding and cross-Conversation rejection.
- [x] 3.3 Remove representation handle/spec/generator/fingerprint/path data from Tool result authority, transcript and durable display contracts; add serialization poison tests.

## 4. Artifact and Board delivery

- [x] 4.1 Update creator-visible artifact collection so representation-only perceptual evidence is omitted from durable candidates while malformed durable artifacts still fail locally.
- [x] 4.2 Prove PDF analysis delivers the original PDF locator plus durable Markdown and never a raster-page identity; prove explicit export returns a new canonical locator before Board/Canvas persistence.
- [x] 4.3 Run focused Agent/Canvas/Content tests proving existing Workspace file, package resource and selected document content remain readable through the one canonical locator path.

## 5. Evaluation and completion

- [x] 5.1 Update `document-image-native-delivery` and Workspace Board Evaluation cases with opaque-ref, visual-byte, durable-artifact and no-representation-persistence assertions.
- [x] 5.2 Run focused tests/typechecks in `packages/content`, `packages/agent/runtime`, `packages/canvas/domain` and Preview, then run `pnpm test:agent:eval`; record exact commands/results and missing observability.
- [x] 5.3 Run `pnpm check:openspec`, `pnpm check:content-access-boundaries`, `pnpm check:agent-boundaries` and `pnpm check:quality`; include deletion/poison evidence and separate unrelated dirty-worktree failures.
- [x] 5.4 With explicit provider/model/cost authorization, run complete-Desktop visible and headless PDF-analysis/Board cases; otherwise record the exact blocker and do not claim provider, visual or Board behavior acceptance.
