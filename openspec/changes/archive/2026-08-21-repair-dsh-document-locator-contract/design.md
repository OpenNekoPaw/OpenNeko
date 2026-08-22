# Design

`@neko/content` remains the owner of the `openneko.document` contract and `ContentLocator` schema. The DSH plugin publishes a flat model-visible schema:

```json
{
  "operation": "read",
  "source": {
    "file": {
      "authority": "workspace",
      "path": "neko/assets/Blame/book.epub"
    }
  },
  "mode": "manifest",
  "includeManifest": true
}
```

`source`, `mode`, `cursor`, and bounds are top-level Tool arguments. There is no model-visible
`input`, `locator`, or `range` object. A whole-document read omits `source.selector`; a targeted read
uses one canonical `ContentLocator.selector` and may state `mode: "content"`; the selector chooses
the content address while mode chooses the public read result, so they are not competing location
fields. `mode: "manifest"` remains invalid for a selected source because a manifest describes the
container. `@neko/content` strictly decodes this object into the
operation-qualified `DocumentDshToolInput`; the official DSH plugin then projects its `operation`
and `input` into the ACP domain Tool request. The ACP envelope remains nested because it is a typed
transport boundary shared by first-party domain Tools, not a second model contract.

The path is still a workspace-relative path. A managed `neko/assets/<library>` symlink is authorized by the existing workspace path guard, so the document runtime and decoder do not need a media-library branch. The canonical chain remains:

```text
flat DSH schema -> document argument decoder -> ACP { operation, input }
  -> ACP Host adapter -> exact Workspace grant
  -> ContentReadService workspace-file authorization -> document decoder
```

The schema publishes only the current operation-specific fields. `ContentLocator.selector` owns all
stable document selection shapes. The Content runtime strips the selector only when resolving the
authorized container file, then converts that selector once into a `DocumentReadCoordinate` owned by
the Content reader. `DocumentReadCoordinate` is transient execution state rather than an address: it
is not accepted from DSH, persisted, projected to Canvas, or exported as a cross-application
contract. The former `DocumentLocator` type, parser, and aliases are deleted rather than retained as
compatibility exports. A model-visible `range`, bare `locator`, or `DocumentLocator` fails at the
Content decoder and never reaches a document reader.

Manifest and read-result projection performs the inverse conversion while Content still owns both
the exact source and decoder result. EPUB and CBZ units project to an `entry` selector, PDF pages to
a `page` selector, and DOCX units to one unambiguous `text-range` coordinate family. Each unit is
returned with a complete `ContentLocator`; Agent, Canvas, and Webview code do not merge a container
locator with a second locator object. Reader-private chapter, region, slide, and container-specific
page metadata do not cross the Content boundary.

Search, Entity, Preview, and Agent consumers receive a complete `ContentLocator` whenever they need
to preserve, transfer, navigate to, or deduplicate an address. Code that only participates in the
same in-process reader operation may carry `DocumentReadCoordinate`; it must use coordinate naming
and cannot materialize a second persisted identity. This preserves one public address while allowing
format-specific decoders to use the transient coordinates required by EPUB, PDF, DOCX, and CBZ.

The ACP Host adapter is also the owning boundary between a content result and DSH Tool execution semantics. Only `status: "ready"` becomes `outcome: "success"`. Any non-ready content result becomes `outcome: "failure"` using the result's first error diagnostic. The official DSH plugin already converts Host failure into a failed Tool result, so the existing Webview receives the correct red failure state without a parallel UI implementation.

An incorrect workspace-relative path remains an exact, local failure. The adapter does not search sibling filenames, repair names, or switch readers. A corrected request must use the authoritative locator already present in the selected resource context.

## Ownership and runtime evidence

- **Owning responsibility:** `@neko/content` owns the sole public `ContentLocator` addressing
  contract, its selector schema, DSH decoder, and conversion to private reader coordinates.
  `@neko/agent-runtime` owns the host-neutral ACP mapping from content result to Tool outcome. DSH
  owns Tool execution lifecycle; the Webview only renders its projection.
- **Package role:** Content is the L0/domain contract and parsing owner. Agent Runtime is the host-neutral application/runtime adapter. The official Content DSH plugin is the external runtime registration adapter.
- **Canonical path:** `openneko.document source: ContentLocator` -> strict Content decoder -> ACP
  Host adapter -> authorized Content runtime -> transient `DocumentReadCoordinate` -> exact ContentLocator
  result -> ACP success/failure -> official DSH Tool -> existing transcript and terminal Canvas
  projection. There is no alternate locator protocol, fuzzy repair, or UI-owned merging.
- **Producer / consumer:** Content produces the canonical input contract and runtime result. The Content DSH plugin publishes the schema; Agent Runtime consumes and delegates it; DSH and the existing Webview consume the resulting Tool lifecycle projection through declared public package dependencies.
- **Runtime boundary:** All changed production logic is host-neutral TypeScript. Workspace path authorization and file/container IO remain with the existing Host/Content runtime, and no Electron, raw path, cache, or Webview resource authority moves into these adapters.
- **Verification:** Content contract and runtime tests cover EPUB, PDF, DOCX, and CBZ selectors and
  accept selected content reads with explicit `mode: "content"` while rejecting selected manifest
  reads and bare/parallel locators; Agent Runtime tests prove exact ContentLocator preservation and
  malformed input never reaches content access; plugin tests prove Host failures reject Tool
  execution; terminal artifact tests prove Canvas receives each exact locator once and deduplicates
  only identical complete locators; Desktop typecheck/build and repository boundary gates cover
  composition.
- **Replaced path:** The exported `DocumentLocator` union, `parseDocumentLocator`, cross-package
  `locator: DocumentLocator` fields, and compatibility aliases are deleted. A repository scan and
  poison tests prove the retired name cannot re-enter production code.
- **User data:** The change reads no new storage and mutates no Project, Workspace, SQLite, Session, transcript, or artifact data. Existing durable records require no migration; only future Tool result projection changes from false success to explicit failure.

The flat DSH argument object replaces the nested model-visible wrapper atomically. Tests poison both `{ operation, input: { source } }` and the observed `{ operation, source, input: { ... } }` hybrid so neither can return success. This is a prelaunch Tool contract correction and does not migrate durable user data.
