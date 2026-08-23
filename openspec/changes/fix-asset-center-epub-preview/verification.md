## Verification Summary

Risk classification: L2 Node/runtime boundary change. The implementation reuses the existing Desktop resource authorization and protocol registry, but adds Preview-owned archive publication and an Asset Center consumer. No IPC shape, renderer trust, persistent data or user file is changed.

## Automated Evidence

- `@neko/preview-node`: 1 file / 3 tests passed; typecheck passed.
- `@neko/assets-node`: 20 files / 100 tests passed; typecheck passed.
- Focused Desktop Preview runtime: 1 file / 17 tests passed; Desktop typecheck passed.
- Package-role catalog: 58 packages passed.
- Package-boundary analysis: 58 packages passed with no findings.
- Strict TypeScript config audit passed, including the new Preview Node package.
- Full strict OpenSpec validation: 158/158 passed.
- `git diff --check` passed.

Path-level evidence proves that Asset Center EPUB publication invokes `registerResourceTree` once and poisons `registerFile`; ordinary preview files retain the existing single-file path. Desktop Preview's previous private archive implementation was deleted and now delegates to `@neko/preview-node`.

## UI Validation

**Scope:** Asset Center Media Library selection, Desktop authorized resource publication and EPUB Webview rendering. Applicable because the defect only appears across the real Electron Main/Renderer/Webview boundary.

**Authoritative runtime:** visible development Electron started from this worktree through the normal Desktop development entry. The persisted Media Library and ordinary sidebar navigation were used; no fixture database, direct IPC or raw-path renderer shortcut was used.

**Acceptance evidence:**

- Opened Media Library → Blame and selected `[Kmoe][BLAME！(新裝版)]卷01.epub` (315.7 MB).
- The previous `EPUB virtual directory URL must end with a slash.` diagnostic did not appear.
- The existing EPUB Viewer rendered the book cover and exposed previous/next chapter plus reading-mode controls. Accessibility projected the book navigation and a 402-item content surface.
- Returned to Media Library → Media and selected `test.mp3` (3.5 MB). The ordinary preview loaded the existing audio surface with title, duration, seek, mute and playback controls.
- The EPUB and MP3 remained local read-only resources; no import, move, deletion or source-file mutation was performed.

**Result:** passed for the targeted valid EPUB flow and adjacent ordinary-file Preview regression.

## Quality Review

No blocking finding. Preview owns the format-specific publication rule, Content owns archive access, Assets owns selection/session projection, and Desktop owns renderer-session authorization. The change establishes one canonical EPUB success path, keeps malformed archive failures local and visible, and ties archive disposal to the exact Desktop resource registration.

Residual risk: malformed and encrypted EPUB behavior is covered by focused archive/publication tests rather than direct pixels. The real Electron check used one 315.7 MB EPUB and one MP3 at the current light theme; dark-theme presentation and other EPUB publishers were not separately inspected because the rendering UI itself was unchanged.
