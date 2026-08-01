## ADDED Requirements

### Requirement: EPUB waterfall content is horizontally centered
The Preview Webview SHALL horizontally center each live EPUB waterfall chapter canvas within the
available viewport and SHALL use the same alignment rule when measuring that chapter offscreen.

#### Scenario: Chapter is narrower than the Preview viewport
- **WHEN** an EPUB waterfall chapter is rendered at its configured maximum width in a wider Preview viewport
- **THEN** the live chapter canvas and its measured layout use equal automatic inline margins

### Requirement: EPUB image pages preserve centered containment
The Preview Webview SHALL center raster images and SVG page canvases containing images, preserve
their aspect ratio, and constrain their width to the available EPUB content area.

#### Scenario: Fixed-layout chapter contains an SVG image page
- **WHEN** a fixed-layout EPUB chapter renders an SVG element containing an image
- **THEN** the SVG page canvas is displayed as a centered block no wider than its content area with automatic height

#### Scenario: Chapter contains a raster image
- **WHEN** an EPUB chapter renders a raster image
- **THEN** the raster image is displayed as a centered block no wider than its content area with automatic height

### Requirement: EPUB view modes share image-page alignment
The Preview Webview SHALL apply the centered image-page presentation in both waterfall and
paginated EPUB view modes.

#### Scenario: User switches to paginated mode
- **WHEN** epub.js renders an image-based chapter in paginated mode
- **THEN** its registered theme centers and width-constrains raster images and image-bearing SVG page canvases
