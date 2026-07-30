## 1. Presentation contracts

- [x] 1.1 Add presenter-level tests for attention-only unanchored work-item selection.
- [x] 1.2 Add component tests that distinguish assistant document blocks from user prompt bubbles.
- [x] 1.3 Add Tool output tests proving structured outputs receive a localized result section while plain Markdown filenames do not.

## 2. Document timeline implementation

- [x] 2.1 Replace assistant Markdown bubble surfaces with reusable full-width document block styling in both message-level and flattened content-block render paths.
- [x] 2.2 Align assistant content blocks and process summaries into one message-owned document rail without changing owner message identities.
- [x] 2.3 Update process summary accessibility and virtual-list height estimates for document-flow layout.

## 3. Work items and outputs

- [x] 3.1 Move unanchored work-item filtering into a pure presenter and restrict the shelf to queued, processing, and failed items.
- [x] 3.2 Add an attention-shelf heading and status semantics without creating a parallel task state.
- [x] 3.3 Group structured Tool attachments, artifact transfers, openable file results, and generated media under a localized produced-output heading.

## 4. Validation

- [x] 4.1 Run focused Agent Webview presenter and component tests.
- [x] 4.2 Run affected package typecheck/build plus `git diff --check`.
- [x] 4.3 Run the repository quality review for architecture, reuse, accessibility, and legacy-path regressions.
- [x] 4.4 Validate the conversation document timeline in the packaged Desktop Agent surface and record any historical-data residual risk.
