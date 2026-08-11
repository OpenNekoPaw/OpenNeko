## Why

Canvas currently renders generic File nodes as an empty card with a file icon even when the authorized resource is readable Markdown, JSON or plain text. This hides the material users need for visual composition and forces an unnecessary full-preview action for basic inspection.

## What Changes

- Add a bounded, read-only text preview for eligible File nodes backed by a valid `ContentLocator`.
- Present JSON as formatted structured text and Markdown/plain text as readable excerpts without converting the File node into an editable Markdown snapshot.
- Keep the filename in the existing external node label and use the card body only for content, loading or local diagnostic state.
- Reject unsupported, oversized, unreadable and malformed projection results locally without exposing raw paths or making sibling nodes unavailable.
- Keep unknown and binary files on the existing generic file-icon presentation.

## Capabilities

### New Capabilities

- `canvas-text-file-preview`: Bounded Host-authorized text projection and read-only Canvas presentation for referenced Markdown, JSON and plain-text files.

### Modified Capabilities

None.

## Impact

- Owning responsibility: `packages/canvas/domain` owns the canonical preview request/result contract and bounded presentation semantics; `packages/canvas/webview` owns request lifecycle and Canvas rendering; the concrete Desktop/content adapter owns authorized byte reads through the existing content access boundary.
- Package roles: Canvas domain contracts/application policy, Canvas Webview browser presentation, and the existing Desktop composition/content adapter are affected. `apps/neko-desktop` remains a thin trust-boundary adapter and does not own file-format or Canvas presentation rules.
- Existing Markdown nodes, File durable facts, `ContentLocator` identity and unknown/binary File rendering remain unchanged.
- Tests must prove the exact authorized content path, bounded reads, JSON formatting, local failure isolation, stale-response disposal and unchanged sibling/Markdown behavior.
