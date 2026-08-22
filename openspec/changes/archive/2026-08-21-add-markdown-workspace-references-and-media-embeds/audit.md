## 2026-08-09 implementation audit

### Reusable canonical owners

| Concern                   | Owner / path                                                    | Reuse decision                                                         |
| ------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| GFM and extension parsing | `@neko/markdown` parser, extension projection and source ranges | Reuse for trigger eligibility, insertion ranges and resolved semantics |
| Text authoring authority  | `@neko/text-editor-domain` `TextDocumentSession`                | Every completion remains one ordinary revisioned edit                  |
| Source UI                 | `@neko/text-editor-webview` CodeMirror Root                     | Add only a completion adapter; no second editor or buffer              |
| Rich/Split UI             | `@neko/text-editor-webview` lazy Milkdown adapter               | Add presentation only after extension round-trip proof                 |
| Workspace bytes           | `@neko/content` locators/read services                          | Reuse exact Workspace-relative identity and authorization              |
| Media classification      | `@neko/media` contracts                                         | Reuse typed image/audio/video kinds and browser clients                |
| Browser resource delivery | Desktop `DesktopResourceRegistry`                               | Reuse sender-bound opaque URL, Range and release lifecycle             |

### Forbidden reuse and bypasses

- Agent Draft mention search is not reusable as the Text Editor catalog. It requires Agent connection
  and binding receipts and turns selected items into Agent input reference receipts.
- Agent Timeline resource projection is not a document media authority and cannot write render URLs
  or chat DOM into Markdown.
- Resource Browser Preview is a separate visible View/session lifecycle. Its package contracts and
  presenters may guide media behavior, but the Text Editor cannot open a hidden Preview View as an
  embed fallback.
- Renderer code cannot resolve raw paths, use `file:` URLs, inspect linked-library physical paths or
  retry through cache/Agent/Preview sources.

### Current gaps

- Markdown Source has parser highlighting but only Fountain registers a completion provider.
- Existing mention/resource parser contracts resolve only when a caller supplies candidates; Text
  Editor supplies none.
- CommonMark images and `![[...]]` have semantic tokens, but Text Editor has no document-scoped
  authorized media descriptor or lease.
- Milkdown correctly keeps source-preserving extensions read-only because it has no lossless schema
  node for them.

### Overlapping in-flight files

The working tree already modifies `packages/text-editor/domain/src/desktop-bridge.ts`, Desktop Text
Editor Main/renderer runtimes, preload wiring and adjacent Agent/resource files for session recovery
and Agent capability work. Phase 1 therefore changes only new OpenSpec artifacts and clean
`@neko/markdown` files. Later contract/wiring phases must review and preserve those diffs and land in
separate commits.
