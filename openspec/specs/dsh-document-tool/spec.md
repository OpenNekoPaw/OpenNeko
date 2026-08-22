# dsh-document-tool Specification

## Purpose
TBD - created by archiving change add-dsh-document-tool. Update Purpose after archive.
## Requirements
### Requirement: Canonical DSH document tool

The active DSH profile SHALL expose exactly one OpenNeko document tool named `openneko.document` with operations `read`, `continue`, and `read-images`.

#### Scenario: DSH registers document capability

- **WHEN** the OpenNeko DSH profile is materialized
- **THEN** `openneko.document` is registered through the official DSH ToolRuntime
- **AND** the profile does not register `ReadDocument`, `ReadImage`, `read_document`, or `read_document_image`

### Requirement: Native filesystem tool separation

OpenNeko SHALL preserve DSH native `read` and `read_image` semantics for UTF-8 files and standalone raster files; the document tool SHALL not shadow or wrap either native tool.

#### Scenario: Archive document uses domain tool

- **WHEN** a model needs EPUB, PDF, DOCX, CBZ, or CBR content
- **THEN** the model uses `openneko.document`
- **AND** raw file paths and archive entry paths are rejected

### Requirement: Exact conversation and workspace authorization

Document tool execution SHALL resolve the exact DSH session binding and workspace grant before reading content.

#### Scenario: Missing or mismatched binding fails locally

- **WHEN** a document request has no exact binding or references a different workspace
- **THEN** the current tool call returns a typed failure
- **AND** unrelated sessions, capabilities, and workspaces remain available
