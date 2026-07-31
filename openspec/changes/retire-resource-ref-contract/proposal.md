## Why

`ResourceRef` still appears in public DTOs, Agent Tool contracts, document projections, Canvas
rendering, processor handoff, and cache manifests even though `ContentLocator` is already the
canonical durable cross-package content identity. Keeping both contracts mixes durable identity
with physical paths, provider/cache metadata, and runtime projections, so callers can continue to
persist or reconstruct content through an ambiguous legacy path.

## What Changes

- **BREAKING** Remove `ResourceRef`, `DocumentArchiveResourceRef`, public `ResourceVariantRef`,
  durable-resource validation helpers, constructors, guards, exports, and public fields that carry
  those values.
- Migrate creator-visible and cross-package content payloads to the owning `ContentLocator`
  variant while keeping semantic entity, document position, processor output, and domain IDs as
  separate typed fields.
- Replace cache-manifest dependence on the public resource DTO with cache-internal identity and
  source metadata that cannot escape as durable content identity.
- Make codecs, Tool schemas, prompt contracts, and message/projector boundaries fail visibly when
  legacy `resourceRef` or `documentResourceRef` payloads are received; do not infer a locator from
  paths, URIs, provider values, or active workspace state.
- Keep system paths, authorized read/write paths, Webview URLs, bytes, stream handles, and cache
  keys as operation-scoped Host materializations rather than locator variants.
- Update the HTTP resource-gateway proposal and stable architecture wording so public durable
  identity names only `ContentLocator`.
- Update the owning Agent evaluation coverage to prove the locator-backed Tool/perception/artifact
  path and the absence of the legacy fallback.

## Capabilities

### New Capabilities

- `resource-ref-contract-retirement`: Defines the complete removal of legacy resource-reference
  contracts and the canonical locator, domain identity, cache identity, and Host materialization
  boundaries that replace them.

### Modified Capabilities

None.

## Impact

- Shared contracts and exports in `@neko/types`, especially content access, document reading,
  perception, media quality, Canvas, composite artifact, 3D reference, and resource cache types.
- Agent runtime/types/webview prompt, Tool, attachment, perception, processor, Timeline, and
  projection paths.
- `@neko/content`, Canvas Webview, quality, generation legacy rejection, and other package
  consumers of the old contract.
- Cache manifest schema and tests; prelaunch data containing the removed schema is rejected or
  rebuilt according to its owner rather than dual-read.
- Active HTTP resource-gateway OpenSpec artifacts and architecture documentation.
