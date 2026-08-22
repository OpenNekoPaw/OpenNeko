## ADDED Requirements

### Requirement: Node-bound reads observe prior Canvas document submissions

Canvas SHALL execute a node-bound resource read only after every Canvas document operation enqueued earlier by the same Webview Host has settled. Authorization SHALL use the resulting authoritative Canvas snapshot rather than the Webview's optimistic node projection.

#### Scenario: Copied image reference mounts before document submission completes

- **WHEN** the Webview adds a copied image reference node with a new node identity and enqueues the updated Canvas document
- **AND** that node requests its preview before the document submission completes
- **THEN** Canvas SHALL defer Desktop preview resolution until the updated document is authoritative
- **AND** the preview SHALL be authorized against the copied node's exact identity, content kind and unchanged persistent `ContentLocator`
- **AND** the user SHALL NOT need to reopen the Canvas to render the copied reference

#### Scenario: Copied file reference requests text content

- **WHEN** the Webview adds a copied file reference node and immediately requests its text preview
- **THEN** Canvas SHALL wait for the earlier document submission to settle before calling the text-preview runtime
- **AND** the runtime SHALL validate the copied node identity and its unchanged persistent `ContentLocator`

### Requirement: ContentLocator is not an independent preview authorization

Canvas SHALL preserve a referenced node's canonical `ContentLocator` when copying the node, but SHALL NOT treat possession of that locator as sufficient resource authorization. The copied node identity MUST exist in the current authoritative Canvas and match the requested locator and content kind.

#### Scenario: Document submission does not authorize the copied node

- **WHEN** a copied node read reaches the runtime but the authoritative Canvas does not contain the exact node and locator association
- **THEN** Canvas SHALL reject or diagnose only that resource read visibly
- **AND** it SHALL NOT retry with the original node, authorize by locator alone, read an old projection, or require a global Canvas reset

### Requirement: Resource release remains independent from document mutation ordering

Canvas SHALL release an issued preview descriptor by its opaque descriptor identity without waiting for unrelated Canvas document submissions.

#### Scenario: Preview unmounts while a Canvas operation is pending

- **WHEN** a mounted preview releases an existing descriptor while another Canvas document operation is pending
- **THEN** Canvas SHALL forward the release without waiting for that document operation
- **AND** the pending operation SHALL NOT extend the descriptor lifetime
