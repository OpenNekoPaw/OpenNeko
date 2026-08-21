# DSH Content Image Reading

## ADDED Requirements

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
- **AND** it does not switch model, provider, source, or perception implementation

#### Scenario: One step requests several document images

- **WHEN** a model emits multiple OpenNeko image-reader calls in one step
- **THEN** DSH schedules those calls exclusively in model order
- **AND** every call uses the existing bounded per-Session Host admission path
- **AND** the implementation does not create a second queue or increase the global Host budget

### Requirement: Document roots are selector-free

`openneko.document` SHALL accept only a selector-free Workspace document source.

#### Scenario: Archive entry is passed as document source

- **WHEN** the caller supplies `source.selector`
- **THEN** the decoder rejects the current Tool call with a precise invalid-input diagnostic
- **AND** sibling tools and Conversations remain available
