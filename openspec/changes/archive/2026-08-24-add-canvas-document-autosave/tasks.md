## 1. Canonical persistence contract

- [x] 1.1 Change `replace-document` to carry the current removed-node evidence and reduce `save` to an immediate flush intent; update strict parsers, IPC producer/consumer fixtures and poison tests atomically.
- [x] 1.2 Move pending removal authority into `CanvasHostRuntimeSession`, including restore replacement, successful-clear and failed-save retention tests.

## 2. Host-owned autosave policy

- [x] 2.1 Add a configurable 800ms trailing autosave scheduler to the Canvas Host session and route every dirty document commit through it while excluding presentation changes.
- [x] 2.2 Make explicit Save cancel the timer and flush the same serialized save path without a redundant clean write.
- [x] 2.3 Add deterministic fake-timer tests for continuous edits, latest-snapshot coalescing, explicit flush, retry after failure, presentation exclusion and dispose cancellation.

## 3. Webview and Desktop integration

- [x] 3.1 Update Webview Host status synchronization so each canonical document replacement carries pending deletion evidence and a successful save clears the Webview-side delta projection.
- [x] 3.2 Preserve drag/resize/rotate preview-versus-end behavior and add path-level tests proving pointer movement does not commit a document change while gesture end does.
- [x] 3.3 Update Desktop guardrails and focused runtime tests to prove autosave still uses the authorized NKC codec, deletion conflict validation and temporary-file atomic replacement.

## 4. Verification and review

- [x] 4.1 Run focused Canvas domain/Webview/Desktop tests and typechecks plus `pnpm check:openspec`.
- [x] 4.2 Use `neko-ui-validation` for Markdown editing, node drag finalization, viewport-only interaction and save-failure visibility; record authoritative runtime limits.
- [x] 4.3 Use `neko-quality-review` to audit L2 contract risk, unique save ownership, async races, user-data safety, validation evidence and residual multi-View/crash-recovery risk.
