# canvas-image-node-intrinsic-sizing Specification

## Purpose
TBD - created by archiving change fit-canvas-image-nodes-to-intrinsic-ratio. Update Purpose after archive.
## Requirements
### Requirement: New image nodes preserve intrinsic aspect ratio within a compact bound

Canvas MUST compute a new image node's initial durable size from valid intrinsic width and height. The computed width and height MUST preserve the intrinsic aspect ratio and MUST each be no greater than 120 Canvas units.

#### Scenario: Portrait image is fitted to the bound

- **WHEN** a new image with intrinsic dimensions `800×1200` is authored
- **THEN** its node size is `80×120`

#### Scenario: Landscape image is fitted to the bound

- **WHEN** a new image with intrinsic dimensions `1600×900` is authored
- **THEN** its node size is `120×67.5`

#### Scenario: Extreme image does not consume an unbounded lane

- **WHEN** a new image has an extreme valid portrait or landscape ratio
- **THEN** its long node edge is 120 and its short edge preserves the source ratio

### Requirement: Image sizing is canonical across authoring boundaries

Workspace projection, Host material authoring and Canvas browser File drop MUST delegate valid image dimensions to the same Canvas domain sizing policy. Content metadata parsing MUST have one canonical implementation.

#### Scenario: Host-authored local image uses probed dimensions

- **WHEN** an authorized workspace image or an imported image is committed to Canvas
- **THEN** the Host resolves its intrinsic dimensions and the created node uses the canonical bounded size

#### Scenario: Browser file drop uses the same policy

- **WHEN** a browser File image is dropped and its bytes expose valid dimensions
- **THEN** the dropped asset creates the same node size as Host authoring for those dimensions

#### Scenario: Unknown dimensions remain local

- **WHEN** an image source has no valid or readable intrinsic dimensions
- **THEN** only that new node uses the canonical media default size and unrelated nodes and capabilities remain available

### Requirement: Renderer minimums do not distort image geometry

The Canvas Renderer MUST derive an image node's resize minimum from its current durable aspect ratio instead of applying the generic media minimum independently to both axes.

#### Scenario: Narrow portrait node remains proportional

- **WHEN** an image node has a valid narrow portrait size
- **THEN** its render and stored-size clamps do not widen it to the generic media minimum

#### Scenario: Narrow image remains identifiable

- **WHEN** an image node is narrower than its external title
- **THEN** the title may extend to the canonical image-node maximum edge without changing durable geometry

### Requirement: Existing and user-authored sizes remain authoritative

Canvas MUST NOT recompute image sizes while loading or rendering existing nodes, replacing an Entity representation, or processing an unrelated update.

#### Scenario: Existing image is reopened

- **WHEN** a Canvas containing a previously saved image node is reopened
- **THEN** its durable size remains unchanged

#### Scenario: Entity representation is replaced

- **WHEN** an image representation is explicitly replaced
- **THEN** the existing node identity, position and size are preserved
