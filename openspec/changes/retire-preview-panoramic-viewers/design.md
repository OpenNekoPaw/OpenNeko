## Context

The retired panoramic viewer is a vertical feature slice:

- Preview owns two providers, two Webview entry points, manifest contributions,
  commands, configuration, routing, and viewer-specific API types.
- Shared types publish the routing decision and view/command identifiers.
- Agent uses that decision when opening files and registers dead rich-content
  kinds that claim to open an interactive panoramic Preview.
- Canvas uses it for media preview, delegated preview, a dead panoramic
  thumbnail message, and projection metadata.
- Model Preview separately stages panoramic images as 3D environments.

The video control connection dot is only a visual projection of
`VideoPlayer.isConnected`. That state now means that the current native-video /
PCM playback descriptors remain reusable; it is not an Engine health state.

## Five-layer analysis

- **Responsibility:** VS Code's normal video/audio editors own file opening;
  Model Preview owns 3D environment staging; no package owns panoramic
  playback after this change.
- **Dependency:** Agent and Canvas stop depending on Preview-specific view
  identifiers. Agent also stops advertising the retired rich-content kinds.
  Shared types stop exporting a route whose implementation no longer exists.
- **Interface:** `FileOpenViewer` returns only `default`, `video`, or `audio`.
  `VideoControls` no longer accepts a connection-status presentation prop.
- **Extension:** a future panoramic viewer would require a new OpenSpec and a
  new complete vertical slice rather than reviving hidden identifiers.
- **Testing:** package manifest, source-boundary, Agent opening, and Preview
  control tests prove the retired route cannot be selected and the old dot is
  absent.

## Decisions

### Delete the vertical viewer slice

The canonical result contains no panoramic Preview custom editor, command,
menu, setting, provider, Webview entry, routing function, or shared identifier.
Agent no longer registers `panoramic-image` or `panoramic-video` rich-content
kinds because their only action delegated to that retired Preview.
There is no compatibility command or fallback because the product is
pre-release and the viewer is intentionally retired.

### Route ordinary media by media type only

Agent and Canvas route supported videos to `neko.videoPreview` and supported
audio to `neko.audioPreview`. Images and unrecognized files use `vscode.open`.
Names such as `_360` and HDR/EXR extensions no longer redirect to a retired
viewer.

### Preserve only the 3D environment boundary

Model Preview continues to authorize bounded local HDR/EXR/image sources for a
3D environment. The source authorization file moves under `providers/model`
and is named for that responsibility. Generic Preview manifests retain
projection metadata because 3D reference capture and future non-viewer
consumers use that media contract.

### Remove presentation, retain playback ownership

`VideoPlayer.isConnected` remains private state because it controls
pause/resume and descriptor reuse. `VideoControls` does not receive or display
that state. Capability failures remain explicit localized notices.

## Risks

- Existing user keybindings for removed panoramic commands stop resolving;
  this is an intentional pre-release breaking cleanup.
- HDR/EXR files return to the normal VS Code editor unless opened as a Model
  Preview environment.
- Removing Canvas's dead thumbnail message is safe only if no Webview producer
  exists; the source audit and regression boundary test enforce that fact.
