## ADDED Requirements

### Requirement: Shared image previews preserve the complete intrinsic image

The canonical Preview image Viewer SHALL display the complete image at its initial and reset presentation while preserving the intrinsic aspect ratio. The image SHALL fit within both the available width and height without stretching or clipping, including portrait, landscape and extreme aspect ratios. Unused space MAY remain visible when the image and Viewer ratios differ.

#### Scenario: Portrait image appears in a Canvas node

- **WHEN** a portrait image is rendered in a shorter or wider Canvas node through `LightweightPreview`
- **THEN** the top, bottom, left and right image bounds remain visible inside the node
- **AND** the rendered image keeps its intrinsic aspect ratio
- **AND** the Canvas node's durable size is not rewritten

#### Scenario: Image opens in Canvas fullscreen preview

- **WHEN** the same image is opened in the Canvas fullscreen Overlay
- **THEN** the initial presentation contains the complete image within the available stage
- **AND** it uses the same canonical image Viewer as the node Surface

### Requirement: Explicit image zoom remains local to the Viewer

The full-control image Viewer SHALL continue to allow explicit zoom and pan within its own clipped stage. Reset SHALL restore the complete contain presentation. Viewer zoom input SHALL NOT resize the caller container or propagate to the Canvas viewport.

#### Scenario: User zooms and resets a fullscreen image

- **WHEN** the user zooms or pans a fullscreen image and then invokes reset
- **THEN** only the image presentation changes during the interaction
- **AND** reset returns the complete image to the contain presentation
- **AND** the Canvas viewport and durable node size remain unchanged

### Requirement: Image fit has one Preview-owned implementation

Lightweight Preview, Main Preview and Canvas fullscreen image presentations SHALL use the same `SharedImagePreview` native `<img>` implementation. Canvas callers SHALL NOT add a second intrinsic-size calculation, caller-specific image element or fallback source to repair image fit.

#### Scenario: One image Surface fails

- **WHEN** one image descriptor fails to load
- **THEN** only that Surface shows the Preview-owned local diagnostic
- **AND** sibling media Surfaces and the Canvas workspace remain available
