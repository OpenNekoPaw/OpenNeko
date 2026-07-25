# NekoCanvas

NekoCanvas is the AI-oriented spatial workspace for OpenNeko. It stores layout,
generic content projections, explicit connections, selection, and viewport state
in `.nkc` files. Domain runtimes such as Job execution, Character, interactive
worlds, and media generation remain owned by their respective services.

## Canonical Model

Current `.nkc` documents persist exactly six node types:

| Node           | Responsibility                                                     |
| -------------- | ------------------------------------------------------------------ |
| `markdown`     | Editable Markdown source                                           |
| `media`        | Image, audio, or video through `data.mediaType`                    |
| `group`        | The only visual container, with ordered `container.childIds`       |
| `job`          | Read-only JobCard projection with stable Job identity and revision |
| `file`         | Generic non-media file reference                                   |
| `canvas-embed` | Nested `.nkc` reference with navigation semantics                  |

Connections have exactly three meanings:

- `sequence`: explicit reading or playback order
- `reference`: one node consumes or mentions another node
- `derived-from`: provenance from an input to a generated result

The left-toolbar add popover and Canvas context menu share one action catalog:

```text
Create: Markdown / Group
Import: Image / Audio / Video
Reference: File / Subcanvas
```

Only Markdown and Group can be created empty. Image, Audio, Video, File, and
Subcanvas first bind a durable source through the Extension Host. JobCard is
absent from user and generic Agent creation surfaces; an owning Job service may
publish a complete Job projection. Canvas has no Basic/Professional mode,
persistent right-side node library, or Character placeholder.

## Preview

Preview is a surface inside the Canvas editor Webview, not a second editor.
Markdown and playable Media become preview units. Group ordering can project a
simple sequence from `childIds` and explicit `sequence` connections. Job and File
remain status/open-source surfaces and are not interpreted as executable content.

Canvas does not infer Storyboard, branching Narrative, Character behavior, or Job
execution from Markdown, positions, or legacy fields.

## Source Input

- Image, audio, and video sources create `media`.
- Markdown and supported text snapshots create `markdown`.
- Other named files, including extensionless files, create `file`.
- `.nkc` sources create `canvas-embed`.

Webview code sends source intent through `project:addSource`. Extension Host owns
workspace IO, path authorization, text decoding, and durable path contraction.
Runtime Webview URLs, blobs, cache paths, and temporary paths are never persisted
as source identity.

## Migration

Legacy node discriminators are accepted only by the versioned `.nkc` load codec.
The migrator deterministically converts readable content and stable media/file
references to the canonical model. Current-format documents containing removed
node types or root Narrative/Behavior/Entity/Memory state fail validation.

Production renderers, authoring tools, Preview, Extension handlers, and Agent
context do not provide a legacy fallback.

## Packages

```text
packages/domain     host-neutral Canvas delivery and authoring services
packages/extension  VS Code CustomEditor, file IO, resource authorization
packages/webview    React/Zustand infinite-canvas UI and Preview
```

Shared contracts come from `@neko/shared`. The Webview never imports VS Code or
Node APIs, and Agent integrations mutate Canvas only through the public authoring
contract.

## Validation

```bash
pnpm --dir packages/neko-canvas test
pnpm --filter @neko-canvas/webview build
pnpm --filter @neko-canvas/extension build
```

VS Code Webview behavior must also be verified in an Extension Development Host.
