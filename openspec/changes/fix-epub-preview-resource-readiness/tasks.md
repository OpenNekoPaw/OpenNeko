## 1. Freeze The Failure Contract

- [x] 1.1 Add a deterministic readiness test that holds epub.js archive resource opening pending and proves Preview cannot advance on metadata readiness alone.
- [x] 1.2 Add image settlement tests that distinguish a decoded image from an errored or complete-without-dimensions image.

## 2. Implement The Canonical Readiness Path

- [x] 2.1 Replace metadata-only readiness with one `book.opened` barrier fenced by the current EPUB load epoch.
- [x] 2.2 Propagate attached visible chapter image failures to the existing Preview document diagnostic while ignoring stale chapter work.
- [x] 2.3 Confirm the implementation adds no retry, fallback renderer, Desktop archive access, or parallel resource readiness path.

## 3. Verify The Webview

- [x] 3.1 Run the focused EPUB regression suite and affected Preview Webview typecheck/build; record unrelated package blockers in `evaluation.md`.
- [x] 3.2 Run OpenSpec strict validation, `git diff --check`, and inspect the focused change for unsafe assertions, logging, and legacy/fallback debt.

## 4. Qualify The Desktop Path

- [x] 4.1 Build or package the affected Electron Desktop application and open an isolated image-based EPUB through the real Preview path.
- [x] 4.2 Record initial cover/page rendering, console/resource errors, delayed recovery behavior, commands, blockers, and residual risk.
- [x] 4.3 Run `neko-quality-review` and record the final risk classification and applicable quality-gate results.
