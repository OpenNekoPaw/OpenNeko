## Why

Creators need to edit ordinary Workspace text and screenplay files safely inside OpenNeko instead of relying on read-only preview or format-specific parallel file paths.

## What Changes

- Add one Workspace text-document authority with safe editing, revision, save, conflict, close, and reopen semantics.
- Provide browser-safe authoring for plain text, Markdown, JSON, and Fountain.
- Keep Fountain screenplay semantics under the Screenplay owner while manual and Agent-assisted writes use the same file authority.

## Capabilities

### New Capabilities

- `workspace-text-document-authoring`
- `fountain-screenplay-authoring`

### Modified Capabilities

<!-- None. -->

## Impact

Text Editor owns presentation, document application services own editing lifecycle, Screenplay owns Fountain semantics, and Host owns authorized I/O. Existing Workspace files remain authoritative.
