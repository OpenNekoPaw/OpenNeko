## Product boundary

The Text Editor owns browser-safe presentation and editing state; a host-neutral document application service owns document sessions, revisions, save conflicts, and format operations; Host owns file authorization and concrete I/O. Screenplay owns Fountain parsing and screenplay semantics without becoming a file or editor authority.

## Core invariants

- One exact Workspace document identity maps to one authoritative byte source and document session.
- Renderer state never becomes document truth and never writes files directly.
- Save, external-change conflict, reload, close, and failure semantics are explicit and local to the document.
- Markdown, JSON, Fountain, and ordinary text share the document authority while format owners provide their own semantics.
- Agent-assisted authoring uses the same Workspace file authority as manual editing.

## Product acceptance

The capability is complete when creators can safely create, edit, save, reopen, and recover supported text documents and use the core screenplay workflow through the authoritative Desktop path.

## Non-goals

This change does not create a cloud document service, collaborative editor, or format-specific file authority.
