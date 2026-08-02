# @neko/ui

`@neko/ui` is the canonical React UI surface for OpenNeko Desktop renderer packages.

## Public Entrypoints

| Entrypoint                                               | Responsibility                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `@neko/ui`                                               | Curated browser-safe aggregate entry                                     |
| `@neko/ui/primitives`, `./shared-primitives`             | Buttons, overlays, selection, tabs, menus, scroll, and status primitives |
| `@neko/ui/creative`                                      | Property, tree, keyframe, ruler, and seek presentation contracts         |
| `@neko/ui/icons`, `./icons/codicon.css`                  | Shared SVG icons, codicon mapping helpers, and codicon stylesheet        |
| `@neko/ui/hooks`                                         | Reusable React/Webview hooks                                             |
| `@neko/ui/i18n`, `./i18n/react`, `./i18n/webview`        | Host-neutral, React, and DOM-specific i18n entries                       |
| `@neko/ui/theme`, `./theme/tailwind-preset`              | Theme contracts and tokens; explicit Tailwind preset entry               |
| `@neko/ui/foundation`                                    | Browser-safe Webview foundation                                          |
| `@neko/ui/keyboard`, `./keyboard/focus.css`              | Keyboard/focus contracts, dispatcher, and focus stylesheet               |
| `@neko/ui/markdown`                                      | Markdown presentation components                                         |
| `@neko/ui/workbench`, `./workbench/editor-workbench.css` | Creative workbench, Host adapter frame, and stylesheet                   |
| `@neko/ui/error-boundary`                                | Webview error boundary                                                   |
| `@neko/ui/test-utils`, `@neko/ui/utils`                  | Test assertions and small browser-safe utilities                         |

## Boundaries

- Do not import Electron, Node.js, or application host modules from this package.
- Do not import feature packages such as Cut, Model, Puppet, Sketch, Canvas, Agent, Market, Tools, Preview, Audio, Live, or Story.
- Do not execute engine, media, or viewport authority logic here; render DTOs and invoke callbacks owned by callers.
- New UI styles consume canonical `--neko-*` theme variables.
- New control icons enter through `@neko/ui/icons` or an explicit codicon mapping.

## P2 Creative Placeholders

`AssetBrowserPlaceholderProps` and `MediaTransportControlsPlaceholderProps` are type-only planning
contracts; this package does not export working controls for them. A future implementation requires
an owning package adapter so library, playback, compositor, and media authority remain outside
`@neko/ui`.
