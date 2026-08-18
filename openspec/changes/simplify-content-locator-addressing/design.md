## Context

The current `ContentLocator` union addresses Workspace files, document entries, generated outputs and package resources while also carrying fingerprints, digests, output ids and manifest metadata. `ContentRepresentationLocator` carries a source locator, representation spec, generator id and fingerprints. Agent content Tools can therefore expose two structurally rich locator families even though the model only needs a file path or an opaque reference returned by the owning content capability.

The overload has a concrete failure path: PDF page rasterization returns representation-only visual evidence; `ReadImage` projects it through a generic attachment; the creator-visible artifact collector interprets that attachment as a durable artifact; Workspace Board delivery requires `ContentLocator` and fails. The problem is not missing conversion logic. A derived representation was allowed to cross a durable artifact boundary without becoming durable content.

## Goals / Non-Goals

**Goals:**

- Make `ContentLocator` answer only which durable file and, optionally, which addressable content inside that file.
- Keep freshness/CAS, Generation provenance and package/domain lifecycle outside address identity.
- Keep derived representations available to Content, Preview and provider visual input without making them durable content.
- Keep Agent schemas minimal through opaque conversation-scoped references.
- Make Board, Canvas, transcript and creator-visible artifact delivery accept one durable locator contract.
- Replace the current locator shapes atomically across producers, consumers, fixtures and tests.

**Non-Goals:**

- Making every document page, thumbnail, crop, proxy or waveform a file.
- Adding automatic promotion/materialization, generic export APIs or cache persistence.
- Moving Generation/package ownership into Content.
- Persisting absolute paths, Preview URLs, data URLs or runtime handles.
- Adding legacy locator readers, dual-write, fallback conversion or internal contract versions.
- Changing UI appearance or entry behavior.

## Decisions

### 1. ContentLocator is file plus optional selector

The canonical contract is conceptually:

```ts
interface ContentLocator {
  readonly file: ContentFileLocator;
  readonly selector?: ContentSelector;
}
```

`ContentFileLocator` identifies one durable readable file under an explicit authority:

- Workspace file: normalized Workspace-relative path;
- package file: exact package authority plus package-relative resource path.

A generated output committed into the Workspace uses the Workspace file locator. Its `outputId`, digest, Job and immutable generation evidence remain in Generation records/provenance beside the content address. Package identity/revision remains only to select the exact package authority; manifest paths and optional digests are not part of the content address.

`ContentSelector` identifies stable content inside the file, such as archive entry, page, chapter, slide, text range or region. It does not contain a cache path, derived format, scale, quality profile or generator choice. An absent selector means the complete file.

Alternative rejected: retain separate top-level `document-entry` and `generated-output` locator kinds. They mix addressing depth and producing-domain lifecycle into one dispatch union.

### 2. Freshness is an IO condition, not an address

`ContentFingerprint` remains a real correctness token but moves to `stat/read/write` results and `expectedFingerprint` options. Equality of two `ContentLocator` values compares file authority/path and selector only. Consumers requiring exact bytes must carry the expected fingerprint explicitly in their command, receipt, provenance or owning domain record.

Alternative rejected: keep optional fingerprints inside locators. The same file then acquires two identities depending on whether a caller happened to observe it, and address equality becomes hidden concurrency policy.

### 3. Representation is an internal runtime handle

`ContentRepresentationLocator` is replaced by an opaque `ContentRepresentationHandle`. The public request remains `source: ContentLocator + spec`; the Content runtime selects a generator, owns source/spec fingerprints and stores the binding. The returned handle contains no source, spec, generator id, cache path or fingerprint and is valid only for the owning runtime lifecycle.

Preview/projector/provider adapters may pass the handle to the injected Content representation reader. They may not serialize it to transcript, Tool result authority, delivery metadata, `.nkc` or domain facts. After restart or release, a consumer requests a new representation from the durable source and semantic spec; it does not restore a handle.

Alternative rejected: add `content-representation` to `ContentLocator`. It would make transient computed bytes a durable file identity and force every content reader, Board and Canvas consumer to understand generator/cache semantics.

### 4. Agent receives paths or opaque refs, never locator internals

Ordinary core file Tools expose one `path`/`file_path`. Content capabilities issue conversation-scoped `input_ref`, `unit_ref`, `cursor_ref` and `image_ref` values and bind them internally to `ContentLocator`, document selectors/cursors or representation handles. Model-facing schemas and Tool result text do not contain locator kinds, authority fields, selectors, fingerprints, specs, generator ids or Host paths.

The internal capability operation may accept typed locators after reference resolution. It is not itself reused as the provider-facing Tool schema. This removes the current pattern in which a rich internal Tool schema is registered and later hidden by a Pi-only projection layer.

### 5. Durable artifacts accept ContentLocator only

Creator-visible artifacts, Workspace Board projection, Canvas durable nodes and transcript artifact authority require a valid `ContentLocator`. Representation-only perceptual evidence is ignored by durable artifact collection rather than treated as an invalid artifact.

For PDF analysis, the durable source is the original PDF locator and the deliverable is the Markdown analysis. Raster pages remain provider perceptual input. If the user explicitly requests an exported page/image, the owning export operation writes durable bytes and returns a new `ContentLocator`; no implicit promotion occurs merely because a representation was viewed.

### 6. Atomic contract replacement and user-data behavior

Implementation updates the canonical contract, producer/consumer dispatch, Canvas codecs, fixtures and tests in one change and deletes the old shape and representation-locator exports. No runtime legacy parser or compatibility branch is retained.

Before implementation, the owner must inventory released persisted locator records. An old locator-shaped authoritative record is preserved byte-for-byte and surfaced as a local invalid-content diagnostic with an explicit re-association/export repair path; it is not silently rewritten, dropped or allowed to fail the entire Workspace. If released data requires automated preservation beyond local invalid-state handling, that is a separate user-data change and blocks this implementation.

| Owner / role | Canonical public path | Producer | Consumer | Runtime boundary | Replaced path | User-data impact |
| --- | --- | --- | --- | --- | --- | --- |
| `@neko/content` L0 contracts | `ContentLocator`, `ContentFileLocator`, `ContentSelector`, IO constraints | Workspace/package/domain commit owners | Content read/write and domain references | host-neutral package contract | four-kind lifecycle/address union and locator fingerprints | persisted old shapes remain visible-invalid unless separately preserved |
| `@neko/content` representation runtime | representation request + opaque handle | document/media generator | Preview/provider image loaders | Node/Host runtime | rich `ContentRepresentationLocator` crossing package boundaries | none; handles are non-durable |
| `@neko/agent-runtime` content Tool façade | opaque model refs | input/result reference binder | provider Tool calls | Agent session runtime | raw internal locator schemas plus Pi-only hiding | transcript shape changes only; no content loss |
| `@neko/canvas-domain` durable content facts | canonical `ContentLocator` only | Board/material authoring | `.nkc` codec and Canvas projection | domain persistence | representation locator as stable node/artifact identity | invalid old records isolated and preserved |
| Generation/package owners | domain provenance + canonical locator | committed output/package record | Agent/Canvas/Project consumers | owning domain | output/package lifecycle embedded in locator dispatch | domain histories remain authoritative |
| Desktop Main / Preview adapters | injected read/projection ports | exact Workspace/package authority | sender-bound resource registry | Electron trust boundary | parsing locator business semantics or persisting handles | none |

Desktop production code remains limited to Electron sender authorization, exact Workspace/package adapter composition and short-lived resource registration. Address shape, selector semantics, artifact durability and representation lifetime are host-neutral package behavior and therefore cannot remain in `apps/*`.

## Risks / Trade-offs

- [Removing fingerprint from locator can hide stale-byte requirements] → Every exact-byte consumer must declare `expectedFingerprint` explicitly; contract tests poison implicit locator freshness.
- [Package authority still needs identity fields] → Keep only fields required to select the exact package owner; lifecycle/provenance fields remain in package records.
- [Opaque representation handles cannot survive restart] → Handles are intentionally disposable; regenerate from durable source plus spec through the same canonical service.
- [Atomic replacement touches many packages] → Sequence by canonical contract, producer adapters, consumer codecs, Agent façade and deletion tests; do not ship intermediate dual shapes.
- [Existing persisted locators may become invalid] → Preserve the authoritative record locally with diagnostic and repair entry; do not silently coerce or globally fail.

## Migration Plan

1. Inventory every persisted and cross-package locator producer/consumer and confirm released user-data impact.
2. Introduce the new canonical types and atomically update Content IO dispatch, domain producers, Canvas codecs and tests in the same implementation boundary.
3. Replace representation locators with runtime-owned opaque handles and remove representation fields from durable contracts.
4. Replace provider-facing content Tool schemas with opaque reference façades and delete raw locator parameters.
5. Update artifact collection and Board delivery so representation-only evidence never enters durable delivery.
6. Delete old exports, handlers, codecs, fixtures and type guards; add poison tests for old shapes and persisted handles.

Rollback before release is a code rollback. After release, there is no runtime dual-read or compatibility path.

## Open Questions

None. Automated preservation of already released old locator records, if required by the inventory, must be proposed separately before implementation.
