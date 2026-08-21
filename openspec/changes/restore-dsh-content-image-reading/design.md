# Design

## Canonical path

```text
openneko.document -> authorized image ContentLocator
  -> openneko.read_image
  -> DSH ACP Host port (bounded chunks)
  -> exact Conversation context + Workspace grant
  -> AgentContentAccessRuntime.loadContentAsset
  -> ContentReadService document-entry handler
  -> DSH AttachmentStore.saveImage
  -> native DSH image ToolResult block
```

There is one successful Content-locator path. Pi adapters remain absent and DSH
native `read_image` remains the separate canonical path for a user-visible
filesystem path.

## Ownership and boundaries

- `@neko/content` owns `openneko.read_image` parameters, strict decoding, chunk
  bounds, locator validation, and the lossless JSON result shape.
- `@neko/agent-runtime` owns the Host adapter that calls
  `AgentContentAccessRuntime.loadContentAsset`; it does not parse archives or
  persist attachments.
- Desktop resolves the exact Conversation Workspace and creates one content
  runtime with `createNodeDocumentLowLevelAccess().readEntry`.
- `@neko/content-dsh-plugin` collects the bounded chunks, verifies ordering and
  total size, gates the exact current model route for image input, and commits
  bytes to the DSH attachment store before returning its durable reference. The
  model-facing Tool is exclusive because one call performs multiple ordered ACP
  Host reads and the Host owns a bounded per-Session admission queue.

ACP remains JSON-only. Each chunk is small enough to remain below the ACP JSON
payload limit after base64 expansion. The first response carries total byte
length, MIME type, and the first chunk; subsequent requests carry an explicit
offset. A changed total, offset mismatch, oversized source, unsupported MIME, or
missing chunk fails the current Tool call visibly.

When one model step requests several document images, the DSH Tool scheduler
runs these Tool calls exclusively in model order. This preserves the Host queue
bound without creating another queue or expanding the global admission budget.

## Document source contract

`openneko.document` accepts only a selector-free Workspace file locator. It
discovers entry locators through manifest/range/image projection. A selector is
valid for Content byte access but not as the root of a document parse, so the
document decoder rejects it instead of silently parsing a different source.

## User data

No source file or project fact is modified. Image bytes are copied only into the
DSH attachment store under its existing durable lifecycle. No archive extraction
path is persisted or exposed.

## Evaluation

Disposition: `create` a focused Content-locator image case because Tool routing,
attachment result handling, and provider modality are affected. Deterministic
tests prove schema, chunking, authorization, archive entry reading, model gate,
and absence of Pi fallback. A visible Desktop real-provider case is required to
claim that the model actually sees EPUB pixels; unavailable credentials or an
image-capable route are recorded as `infrastructure-blocked`.
