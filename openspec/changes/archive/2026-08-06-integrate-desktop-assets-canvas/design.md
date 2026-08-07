## Current design

Assets owns a browser-safe Resource Browser over injected services. Desktop Main owns workspace IO,
authorization, search/import effects and resource materialization. Canvas owns `.nkc`, document/session
identity, authoring commands and renderer state projection.

Renderer mounts the package-owned Roots and uses fixed typed preload ports. All requests carry Project,
Workspace, View/document, session, request and command identity. A stale sender, mismatched session or
superseded request fails visibly. Absolute paths, cache handles and arbitrary commands never cross the
boundary.

The Canvas session owner serializes mutations, and the Webview Host serializes renderer-originated
operations before material-action projections.
A material-action query scheduled in the same renderer turn as a later `canvasStatus` enqueue waits
until that local queue is stable before crossing IPC. Exact request identity prevents a late material
action result from replacing a newer query, while exact session identity prevents another View or
document owner from participating.

Global Asset Center and Project Resource Dock remain separate presentation owners. Project resources
use Files/Media/Materials facets; global and workspace-linked library registries keep separate lifecycle
and identity. Canvas supports compact View switching and at most two explicit different Board Views,
without duplicate document owners.

## Remaining gate

Run focused shared UI/Canvas/resource tests and typechecks, strict OpenSpec, then an isolated Electron
scenario proving the actual Assets and Canvas Roots, node authoring, resource playback, two-View
isolation and cleanup. Browser-only or demo surfaces do not qualify.

## Playback interaction ownership follow-up

Canvas media nodes distinguish transient hover playback from explicit manual playback. Pointer enter
may acquire the transient owner and pointer leave stops only that owner. A media control gesture
transfers ownership to the manual interaction; later pointer leave cannot stop, restart or replace
that playback. The package-owned Preview surface reports the explicit user playback intent back to the
Canvas node, while Desktop continues to own only the authorized media stream boundary.

Storyline transport requests are the immediate command authority for the current media unit. The
Preview control must consume the request's `playing` or `paused` state in the same render that receives
its request identity instead of waiting for a separately projected session state update. The session
store remains the durable presentation projection, but cannot override or delay the exact transport
command that produced it.

3D model thumbnails are desirable visual projections, but the current image/video thumbnail factory
cannot produce them and a generic file icon must not be reported as a model thumbnail. A later Preview
and Assets contract extension should capture a disposable image after the package-owned model viewer
successfully loads the exact source fingerprint, accept capture only for the current request identity
and retain the model icon until the capture is available. It must not persist an absolute path or
introduce a second 3D renderer in Canvas or Desktop.
