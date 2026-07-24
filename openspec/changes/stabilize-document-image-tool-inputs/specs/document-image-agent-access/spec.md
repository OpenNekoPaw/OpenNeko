## ADDED Requirements

### Requirement: ReadImage validates stable image identity before execution

`ReadImage` SHALL accept document images through a complete document-entry reference, through a same-item top-level stable entry path that can complete a nested document-entry ref missing only that field, or through a complete managed ResourceRef. Its Tool schema and every Agent host validator MUST reject inputs that cannot form one unambiguous identity before content loading.

#### Scenario: Accept a ReadDocument image entry

- **WHEN** `images[n].resourceRef` is copied intact from `ReadDocument.imageInfo[n].resourceRef` and contains `kind=document-entry`, `source`, and a non-empty `entryPath`
- **THEN** schema validation succeeds and ReadImage loads that document entry through unified ContentAccess

#### Scenario: Preserve the stable document source

- **WHEN** ContentAccess resolves a workspace-relative document source to a physical Host path for entry loading
- **THEN** ReadDocument returns the workspace-relative source in `imageInfo[n].resourceRef` and does not expose the resolved physical path

#### Scenario: Normalize one omitted nested path in a batch

- **WHEN** a document-entry `images[n].resourceRef` retains valid `kind` and `source`, omits only nested `entryPath`, and the same item retains a non-empty top-level `entryPath`
- **THEN** validation succeeds and the ReadImage input boundary forms one complete document-entry identity before content loading

#### Scenario: Accept a managed image resource

- **WHEN** `images[n].resourceRef` is a complete managed ResourceRef returned by unified content access or media generation
- **THEN** schema validation succeeds without requiring a document entry path

### Requirement: Invalid references are not guessed or ambiguously reconstructed

The Agent and `ReadImage` MUST NOT reconstruct an incomplete resourceRef from another item, generic metadata, locators, filenames, archive source paths, cache paths, Webview URIs, or whole-document bytes. Same-item top-level `entryPath` MAY complete a nested document-entry ref only when that nested path is absent and the remaining nested identity is valid.

#### Scenario: Duplicate entry paths conflict

- **WHEN** an image item has both top-level `entryPath` and nested `resourceRef.entryPath` but the values differ
- **THEN** the call fails visibly before ContentAccess and does not select either path

#### Scenario: Entry identity is absent

- **WHEN** a document-entry ref and its containing image item both omit `entryPath`
- **THEN** validation fails before content loading and the batch is not reported as successful

#### Scenario: Invalid canonical locator cannot fall back to a sibling reference

- **WHEN** an image item explicitly contains a `contentLocator` that does not satisfy the stable locator contract and also contains a parseable `resourceRef`
- **THEN** validation reports the indexed `contentLocator` failure before content loading and neither provider nor metadata fallback executes

#### Scenario: Whole archive is passed as an image

- **WHEN** ReadImage receives a document archive reference without an entry path
- **THEN** it returns a stable validation or runtime diagnostic and does not load the archive as image bytes

### Requirement: Document image behavior has path-level Agent evidence

The Evaluation platform SHALL exercise the canonical document image Tool sequence with a committed synthetic fixture and SHALL distinguish Tool behavior failure from infrastructure failure.

#### Scenario: Analyze synthetic document images

- **WHEN** the focused real Agent case requests image evidence from a committed synthetic EPUB
- **THEN** evidence records successful ReadDocument and ReadImage calls, native multimodal delivery, a terminal answer, and no whole-archive or fabricated-ref fallback

#### Scenario: Deliver a ReadImage result to Pi

- **WHEN** ReadImage returns a stable image attachment in a Pi Agent turn
- **THEN** the Pi Tool bridge loads it through the Host-injected content loader and includes native image content in the next model step

#### Scenario: Native image projection is unavailable

- **WHEN** an image attachment lacks a stable ref, the Host loader is unavailable, or loaded content is not a base64 image payload
- **THEN** the Tool fails visibly and does not continue with metadata-only text presented as image analysis

#### Scenario: Real evaluation cannot run

- **WHEN** provider credentials, model access, or required multimodal capability is unavailable
- **THEN** the run reports infrastructure-blocked and does not treat key-free or deterministic tests as real Agent acceptance

### Requirement: Native image transport is bounded and batch-aware

The Agent SHALL bound ReadImage source selection and every provider-bound image payload. A multi-image Tool result SHALL use Host-composed, labeled contact sheets while retaining the original per-image stable identities in the Tool result.

#### Scenario: Analyze a multi-page document batch

- **WHEN** ReadImage selects between two and five document images for one Agent continuation
- **THEN** the Host composes one or more labeled contact sheets within the provider image-count and byte budgets, and the next model step receives the sheets plus an ordered tile manifest instead of one image part per source page

#### Scenario: Encoded payload exceeds its budget

- **WHEN** Host projection cannot keep one image payload at or below 4 MiB or the complete image batch at or below 12 MiB
- **THEN** the Tool continuation fails visibly before provider submission and does not silently omit source images

#### Scenario: Too many source images are requested

- **WHEN** ReadImage receives more than five valid image inputs
- **THEN** it selects at most five according to the declared order, reports truncation, and does not load or transmit later items

### Requirement: Webview shows the images selected for analysis

The Extension Host SHALL project bounded display previews for successful ReadImage attachments, including locator-only document entries, and the Agent Webview SHALL render them in selected order without persisting Host-only preview bytes.

#### Scenario: Locator-only ReadImage result is displayed

- **WHEN** ReadImage returns `data.images[n].contentLocator` and the aligned attachment has the same stable locator
- **THEN** the Host resolves a bounded thumbnail through ContentAccess and the Tool card displays the image label, index, dimensions, and preview

#### Scenario: Thumbnail projection fails

- **WHEN** a selected image remains valid for model analysis but its Webview preview cannot be generated
- **THEN** the Tool card retains an ordered placeholder and diagnostic for that image instead of removing it from the visible selection
