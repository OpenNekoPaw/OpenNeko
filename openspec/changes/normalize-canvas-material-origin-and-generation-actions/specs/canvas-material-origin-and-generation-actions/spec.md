## ADDED Requirements

### Requirement: Canvas material identity is orthogonal to node rendering type

Canvas SHALL keep canonical rendering types such as `media`, `file`, and `job` independent from material origin and lifecycle. Referenced and generated variants MUST use the same canonical content node type, and normal authoring MUST NOT introduce parallel node types for every media type and origin combination.

#### Scenario: Add referenced and generated images

- **WHEN** one referenced image and one generated image are added to a Canvas
- **THEN** both are canonical Media nodes with `mediaType: image`, while their validated ContentLocators distinguish reference from generated origin

#### Scenario: Add an Entity representation

- **WHEN** a user adds a confirmed Creative Entity whose active representation resolves to supported content
- **THEN** Canvas creates a canonical node for the representation locator and retains the stable Entity reference separately without treating the Entity fact as a file path

### Requirement: ContentLocator is the material identity authority

Every source-backed Canvas content node SHALL retain one validated ContentLocator as its durable material identity. A generated material MUST be classified only by a `generated-output` locator; workspace path patterns, legacy ResourceRef kinds, titles, runtime URIs, and free-form provenance MUST NOT be alternate normal-runtime classifiers.

#### Scenario: Add an ordinary workspace file

- **WHEN** Canvas receives a validated `workspace-file`, `document-entry`, or `package-resource` locator
- **THEN** it creates the matching referenced node without attaching generation context

#### Scenario: Add a generated output

- **WHEN** Canvas receives a validated `generated-output` locator
- **THEN** it creates a generated result node retaining the exact output identity, revision, digest, and portable path

#### Scenario: Legacy node lacks canonical origin

- **WHEN** an existing node can only be classified through a generated path pattern, legacy ResourceRef, or provenance string
- **THEN** normal authoring reports an explicit migration or inspection diagnostic and does not silently classify it through a fallback

### Requirement: Material entry follows source ownership

Canvas SHALL use four explicit entry paths: direct reference for authorized project content, link-or-copy for user-global library content, copy-before-reference for arbitrary external files, and owner-committed projection for generated output. No path SHALL persist an absolute path, physical link target, Webview URI, cache path, or temporary location.

#### Scenario: Add a workspace or linked-library file

- **WHEN** a user adds an authorized workspace file or a file below `neko/assets/<libraryName>/`
- **THEN** Canvas retains the exact workspace-relative locator and does not copy the bytes or create a per-file symlink

#### Scenario: Add content from an unlinked global media library

- **WHEN** a selected global media library is not linked to the active project
- **THEN** the Host requires an explicit link-library or copy-into-project decision before creating a Canvas node

#### Scenario: Add an arbitrary external file

- **WHEN** a user selects or drops a supported file outside every authorized project content root
- **THEN** the Host atomically copies it into the project-owned import root with explicit conflict handling and creates the node only from the resulting workspace-file locator

#### Scenario: External import fails

- **WHEN** authorization, bounded read, collision handling, or atomic write fails
- **THEN** Canvas reports a visible diagnostic and creates neither an empty content node nor a temporary-path reference

### Requirement: Empty generated material is represented by a Job

An image, audio, video, document, or model Media/File node MUST NOT exist without a durable content source. An empty AI-generation surface SHALL be a Generation Job or transient draft owned by the Job lifecycle; only Markdown and Group retain their existing legal empty authoring states.

#### Scenario: Start generation from the add-node surface

- **WHEN** a user chooses an AI-generatable output type without selecting source content
- **THEN** Canvas creates or opens a generation draft carrying desired output kind, prompt parameters, target position, and stable Job identity rather than persisting an empty Media node

#### Scenario: Generation completes

- **WHEN** the Generation owner commits a terminal successful result
- **THEN** Canvas projects a new generated Media/File node from the returned generated-output locator and links it to the Job and input nodes without making Canvas the Job status owner

#### Scenario: Generation fails or is cancelled

- **WHEN** a generation Job fails or is cancelled before a durable output is committed
- **THEN** the Job projection remains failed or cancelled with a visible diagnostic and no source-less result node is created

### Requirement: Referenced material operations are non-destructive

Referenced content nodes SHALL expose only actions backed by the selected content type and available owner capabilities. Any operation that changes content bytes, including crop, erase, redraw, denoise, separation, interpolation, transcoding, or AI transformation, MUST create a new derived output and MUST NOT overwrite the source, rewrite its locator, or attach generation facts to the referenced node.

#### Scenario: Crop a referenced image

- **WHEN** a user crops an image backed by an ordinary workspace locator
- **THEN** the image-editing owner writes a new derived result, Canvas creates a new node with `derived-from` lineage, and the original node remains unchanged

#### Scenario: Apply AI redraw to a referenced image

- **WHEN** a user invokes redraw on a referenced image
- **THEN** the action creates a Generation Job using the source locator as an input and later adds a generated sibling node without converting the referenced node into a generated node

#### Scenario: Owning capability is unavailable

- **WHEN** the selected node type has no registered executable owner action
- **THEN** Canvas omits the action instead of rendering a no-op or fallback button

### Requirement: Generated material supports stable regeneration

A generated node SHALL preserve an immutable creator-facing generation summary and a stable reference to the Job or recipe authority that can recreate it. The summary MUST remain historical evidence and MUST NOT become an editable prompt authority.

#### Scenario: Regenerate a generated result

- **WHEN** a generated node has a resolvable Generation reference and the user invokes regenerate
- **THEN** the Generation owner clones or derives a new Job from the prior recipe and commits a new output identity/revision without overwriting the selected result

#### Scenario: Generate with edited parameters

- **WHEN** the user edits the prompt or supported generation parameters from a generated node
- **THEN** the editable recipe is owned by the Generation/Agent workflow and the completed result is projected as a new version or sibling with lineage to the prior result

#### Scenario: Generated result lacks a resolvable recipe

- **WHEN** a generated-output node has historical prompt/model metadata but no valid Generation reference
- **THEN** Canvas displays the recorded source summary but omits regenerate and reports why the recipe is unavailable

### Requirement: Canvas material actions are capability projections

Canvas SHALL project material actions from validated node identity, material origin, media type, and owner-contributed capability descriptors. Canvas MUST NOT import or reimplement Preview, Cut, image editing, audio processing, model viewing, or provider execution internals.

The Host SHALL resolve descriptors for an explicit Canvas revision and selected-node set. The Webview SHALL discard a resolution produced for a stale revision or selection, and the Host SHALL resolve the exact descriptor again before dispatch so a capability that became unavailable cannot execute through a stale button or fallback.

#### Scenario: Select a referenced video

- **WHEN** a referenced video is selected and Preview and Cut capabilities are available
- **THEN** Canvas may expose preview, fullscreen, open-in-Cut, add-to-Cut, and owner-backed derived operations, but does not display generation history or regenerate

#### Scenario: Select a generated audio result

- **WHEN** a generated audio node with a valid Generation reference is selected
- **THEN** Canvas exposes the applicable audio actions plus generation summary and regenerate without changing the audio renderer type

#### Scenario: Select multiple mixed nodes

- **WHEN** a selection contains nodes with different content types or origins
- **THEN** Canvas exposes only actions whose descriptor declares safe multi-selection support for every selected node and does not synthesize a generic quick-generate action

#### Scenario: Owner authority changes after projection

- **WHEN** an action was projected but its Generation recipe, Cut session, codec, authorization, or owning runtime becomes unavailable before execution
- **THEN** the Host rejects the action visibly after re-resolving the same selection and does not invoke a stale owner, no-op, or fallback implementation

### Requirement: Generated projection and action state remain portable

Persisted Canvas state SHALL contain only validated locators, stable Job/recipe references, immutable generation summary, and portable lineage. Runtime media URLs, temporary files, cache handles, provider credentials, live task objects, and host action callbacks MUST remain outside the Canvas document.

#### Scenario: Save and reopen generated nodes

- **WHEN** a Canvas containing Job and generated result projections is saved and reopened
- **THEN** the same generated-output identities, Generation references, summaries, and lineage are restored while runtime previews and action descriptors are rebuilt

#### Scenario: Runtime value enters persistent payload

- **WHEN** a mutation attempts to persist a runtime URL, cache path, temporary path, token, or callback in material or generation data
- **THEN** strict Canvas validation rejects the mutation visibly
