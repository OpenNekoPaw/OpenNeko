# dsh-content-image-reading Specification

## Purpose
TBD - created by archiving change restore-dsh-content-image-reading. Update Purpose after archive.
## Requirements
### Requirement: Content locators reach native DSH image context

The active DSH profile SHALL expose an OpenNeko-owned image reader that accepts
an exact canonical `ContentLocator`, loads it through Host-authorized Content
access, persists it in the DSH attachment store, and emits a native image block.

#### Scenario: EPUB image entry is read

- **WHEN** `openneko.document` returns a document-entry Content locator and an
  image-capable model calls the OpenNeko image reader with that locator
- **THEN** the exact entry bytes are read under the Conversation Workspace grant
- **AND** the next model step receives the image through a durable DSH attachment
- **AND** no Pi adapter, archive extraction path, or active-Workspace fallback is used

#### Scenario: Model route cannot consume images

- **WHEN** the exact current provider/model route does not declare image input
- **THEN** the image Tool call fails visibly before publishing an image result
- **AND** it does not switch model, provider, source, or media-analysis implementation

#### Scenario: One step requests several document images

- **WHEN** a model emits multiple OpenNeko image-reader calls in one step
- **THEN** DSH schedules those calls exclusively in model order
- **AND** every call uses the existing bounded per-Session Host admission path
- **AND** the implementation does not create a second queue or increase the global Host budget

#### Scenario: Valid document image exceeds the attachment side limit

- **WHEN** an authorized image is within the active decoded-pixel and byte limits but one side exceeds the active DSH attachment dimension limit
- **THEN** the image reader derives a bounded auto-oriented visual representation and persists that representation as the native DSH attachment
- **AND** the Tool result and downstream Workspace artifacts preserve the exact original `ContentLocator`
- **AND** no source bytes, Workspace file, attachment limit, provider, or model selection is modified

#### Scenario: Source exceeds a non-resizable safety bound

- **WHEN** the source exceeds the active decoded-pixel or byte limit, cannot be decoded, or uses an unsupported image format
- **THEN** only the current image Tool call fails visibly
- **AND** the implementation does not raise a limit or publish a partial image result

### Requirement: Document roots are selector-free

`openneko.document` SHALL accept only a selector-free Workspace document source.

#### Scenario: Archive entry is passed as document source

- **WHEN** the caller supplies `source.selector`
- **THEN** the decoder rejects the current Tool call with a precise invalid-input diagnostic
- **AND** sibling tools and Conversations remain available
