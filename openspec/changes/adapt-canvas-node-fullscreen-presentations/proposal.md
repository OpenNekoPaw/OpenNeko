## Why

Canvas fullscreen currently enlarges one generic `ContainerRenderer` surface regardless of node semantics. Media is capped to a short preview with unused space, while Text always becomes a full-panel textarea, so Markdown loses formatted rendering and plain text/Markdown are indistinguishable in fullscreen.

## What Changes

- Define explicit fullscreen presentations for visual media, readable/editable text, creator workbenches, and unsupported/external-editor resources, while allowing a descriptor to resolve the final presentation from the node's durable material metadata.
- Render images in a frameless dark viewer with a top-right close control and bottom-centered zoom controls; keep video/audio media on their existing viewport-filling stage.
- Render `TextCanvasNode` fullscreen according to durable `format`: Markdown uses the safe shared Markdown renderer, plain text preserves whitespace, and editing is entered explicitly instead of mounting a permanent giant textarea.
- Keep Shot's existing specialized creator workbench and constrain generic structured overlays to a centered readable working width with one scroll owner.
- Expose fullscreen only when the node descriptor declares a supported fullscreen presentation; Document and Script continue using their owning open/editor actions instead of a no-op generic overlay.
- Reuse the existing `ContentOverlay`, node descriptors, `PreviewSurface`, and shared Markdown primitives; do not add persisted fullscreen/zoom state or a second overlay system.

## Capabilities

### New Capabilities

- `canvas-node-fullscreen-presentations`: Node-type fullscreen eligibility, visual-stage layout, Markdown/plain-text projection, explicit text editing, and structured workbench behavior.

### Modified Capabilities

None.

## Impact

- `packages/neko-canvas/packages/webview`: node descriptor metadata, selection/NodeHeader fullscreen availability, `ContentOverlay`, media preview sizing, text display/edit projection, styles, and focused runtime tests.
- No Engine, Proto, project-format, durable node-schema, or Extension Host message changes.
