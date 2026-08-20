# Content Document DSH Contract

## MODIFIED Requirements

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
