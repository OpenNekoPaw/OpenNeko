## 1. Contract And Path Tests

- [x] 1.1 Add focused shared-contract tests that define the locator/domain/materialization
  replacement matrix and reject legacy resource-reference fields or shapes.
- [x] 1.2 Add document contract tests proving native entries and derived representations no longer
  expose `DocumentArchiveResourceRef` or parallel content identities.
- [x] 1.3 Add Agent and Canvas path tests that prove locator identity is retained and legacy
  fallback/materialization persistence cannot return success.

## 2. Shared And Document Migration

- [x] 2.1 Migrate `@neko/types` public content-access, document-reading, perception, media-quality,
  Canvas, composite-artifact, and 3D contracts from ResourceRef fields to the owning locator or
  domain identity.
- [x] 2.2 Migrate `@neko/content` document readers, image projection, and Tool schemas to
  ContentLocator/ContentRepresentationLocator with strict legacy rejection.
- [x] 2.3 Replace public resource-cache entry identity with a cache-owned internal descriptor,
  invalidate the legacy prelaunch schema visibly, and preserve source/committed files.

## 3. Agent Vertical Path

- [x] 3.1 Migrate Agent runtime/types message attachments, perception, content access, external
  processor, Tool result, Timeline/artifact, and plugin-transfer contracts to locator identity.
- [x] 3.2 Remove ResourceRef instructions and schemas from builtin prompts and Agent-facing
  capability descriptions; keep Host materialization and file grants explicit.
- [x] 3.3 Update Agent Webview/Desktop projection consumers and the owning evaluation suite/cases
  with canonical-path and forbidden-fallback evidence.

## 4. Canvas And Remaining Consumers

- [x] 4.1 Migrate Canvas preview/playback/render registries and message payloads to locator or
  representation identity with Host projection at the final boundary.
- [x] 4.2 Migrate quality, creative/media, processor, composite artifact, 3D reference, and other
  remaining public consumers identified by the production search.
- [x] 4.3 Delete `ResourceRef`, `DocumentArchiveResourceRef`, public `ResourceVariantRef`,
  durable-resource helpers, constructors, guards, exports, and obsolete fixtures.

## 5. Documentation And Verification

- [x] 5.1 Update the HTTP resource-gateway OpenSpec and stable architecture/domain documentation
  so durable public identity names only ContentLocator and runtime projections remain Host-local.
- [x] 5.2 Run focused producer/consumer tests, package typechecks/builds, Agent evaluation key-free
  validation and the real focused case or record its exact infrastructure blocker.
- [x] 5.3 Run `pnpm build`, `pnpm test`, `pnpm check`, quality/legacy/unused gates, production and
  repository residue searches, and `git diff --check`.
- [x] 5.4 Perform the Neko quality review, resolve actionable findings, and record remaining
  validation or migration risk.
