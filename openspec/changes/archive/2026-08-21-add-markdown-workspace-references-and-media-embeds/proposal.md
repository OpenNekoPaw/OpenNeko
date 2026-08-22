## Why

OpenNeko can parse mentions and Workspace resource tokens, but the Text Editor cannot discover or
resolve them while authoring, and its Rich/Split surfaces cannot present authorized Workspace media.
Creators therefore have to type fragile paths manually and cannot verify an embedded asset without
leaving the document.

## What Changes

- Add context-aware Markdown Source assistance for portable GFM snippets, `@` mentions and
  `[[resource]]` / `![[resource]]` Workspace references without introducing an LSP or private file
  format.
- Resolve authoring candidates through one exact Workspace-qualified catalog and preserve explicit
  unresolved, ambiguous and unauthorized diagnostics instead of choosing an active/recent resource.
- Render CommonMark images and Neko embedded-resource syntax from stable Workspace-relative tokens
  through authorized, short-lived resource projections; never persist raw local paths or runtime
  URLs in Markdown.
- Add typed image, audio and video presentation with bounded controls and resource release while
  keeping unsupported media visible as source-backed references.
- Preserve `.md` bytes and the Text Document session as the only authoring authorities; completion
  and media presentation remain disposable projections.

## Capabilities

### New Capabilities

- `markdown-workspace-references-and-media-embeds`: Defines Markdown authoring assistance, exact
  Workspace reference resolution and authorized image/audio/video embedding across Source, Rich and
  Split presentation.

### Modified Capabilities

None.

## Impact

- `@neko/markdown` owns trigger recognition, portable insertion text, extension/source ranges and
  resolver-independent authoring projections.
- `@neko/text-editor-domain` owns the Workspace-qualified document/session contracts used to request
  candidates and authorized media projections; it does not own filesystem access or browser UI.
- `@neko/text-editor-webview` owns CodeMirror completion UI and Rich/Split media presentation without
  becoming a file or resource authority.
- `@neko/content`, `@neko/assets` and `@neko/media` provide existing file identity, media
  classification and authorized-byte capabilities through narrow injected ports.
- `apps/neko-desktop` remains the Electron composition and trust boundary: it binds the exact
  Workspace/document request to existing resource authorization and opaque URL transport, without
  parsing Markdown or selecting business results.
- Existing Markdown files are not migrated or rewritten on open. No new production Markdown engine,
  LSP, raw-HTML media path or direct Renderer filesystem access is introduced.
