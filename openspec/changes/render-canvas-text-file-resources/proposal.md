## Why

Canvas currently classifies only screenplay extensions as Script resources and renders every `TextCanvasNode` as a permanent textarea, even when the durable format is Markdown. Selecting an arbitrary text file through the Script picker can therefore create a Script card that never leaves “loading”, while Markdown notes and text-file references do not receive the low-chrome, content-first rendering promised by the Canvas architecture.

## What Changes

- Add one explicit Canvas text-file classification for Markdown, Fountain, and supported plain-text files so every new text-file import creates a `TextCanvasNode`; automatic Script creation is reserved for a future screenplay workflow.
- Render authored and imported Markdown/plain text through an opaque, low-chrome content surface that fills the node; remove nested preview borders, permanent header/footer chrome, and inline “Open” buttons from the content plane.
- Honor `TextCanvasNode.data.format`: Markdown is rendered as Markdown in display mode, while plain text is rendered as plain text; editing remains an explicit interaction.
- Treat text-file addition as an editable snapshot import. The Extension Host performs one bounded strict UTF-8 read, and the resulting `TextCanvasNode` persists content, explicit format, and portable source provenance in `.nkc`.
- Give Script resource loading an explicit runtime state so empty and failed indexes are visible and cannot masquerade as perpetual loading.
- Align Canvas node headers with the content-first references: imported text shows its source filename and file icon, foundational headers remain transparent and divider-free, and spatial groups use a compact `name x count` label.
- **BREAKING**: `.fountain`, `.nks`, and `.story` no longer create Script nodes through generic file addition; they create plain `TextCanvasNode` snapshots until an explicit screenplay workflow owns Script creation.

## Capabilities

### New Capabilities

- `canvas-text-file-resource-rendering`: Classification, bounded host projection, Markdown/plain-text display, low-chrome Canvas layout, and visible Script loading outcomes for text-like file resources.

### Modified Capabilities

None.

## Impact

- `packages/neko-types`: Canvas dropped-asset and document-kind contracts.
- `packages/neko-canvas/packages/extension`: source-picker validation and bounded text-file reads.
- `packages/neko-canvas/packages/webview`: file resource state, message handling, Markdown/plain-text renderers, TextNode display/edit projection, and low-chrome node layout.
- Existing `NodeHeader` and `GroupNode` presentation paths are extended rather than introducing package-local duplicate header components.
- `packages/neko-ui` / `packages/neko-markdown`: existing shared normalized Markdown contracts and rendering primitives are audited and reused or minimally extended; Canvas must not import Agent-private renderers.
- Canvas package documentation, focused Webview/Extension tests, and Extension Development Host runtime acceptance.
