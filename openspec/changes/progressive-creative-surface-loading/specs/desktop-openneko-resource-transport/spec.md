## ADDED Requirements

### Requirement: Package-owned resource trees SHALL remain exact and demand-driven

The Desktop resource registry SHALL project a package-owned, read-only resource tree only after the owning adapter authorizes its exact source and freezes its normalized entry allowlist. The registry SHALL request bytes from the source only for an authorized exact virtual path, SHALL bind MIME, byte length, sender and lifecycle to that entry, and MUST NOT parse the container, enumerate it to Renderer, authorize adjacent files or buffer the complete source.

#### Scenario: EPUB requests bootstrap metadata

- **WHEN** the owning Preview WebContents requests `META-INF/container.xml`, the package document and navigation entries
- **THEN** the handler reads only those allowlisted archive entries and returns their exact MIME and length
- **AND** unopened chapter, image and font entries remain unread

#### Scenario: EPUB requests a visible chapter resource

- **WHEN** the current chapter references an allowlisted stylesheet, image or font
- **THEN** the browser request resolves that exact virtual path through the same sender-bound registration
- **AND** no sibling entry is decompressed as a side effect

#### Scenario: Resource-tree path is invalid or stale

- **WHEN** a request uses traversal, an unknown entry, another sender, a released session or a changed archive source
- **THEN** the current request returns an explicit non-success response and no bytes
- **AND** other registrations and sibling Desktop capabilities remain available

### Requirement: Resource-tree lifecycle SHALL cancel entry reads

Releasing a View/session/renderer/Window resource tree SHALL abort its in-flight entry reads and make every URL under its opaque ID unavailable. Late read completion MUST NOT recreate the registration or publish bytes to a new owner.

#### Scenario: Preview closes during entry decompression

- **WHEN** an EPUB View closes while an image or chapter entry is being read
- **THEN** the exact read receives cancellation and the resource tree is revoked
- **AND** reopening the document creates a new exact registration rather than reusing the released URL
