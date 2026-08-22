# content-document Specification

## Purpose
TBD - created by archiving change repair-dsh-document-locator-contract. Update Purpose after archive.
## Requirements
### Requirement: DSH document inputs expose the canonical workspace locator

The official `openneko.document` Tool metadata MUST describe `source.file.authority` as `workspace` and `source.file.path` as a workspace-relative POSIX path. A managed `neko/assets/<library>/...` path MUST use this same locator shape and MUST NOT require a media-library-specific locator.

#### Scenario: Model reads a linked media-library document

- **WHEN** the Tool receives `{"source":{"file":{"authority":"workspace","path":"neko/assets/Books/book.epub"}}}` for a supported read operation
- **THEN** the request is accepted by the canonical decoder and routed through workspace content authorization
- **AND** the Host reads the linked file as an ordinary workspace file

#### Scenario: Retired locator shapes remain visible failures

- **WHEN** the Tool receives `{"source":{"kind":"workspace-file","path":"neko/assets/Books/book.epub"}}`, a top-level `locator`, or a `pageRange` field
- **THEN** the canonical decoder rejects the request with an invalid-input diagnostic
- **AND** no compatibility reader or alternate path is attempted

### Requirement: DSH document selection uses ContentLocator only

The official `openneko.document` Tool metadata and decoder MUST expose the package-owned
`ContentLocator` as the only document address. Targeted content MUST be represented by
`source.selector`; a bare `DocumentLocator`, `range.locator`, or parallel locating object MUST NOT
be exposed or accepted.

The production contract MUST NOT export, parse, accept, or persist a `DocumentLocator`. A
format-specific reader MAY use a transient `DocumentReadCoordinate` within the Content decoding
operation, but that coordinate MUST NOT cross the Content reader boundary or become an address,
identity, cursor projection, Agent result, Preview message, Search/Entity occurrence, or Canvas
artifact.

#### Scenario: Canonical document entry is accepted

- **WHEN** a read request supplies `mode: "content"` and a `source` ContentLocator whose selector
  is `{"kind":"entry","path":"OPS/chapter.xhtml"}`
- **THEN** the decoder preserves that exact ContentLocator
- **AND** Content converts it to private reader coordinates without exposing a second locator

#### Scenario: Selected manifest is rejected

- **WHEN** a read request supplies `mode: "manifest"` and a `source.selector`
- **THEN** the decoder rejects the request before Content access
- **AND** it does not reinterpret the selected address as a whole-document manifest read

#### Scenario: EPUB and CBZ entries use the same selector

- **WHEN** an EPUB chapter or CBZ image is addressed by an `entry` selector containing its
  container-relative path
- **THEN** the same complete ContentLocator is preserved across Tool, Host, result, and Canvas
- **AND** only the Content reader converts that entry to chapter or page coordinates

#### Scenario: PDF page is unambiguous

- **WHEN** a PDF read supplies `{"kind":"page","pageNumber":3,"pageIndex":2}` in
  `source.selector`
- **THEN** Content reads the third page without a second range or locator field
- **AND** mismatched one-based and zero-based page values are rejected

#### Scenario: DOCX text range is unambiguous

- **WHEN** a DOCX read supplies one character, line, paragraph, or heading coordinate family in a
  `text-range` selector
- **THEN** Content converts that selector to its private DOCX reader coordinate
- **AND** mixed coordinate families are rejected instead of being interpreted by precedence

#### Scenario: Parallel locator is rejected

- **WHEN** a read request supplies `range`, `locator`, or `DocumentLocator` fields beside `source`
- **THEN** the Host returns `DOCUMENT_DSH_TOOL_INVALID_INPUT`
- **AND** the document runtime is not invoked

#### Scenario: Manifest returns complete locators

- **WHEN** Content returns a document manifest
- **THEN** every addressable unit carries one complete `ContentLocator`
- **AND** no bare document coordinate or fingerprint is exposed

#### Scenario: Retired DocumentLocator API is absent

- **WHEN** production contracts and consumers are built
- **THEN** no `DocumentLocator` type, parser, alias, or cross-package field remains
- **AND** every transferable document address is a complete `ContentLocator`

#### Scenario: Reader coordinate remains transient

- **WHEN** EPUB, PDF, DOCX, or CBZ decoding requires a format-specific execution position
- **THEN** Content converts the incoming `ContentLocator.selector` to a `DocumentReadCoordinate`
- **AND** the coordinate is converted back to a complete ContentLocator before leaving Content

#### Scenario: Canvas deduplicates exact content addresses

- **WHEN** a successful turn reads the same complete ContentLocator more than once and also reads a
  different selector in the same container
- **THEN** Canvas receives one source artifact for the repeated locator and one for the distinct
  selector
- **AND** deduplication uses the complete ContentLocator rather than the container path alone

### Requirement: Content failure is a failed DSH Tool execution

The ACP Host adapter MUST map only a ready document result to Tool success. A non-ready document result MUST be returned as an ACP failure using its explicit diagnostic so all DSH projections and consumers observe one failure state.

#### Scenario: Missing content is not displayed as completed

- **WHEN** the document runtime returns `status: "failed"` with a `content-missing` diagnostic
- **THEN** the ACP Host response has `outcome: "failure"` and diagnostic code `content-missing`
- **AND** no successful JSON Tool result is published

#### Scenario: Decoder failure remains diagnosable

- **WHEN** an authorized document source reaches its format decoder and module loading or parsing fails
- **THEN** the Host returns a failed Tool diagnostic containing the decoder failure code and message
- **AND** it does not relabel the failure as an unsupported source

### Requirement: Document result modes have one public meaning

The model-visible Tool MUST distinguish whole-document `manifest` discovery from `content`
extraction. A selected `ContentLocator` MUST imply targeted content reading, while private reader
`range` and cursor `next` modes MUST remain inside the Host adapter.

#### Scenario: Whole-document manifest does not extract content

- **WHEN** an unselected document source is read with `mode: "manifest"`
- **THEN** Content invokes manifest discovery and returns addressable units as complete ContentLocators
- **AND** it does not invoke whole-document text extraction

#### Scenario: Selected content does not require a second mode decision

- **WHEN** a read source contains a supported selector and mode is omitted or is `content`
- **THEN** the Host performs one targeted content read for that selector
- **AND** model-visible `range` or `next` values are not accepted

### Requirement: Model-visible document arguments are flat

The official `openneko.document` Tool MUST expose `operation`, `source`, and operation-specific fields in one flat argument object. It MUST NOT expose or accept a model-visible `input` wrapper. The official DSH plugin MUST project the decoded flat arguments into the internal ACP `{ operation, input }` envelope.

#### Scenario: Manifest read uses one argument level

- **WHEN** the Tool receives `{"operation":"read","source":{"file":{"authority":"workspace","path":"books/story.epub"}},"mode":"manifest","includeManifest":true}`
- **THEN** the canonical decoder produces the read operation and input containing that exact source and options
- **AND** the official plugin sends them through the ACP domain Tool envelope

#### Scenario: Hybrid source and input shape is rejected

- **WHEN** the Tool receives a top-level `source` plus `input: {"mode":"manifest"}`
- **THEN** the canonical document argument decoder rejects the unsupported `input` field before any Host call
- **AND** no compatibility decoder or Host call is attempted

#### Scenario: Retired nested wrapper is rejected

- **WHEN** the Tool receives `{"operation":"read","input":{"source":...}}`
- **THEN** the canonical document argument decoder rejects the retired nested wrapper before any Host call
- **AND** the nested wrapper cannot produce a successful Tool call
