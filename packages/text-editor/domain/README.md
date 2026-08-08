# @neko/text-editor-domain

Host-neutral application owner for bounded workspace text admission, exact document sessions,
revisioned edits, dirty state, JSON diagnostics, canonical Fountain projection, save conflicts and
close decisions. Workspace bytes remain authoritative through the injected `@neko/content` reader
and writer ports.

Session failures are local to the exact Window document identity. The package has no React,
Electron, Node or raw-path access and exposes one public editing path for the Window UI. Agent content
authoring changes authoritative Workspace files through the native file path and is observed here as
an external file change; it does not create or consume a Text Document session.
