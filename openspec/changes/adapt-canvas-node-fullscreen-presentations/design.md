## Context

Canvas currently treats fullscreen as a larger rendering surface rather than as a node capability. The overlay opens from two independent UI paths, then sends most nodes through one generic `ContainerRenderer`. This collapses distinct user intents:

- media should be inspected on an immersive stage;
- text should be read according to its durable `format`, with editing entered deliberately;
- creator nodes need a workbench that preserves their domain controls;
- resources owned by an external editor should use that editor instead of a generic overlay.

The durable node model already distinguishes `TextCanvasNode.data.format` as `markdown` or `plain`. The Canvas renderer honors that contract, but the fullscreen renderer does not. Media has a related presentation defect: the overlay preview registry applies a `52vh` cap even when the overlay has substantially more usable space.

### Five-layer analysis

1. **Responsibility**: node descriptors own fullscreen eligibility and presentation resolution; `ContentOverlay` owns transient layout and interaction; the image viewer owns transient zoom; existing renderers continue to own content rendering.
2. **Dependencies**: UI controls depend on descriptor metadata, and the overlay depends on the selected node plus that metadata. No Webview-to-Extension or Engine dependency is introduced.
3. **Interfaces**: extend the package-local node descriptor with one optional static-or-resolved fullscreen presentation declaration. Absence or an unresolved result means unsupported and is fail-visible in development rather than silently opening an empty overlay.
4. **Extension**: future screenplay, media, model, or creator nodes may resolve a specialized presentation from their durable content contract without changing generic Text behavior.
5. **Testing**: assert both the visible result and the selected presentation path: Markdown renderer versus plain projection, image viewer versus non-image visual stage, specialized Shot workbench, and hidden controls for unsupported nodes.

## Goals / Non-Goals

**Goals:**

- Preserve Markdown/plain semantics in fullscreen.
- Use available viewport space appropriately for media and structured content.
- Make fullscreen availability explicit and consistent across NodeHeader and selection toolbar entry points.
- Keep one overlay system and reuse existing safe renderers.
- Provide an explicit edit transition for generic text without turning the fullscreen viewer into a new rich-text editor.

**Non-Goals:**

- Building a WYSIWYG Markdown editor or reproducing the reference image's formatting toolbar.
- Adding persisted zoom, fullscreen layout, or editor state to the Canvas document schema.
- Converting Script, Document, Fountain, or future creator resources into one generic text model after import.
- Replacing domain-specific editors or the existing Shot creator workbench.

## Decisions

### 1. Declare fullscreen presentation on `NodeTypeDescriptor`

Add an optional package-local descriptor declaration that may be a static value or a resolver over the current node, with these semantic values:

- `image-viewer`: frameless image inspection with transient zoom;
- `visual-stage`: image, video, and audio inspection;
- `text-document`: formatted Markdown or whitespace-preserving plain text with explicit edit mode;
- `workbench`: generic structured content using existing container blocks;
- `shot-workbench`: the existing specialized Shot overlay.

Both fullscreen entry points and `ContentOverlay` use the same canonical resolver. Core Media resolves `image-viewer` only when durable `mediaType` is `image`; video/audio continue to resolve `visual-stage`. If the declaration is absent or resolves to no presentation, no fullscreen action is exposed and programmatic overlay resolution rejects the request. This replaces presentation-category heuristics such as “all foundational nodes” or “all structured nodes” without hard-coding material routing inside the overlay.

Alternative considered: infer the layout from node type inside `ContentOverlay`. Rejected because it would duplicate eligibility logic in controls and become a growing type switch as new creator nodes appear.

### 2. Treat Text format as the rendering contract

The `text-document` body reads `TextCanvasNode.data.format` directly:

- `markdown` renders through the existing safe `MarkdownDocumentView`;
- `plain` renders literal text with preserved whitespace and line breaks;
- edit mode uses a controlled textarea and updates only the node's content field.

Preview is the default fullscreen state. An explicit edit action switches the same overlay to editing, and cancel/preview returns to the matching renderer. Annotation can use the same plain document presentation through a narrow content adapter, but Script and Document remain outside this generic path because their lifecycle belongs to owning editors.

Alternative considered: render every text-like extension as Markdown. Rejected because characters such as `#`, `*`, and screenplay syntax are user content in plain/Fountain files and must not silently acquire Markdown semantics.

### 3. Give image media a frameless zoomable viewer and retain the general media stage

The image viewer occupies the entire overlay viewport, omits generic node chrome, uses an opaque dark surface, and keeps only a top-right close action plus a bottom-centered `− / percentage / +` control. The 36px-or-larger controls retain accessible names. Zoom starts at fit-baseline `100%`, is bounded from 25% to 400% in 25% steps, and is discarded on close. The image remains centered with contain sizing at baseline; the viewer owns scrolling when zoom exceeds its viewport.

Video and audio retain the general visual stage with the common overlay header and their existing playback renderers. The visual stage removes generic action-bar padding and renders the preview using full-bleed content chrome. The stage owns the available body height, uses an opaque dark surface, centers the media, and preserves aspect ratio.

The preview registry removes the overlay `52vh` cap only for full-bleed visual-stage rendering. Embedded Canvas previews and contained generic workbench previews keep their existing sizing contracts.

Alternative considered: scale the Canvas node card itself. Rejected because it would preserve irrelevant node chrome and couple image inspection to node layout. Also rejected globally removing preview limits because it would change embedded node layout and structured workbench blocks unrelated to fullscreen.

### 4. Preserve specialized creator workbenches

Shot continues through `ShotCreatorOverlayBody`. Other descriptors opt into `workbench` only when their current container content is useful in fullscreen. Generic workbenches use a centered maximum width, a single vertical scroll owner, and opaque surfaces. Spatial containers and resources with external/owning editors do not automatically receive fullscreen.

This is the extension point for future screenplay node types: they can declare a workbench profile or add a specialized presentation adapter without changing imported text-file behavior.

### 5. Centralize display-title resolution

The overlay and node header must show the same title. Move the existing node display-title resolution into a package-local helper that prefers explicit node data/provenance names before localized type fallbacks. This prevents an imported `Untitled-1` Text node from becoming “新文本” only in fullscreen.

### 6. Keep overlay state transient and accessible

Edit/view state stays local to the mounted overlay. Closing or pressing Escape leaves the node data intact and discards only transient UI state. The overlay keeps an accessible label, close button, focusable controls, and one scroll owner per presentation.

## Risks / Trade-offs

- **Descriptor coverage drift**: a new node type may omit fullscreen metadata. This is intentional fail-visible behavior; tests cover registered descriptors and unsupported controls remain hidden.
- **Large Markdown tables**: tables can exceed the readable column width. The document content region permits local horizontal overflow without making the entire modal scroll in two axes.
- **Large text editing cost**: a controlled textarea can be expensive for very large files. This change does not introduce a virtualized editor; imported snapshots remain intended for review/light edits, while owning file editors handle large source resources.
- **Zoomed image overflow**: transformed content can exceed its original layout box. The image viewer reserves a zoom-proportional stage and gives that stage the sole scroll owner so enlarged content remains reachable.
- **Media controls differ by kind**: this is intentional material routing. Image receives inspection controls, while video/audio retain controls provided by their existing preview renderers.

## Migration Plan

No durable data migration is required. Existing `TextCanvasNode.data.format` values become authoritative in fullscreen. Descriptor metadata changes runtime eligibility only. If a node type previously exposed a generic fullscreen action but receives no profile, its owning open/editor action remains the canonical path.

## Open Questions

None. Additional specialized presentations should be selected from durable node/material contracts rather than inferred ad hoc from Canvas card appearance or file-name extensions.
