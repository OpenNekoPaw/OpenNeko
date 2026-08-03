## Current design

Assets owns a browser-safe Resource Browser over injected services. Desktop Main owns workspace IO,
authorization, search/import effects and resource materialization. Canvas owns `.nkc`, document/session
identity, authoring commands and renderer state projection.

Renderer mounts the package-owned Roots and uses fixed typed preload ports. All requests carry Project,
Workspace, View/document, revision and renderer epoch. A stale sender, revision or resource generation
fails visibly. Absolute paths, cache handles and arbitrary commands never cross the boundary.

The Canvas Webview Host serializes renderer-originated mutations before revisioned read projections.
A material-action query scheduled in the same renderer turn as a later `canvasStatus` enqueue waits
until that local queue is stable before crossing IPC. This prevents a normal package-local ordering
race from being reported as a stale remote request while preserving fail-visible CAS rejection for a
genuinely stale View or concurrent external owner.

Global Asset Center and Project Resource Dock remain separate presentation owners. Project resources
use Files/Media/Materials facets; global and workspace-linked library registries keep separate lifecycle
and identity. Canvas supports compact View switching and at most two explicit different Board Views,
without duplicate document owners.

## Remaining gate

Run focused shared UI/Canvas/resource tests and typechecks, strict OpenSpec, then an isolated Electron
scenario proving the actual Assets and Canvas Roots, node authoring, resource playback, two-View
isolation and cleanup. Browser-only or demo surfaces do not qualify.
