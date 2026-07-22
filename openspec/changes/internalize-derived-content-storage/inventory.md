# ResourceCache Ownership Inventory

Date: 2026-07-21

This inventory maps every product-visible ResourceCache use to its target responsibility. Generated output directories, formal project files, accepted candidates, packages, and exports are durable owners and are not derived representations.

## Ownership Map

| Current owner     | Current files and behavior                                                                                                                                                             | Classification                                                                   | Target owner                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Agent Extension   | `agentContentAccessRuntime.ts` constructs generated/document cache providers; `resourceCacheStartupGcService.ts` runs cache migration/GC                                               | representation + Host maintenance                                                | Shared Host representation composition and maintenance                                                                        |
| Agent Platform    | `generated-asset-index.ts` stores durable generated-output identity while also receiving a cache manifest; `generated-asset-resource-resolver.ts` exposes derivative provider types    | durable ownership mixed with representation storage                              | Generated owner keeps source identity; Host adapter owns derived provider                                                     |
| Agent processor   | `processorResourcePort.ts`, `externalProcessorHostAdapter.ts`, and external-processor contracts expose cache service/root and lifecycle                                                | intermediate/debug/candidate ownership                                           | Storage-neutral processor allocation/promotion port                                                                           |
| Canvas Extension  | `canvasEditorProvider.ts` constructs thumbnail, preview, generated derivative, and document cache providers and holds ResourceCacheService                                             | thumbnail/preview/fov representation plus incorrect native-entry materialization | Host-injected ContentRepresentationService; native entry direct read                                                          |
| Canvas activation | `extension.ts` opens workspace cache binding and passes manifest/root metadata to editor                                                                                               | Host maintenance leaked into product                                             | Application/Host content composition                                                                                          |
| TUI Host          | `node-content-access-runtime.ts` creates ResourceCache and DocumentResourceCacheProvider; `node-resource-cache-startup-gc.ts` and `tui-local-metadata-binding.ts` expose manifest/root | Host composition plus incorrect product-facing API                               | TUI application composition may construct the shared Host implementation, but product/session ports cannot expose cache types |
| TUI session       | `useAgentSession.ts`, `direct-media-runtime.ts`, and `tui-default-capabilities.ts` receive manifest/cache state                                                                        | product/session cache dependency                                                 | Inject content/representation/maintenance capabilities only                                                                   |
| Documents         | `DocumentEntryContentAccessProvider` already reads native entries directly; Agent/Canvas/TUI additionally register `DocumentResourceCacheProvider`                                     | source read duplicated as derived materialization                                | Direct ContentAccess entry read; remove product DocumentResourceCacheProvider registration                                    |
| Assets            | `extension.ts` requests thumbnail variants through ContentAccess but does not construct ResourceCache directly                                                                         | semantic thumbnail request encoded in old matrix                                 | ContentRepresentationService thumbnail request                                                                                |
| Cut               | ContentAccess/Ingest consumers use local-path and prewarm/variant semantics but do not directly construct ResourceCache                                                                | source/projection and representation semantics mixed                             | ContentRead/Projection plus ContentRepresentationService                                                                      |
| Preview           | Document/runtime projection does not directly construct cache in production                                                                                                            | source/runtime projection                                                        | Keep direct ContentAccess; raster/thumbnail enters representation port when required                                          |
| Tools             | No direct production ResourceCache composition found                                                                                                                                   | diagnostics/consumer                                                             | Keep cache-neutral; dependency gate protects boundary                                                                         |
| Shared Host       | `resource-cache-service.ts`, providers, manifest store, LocalMetadata schema/migration and GC                                                                                          | legitimate storage/lifecycle owner                                               | Retain behind shared Host representation implementation                                                                       |

## Semantic Representation Mapping

| Existing role/use                         | Target representation spec                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `thumbnail`, width/height/format          | `thumbnail`                                                                                                  |
| Canvas preview variant                    | `preview`                                                                                                    |
| Cut proxy                                 | `proxy`                                                                                                      |
| Cut waveform                              | `waveform`                                                                                                   |
| Cut loudness                              | `loudness`                                                                                                   |
| PDF/Office computed page image            | `raster-page`                                                                                                |
| Canvas staged field-of-view crop          | `fov-crop`                                                                                                   |
| OCR/ASR/embedding/vision sidecar          | `semantic-sidecar`                                                                                           |
| Processor rebuildable output              | storage-neutral `intermediate` or `debug` ownership                                                          |
| Processor accepted creator-visible output | `candidate`, followed by explicit durable adoption; never represented as cache promotion in product protocol |

`source`, `original`, and `document-entry` are not representation specs. They remain direct ContentAccess reads.

## Production Dependency Boundary

The following product roots currently contain prohibited cache ownership and require migration:

- `packages/neko-agent/packages/extension/src/services/agentContentAccessRuntime.ts`
- `packages/neko-agent/packages/extension/src/services/resourceCacheStartupGcService.ts`
- `packages/neko-agent/packages/extension/src/services/processorResourcePort.ts`
- `packages/neko-agent/packages/extension/src/services/externalProcessorHostAdapter.ts`
- `packages/neko-agent/packages/agent-types/src/external-processor.ts`
- `packages/neko-agent/packages/agent/src/runtime/capability/external-processor-runtime.ts`
- `packages/neko-agent/packages/platform/src/media/generated-asset-index.ts`
- `packages/neko-agent/packages/platform/src/media/generated-asset-resource-resolver.ts`
- `packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts`
- `packages/neko-canvas/packages/extension/src/extension.ts`
- `apps/neko-tui/src/tui/host/node-content-access-runtime.ts`
- `apps/neko-tui/src/tui/host/node-resource-cache-startup-gc.ts`
- `apps/neko-tui/src/tui/host/tui-local-metadata-binding.ts`
- `apps/neko-tui/src/tui/host/tui-default-capabilities.ts`
- `apps/neko-tui/src/tui/hooks/useAgentSession.ts`
- `apps/neko-tui/src/tui/core/direct-media-runtime.ts`

Host implementation and maintenance allowlists are limited to shared content adapters, application composition roots, LocalMetadata migration/maintenance, and focused tests. A product package cannot regain access merely by renaming a local wrapper.

## Required Poison Checks

- product production imports of ResourceCache service/provider/manifest/root/GC/lifecycle/materialization/missing-cache types;
- `DocumentResourceCacheProvider` construction outside shared Host implementation and migration tests;
- public or processor payload keys containing `resourceCache`, cache root/path/provider/status, or cache lifecycle controls;
- source/original/document-entry requests that invoke derived storage;
- representation results containing cache path, provider, manifest, GC, retention, or materialization status;
- derived GC targeting formal Assets, project files, generated source, accepted candidates, packages, or exports.
