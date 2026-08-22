# Proposal: Expose canonical ContentLocator document addressing to DSH

The `openneko.document` Host path already authorizes workspace-linked media libraries, but its DSH parameter metadata originally described `input` as opaque JSON. The contract was made strict, yet the model-visible Tool still combines a top-level `operation` with a nested `input.source`, while the adjacent `openneko.read_image` Tool exposes `source` at the top level. Real DSH Sessions have repeatedly produced a hybrid `{ operation, source, input: { ...options } }` call. The validator correctly rejects it, but the recurring shape error shows that the Tool surface itself remains unnecessarily ambiguous.

## Scope

- Make the official Content DSH plugin publish the canonical document input shape, including the workspace `file.authority` and relative `file.path` fields.
- Extend the canonical `ContentLocator.selector` only for the supported document addresses: EPUB
  and CBZ entries, PDF pages, and DOCX text ranges. Reader-private chapter, region, and slide
  coordinates remain internal implementation details.
- Remove model-visible `DocumentLocator` / `DocumentRange` arguments. A targeted read carries the
  exact selection inside `source: ContentLocator`; Content converts that selector to private reader
  coordinates at the decoder boundary.
- Document that `neko/assets/<library>/...` paths are ordinary workspace paths when the managed link is present.
- Add path-level tests proving a managed media-library link reaches the document runtime through `workspace-file` authorization.
- Translate every non-ready document runtime result into an ACP Tool failure so DSH, transcript projection, and the existing Webview status agree.
- Flatten the model-visible document arguments to one operation-discriminated object: `{ operation, source, ...operationFields }`.
- Keep the internal ACP domain Tool envelope typed as `{ operation, input }`; the official DSH plugin performs the single boundary projection from flat model arguments to that envelope.
- Project manifest units and document results back as exact `ContentLocator` values so Agent and
  Canvas never reconstruct or merge a bare document coordinate.
- Remove the `DocumentLocator` type, parser, and name from production contracts. Cross-package
  document addresses use a complete `ContentLocator`; decoder-only chapter, region, slide, and
  container page positions use `DocumentReadCoordinate` and never cross the Content reader boundary.
- Keep whole-document `manifest` discovery distinct from `content` extraction, infer targeted
  content reads from `ContentLocator.selector`, and keep reader-private `range`/`next` modes out of
  the model-visible contract.
- Preserve the exact document decoder diagnostic when Host parsing fails instead of rewriting every
  runtime exception as `unsupported-source`.

## Non-goals

- Do not add a `kind: "workspace-file"` compatibility shape, top-level `locator`, `pageRange`, or another legacy alias.
- Do not add a second media-library reader or bypass Host authorization.
- Do not expose absolute paths or media-library-specific locators to DSH.
- Do not add fuzzy path matching, close-name correction, or retry through a different source when a model emits an incorrect locator.
- Do not accept the retired nested `input` wrapper or the observed hybrid shape as compatibility input.
- Do not introduce, publish, or preserve a second cross-application document locator protocol.
- Do not retain `DocumentLocator` as an alias, deprecated export, compatibility parser, or
  differently named cross-package address.
