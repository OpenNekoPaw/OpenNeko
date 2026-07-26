## Why

Preview still contributes panoramic image/video custom editors and commands even
though panoramic playback has been retired. Agent and Canvas route files into
those view types through a shared contract, so hiding only the Preview menu
would leave dead commands and runtime failures. Video controls also render a
legacy red connection dot that users interpret as the removed neko-engine
status.

## What Changes

- Remove panoramic image/video custom editors, commands, menus, settings,
  Webview entries, providers, routing contracts, and tests.
- Remove Agent and Canvas routing to the retired Preview view types. Ordinary
  videos continue through `neko.videoPreview`; images and other files use their
  normal VS Code editor.
- Remove Canvas's dead panoramic-thumbnail message path and stop tagging
  generic Preview variants through the retired panorama route.
- Preserve Model Preview's 3D panoramic-environment staging as a separate
  capability, and rename its source authorization boundary so it cannot be
  mistaken for the retired viewer.
- Remove the obsolete connection dot from video controls while retaining the
  internal playback-session state required for pause/resume and seek.

## Impact

- Affects `neko-preview`, `neko-agent`, `neko-canvas`, and the shared
  `@neko/shared` type exports.
- Removes unpublished command IDs and custom-editor view types beginning with
  `neko.preview.panoramic`.
- Does not remove 3D Reference panorama environments or generic Preview asset
  registration/variant contracts.
