## Why

DSH currently serializes ACP `resource_link` prompt blocks into model-visible text. The same text is
then replayed into the Agent transcript, exposing the internal `openneko-content:` URI instead of the
selected filename. This also makes presentation depend on parsing a private text convention.

## What Changes

- Preserve user-visible text and ACP resource links as structured DSH message-source metadata while
  keeping the model-facing resource identity in the exact turn context.
- Project user messages through ACP and the Desktop contract as ordered text/resource blocks.
- Reuse the existing Agent user-message row and render resource blocks as compact filename links,
  without exposing encoded URIs or absolute paths.
- Reject malformed or non-OpenNeko resource identities at the smallest Desktop projection boundary;
  do not parse historical pseudo text or add a fallback renderer.

## Capabilities

### New Capabilities

- `agent-resource-link-presentation`: Defines structured resource-link preservation and transcript
  presentation for DSH-backed Agent messages.

### Modified Capabilities

None.

## Impact

- `@neko/dsh-bridge` owns ACP-to-DSH prompt admission and DSH-to-ACP replay without owning resource
  business semantics.
- `@neko/agent-runtime` owns bounded ACP Session projection and ordered message assembly.
- `@neko/agent-contracts` owns the canonical Desktop user-message block contract.
- `apps/neko-desktop` validates the private ACP resource URI into a canonical `ContentLocator` at the
  Main trust boundary and injects the same selected resources into turn context.
- `@neko/agent-webview` reuses the existing message row and owns only filename-link presentation.
- No user files, DSH Session files, or existing transcripts are rewritten.
