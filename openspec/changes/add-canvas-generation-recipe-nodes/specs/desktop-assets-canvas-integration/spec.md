## MODIFIED Requirements

### Requirement: Canvas add-node catalog is owned by the Desktop Canvas surface

The package-owned Canvas Root SHALL render and route one add-node catalog in Desktop. The catalog
SHALL expose Text, Image, Video and Audio in that order. It SHALL NOT expose Table, 3D Director or a
separate Generation node type. Text, Image, Video and Audio SHALL create the matching kind of
canonical Generation Node while presenting it as that base content kind. Generation Node selection SHALL expose the package-owned
Recipe editor as a compact node-anchored input composer for prompt/reference information, exact model
and legal type-specific parameters, while the node itself renders only content/type/status and the
labeled selection toolbar retains compact direct actions; no
second quick-generate dialog or Agent composer direct mode SHALL be required. The popover SHALL use
compact Canvas control density and explicit Portal-safe global Neko surface, border, foreground, hover
and shadow tokens; the Desktop shell MUST NOT substitute app-local sizing, item surfaces, colors or
focus treatment.

#### Scenario: Desktop consumes the real add-node intents

- **WHEN** a user opens the Canvas add-node menu in Desktop
- **THEN** Desktop renders the package-owned ordered catalog and localized labels
- **AND** the popover uses neutral Portal-safe Neko foreground, hover, badge and elevated surface treatment at compact Canvas density without oversized card icons or a duplicate focus outline
- **AND** Text/Image/Video/Audio create empty canonical Generation Nodes whose content presentation matches the corresponding ordinary Text/Image/Video/Audio node and whose selected state exposes matching Recipe controls
- **AND** those Recipe controls form an elevated editor-surface composer fixed below the selected node without reusing the Canvas background, while the labeled toolbar stays fixed above and the durable Generation content node uses an opaque neutral node surface
- **AND** model/provider rows and grouped parameter overlays remain compact and contained by the Canvas viewport even though the overlays render through a Portal
- **AND** Table and 3D Director are absent from both the toolbar add popover and blank-Canvas add submenu
- **AND** the Desktop shell does not render a local duplicate menu, generation form, viewer, no-op item or compatibility fallback

#### Scenario: Existing media is added to Canvas

- **WHEN** a user imports, drags or references an existing image, video or audio resource rather than choosing its Generation add action
- **THEN** Canvas creates the canonical typed Media Node through the existing source intent
- **AND** it does not attach a Generation Recipe or route the operation through a GenerationJob
- **AND** selecting it does not render the Generation input composer
- **AND** dropping its authorized Workspace locator on a Generation composer reference area attaches it as a reference without copying, while external-directory content uses an explicit Workspace import action

#### Scenario: New content uses compact Canvas density

- **WHEN** Canvas authors a new Text, Image, Video, Audio or Generation content node through the Webview, Headless authoring or Workspace Board projection path
- **THEN** the node uses the canonical compact Canvas default for its exact content kind rather than a runtime-specific oversized default
- **AND** at 100% Canvas zoom its default width and height match the former node footprint at 50% zoom, allowing more nodes in the overview without changing the viewport zoom
- **AND** an image projection preserves its intrinsic aspect ratio while using the compact media width
- **AND** manually authored sizes already persisted in `.nkc` remain unchanged when the document is reopened or projected again
- **AND** the creator can still resize the node down to the canonical accessible minimum
- **AND** MiniMap projects top-level node silhouettes and the current visible viewport through one shared world-space scale, so compact dimensions remain proportionally compact instead of being enlarged by content-only normalization
