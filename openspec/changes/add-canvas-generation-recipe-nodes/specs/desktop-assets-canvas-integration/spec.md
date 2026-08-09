## MODIFIED Requirements

### Requirement: Canvas add-node catalog is owned by the Desktop Canvas surface

The package-owned Canvas Root SHALL render and route one add-node catalog in Desktop. The catalog
SHALL expose Text, Table, Image, Video, Audio and 3D Director in that order.
Text, Image, Video and Audio SHALL create the matching kind of canonical Generation Node; Table SHALL
create canonical editable GFM Markdown, and 3D Director SHALL retain its model source intent that
resolves to a canonical file reference. Generation Node selection SHALL expose the package-owned
Recipe editor as a detached input panel for prompt/reference information, exact model and legal
type-specific parameters, while the node itself renders only content/type/status; no
second quick-generate dialog or Agent composer direct mode SHALL be required. The popover SHALL use
compact Canvas control density and explicit Portal-safe global Neko surface, border, foreground, hover
and shadow tokens; the Desktop shell MUST NOT substitute app-local sizing, item surfaces, colors or
focus treatment.

#### Scenario: Desktop consumes the real add-node intents

- **WHEN** a user opens the Canvas add-node menu in Desktop
- **THEN** Desktop renders the package-owned ordered catalog and localized labels
- **AND** the popover uses neutral Portal-safe Neko foreground, hover, badge and elevated surface treatment at compact Canvas density without oversized card icons or a duplicate focus outline
- **AND** Text/Image/Video/Audio create empty canonical Generation Nodes whose selected state exposes their matching Recipe controls
- **AND** those Recipe controls are visually and structurally separate from both the existing selection action toolbar and the durable content node
- **AND** Table creates editable GFM table content without a legacy table node type
- **AND** 3D Director requests a model source and uses the package-owned model Preview path without gaining a placeholder Generation kind
- **AND** the Desktop shell does not render a local duplicate menu, generation form, viewer, no-op item or compatibility fallback

#### Scenario: Existing media is added to Canvas

- **WHEN** a user imports, drags or references an existing image, video or audio resource rather than choosing its Generation add action
- **THEN** Canvas creates the canonical typed Media Node through the existing source intent
- **AND** it does not attach a Generation Recipe or route the operation through a GenerationJob
- **AND** selecting it does not render the detached Generation input panel
