# @neko/text-editor-webview

Browser-only Milkdown Rich and CodeMirror Source presentations for an exact
`@neko/text-editor-domain` session. Markdown exposes `Rich | Source | Split`; admitted non-Markdown
text continues to use CodeMirror. Both editor projections submit to the same edit sequence and
reconcile only from the accepted session projection.

`@neko/markdown` owns GFM round-trip assessment, heading ranges and reference inventory. Constructs
that require a source-preserving adapter keep their original source and expose a document-local Source
action instead of mounting a lossy Rich mutation path. Milkdown is loaded only when Rich is visible.
The Root owns focus, selection, viewport, split and outline presentation only; source, dirty state and
save authority remain in the injected host runtime.

The package has no Node or Electron dependency and is intended to be lazy-loaded only for a visible
`text-editor` Workbench View.
