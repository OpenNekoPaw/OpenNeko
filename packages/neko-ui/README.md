# @neko/ui

`@neko/ui` is the canonical React UI surface for OpenNeko Webviews.

## Public Entrypoints

| Entrypoint | Responsibility |
|------------|----------------|
| `@neko/ui` | Curated Webview UI exports |
| `@neko/ui/viewport` | Viewport shell, overlays, toolbar, prediction, diagnostics, and semantic workflow test utilities |
| `@neko/ui/primitives` | Base UI primitives including buttons, overlays, selection, tabs, menus, scroll, and status controls |
| `@neko/ui/creative` | Creative editor DTOs and PropertyPanel, TreeView, NumberInput, NumberSlider, ColorPicker, ColorSwatch, and keyframe controls |
| `@neko/ui/icons` | Shared SVG icons and codicon mapping helpers |
| `@neko/ui/hooks` | React/Webview hooks re-exported from the legacy shared component surface during migration |
| `@neko/ui/test-utils` | Boundary, a11y, focus, and token assertion helpers |

## Viewport Compatibility

The existing viewport exports remain behavior-compatible during the UI design system migration:

- `ViewportShell`
- `OverlayRenderer`
- `ViewportToolbar`
- `ViewportPredictionLayer`
- viewport local state reducers and input helpers
- frame metadata bridge
- overlay diagnostics helpers
- semantic viewport workflow test helpers

## Boundaries

- Do not import `vscode` or call `acquireVsCodeApi()` from this package.
- Do not import feature packages such as Cut, Model, Puppet, Sketch, Canvas, Agent, Market, Tools, Preview, Audio, Live, or Story.
- Do not execute engine, media, or viewport authority logic here; render DTOs and invoke callbacks owned by callers.
- New UI styles consume `--neko-*` or VSCode theme variables.
- New control icons enter through `@neko/ui/icons` or an explicit codicon mapping.

## P2 Creative Placeholders

`AssetBrowser` and `MediaTransportControls` remain documented P2 placeholders until a migrated package needs them. `AssetBrowser` must align with the asset federation registry DTOs before gaining a shell. `MediaTransportControls` must be introduced by an owning package adapter so playback, compositor, and engine authority stay outside `@neko/ui`.
