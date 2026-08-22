## 1. Canonical batch mutations

- [x] 1.1 Add a pure Canvas selection translation helper covering locked nodes, nested containers, movement roots and stable deltas.
- [x] 1.2 Replace the single-node move store contract with one atomic batch move mutation shared by single and multi-selection gestures.
- [x] 1.3 Add atomic selected-node front/back and lock mutations that preserve relative order and produce one history snapshot.
- [x] 1.4 Add store tests for batch movement, parent/child de-duplication, locked nodes, container membership, z-order, locking, operation projection and one-step undo.

## 2. Selection and gesture integration

- [x] 2.1 Route BaseNode real-time drag events through InfiniteCanvas and render the complete batch preview with the same translation helper used by commit.
- [x] 2.2 Preserve an existing multi-selection during drag, select an unselected drag target explicitly and suppress the post-drag click collapse.
- [x] 2.3 Fix Shift/Command/Control additive click and marquee selection without clearing the gesture-start selection.
- [x] 2.4 Hide resize and rotate handles for multi-selection while preserving selection outlines and single-node behavior.

## 3. Batch command presentation

- [x] 3.1 Add multi-selection Duplicate and Delete actions to the selection toolbar using the existing clipboard and deletion owners.
- [x] 3.2 Route context-menu front/back/lock actions through complete-selection store mutations and keep right-click selection semantics explicit.
- [x] 3.3 Add component and interaction tests for multi-drag preview/commit, additive marquee, toolbar commands, context commands, handle visibility and adjacent single-node behavior.

## 4. Verification and review

- [x] 4.1 Run focused Canvas Webview tests/build, formatting, OpenSpec validation and relevant boundary checks.
- [x] 4.2 Use `neko-ui-validation` to inspect multi-selection, active drag, post-drag, mixed locked state, toolbar/menu and single-selection return states in the authoritative Canvas runtime.
- [x] 4.3 Use `neko-quality-review` to audit L1 Webview ownership, unique mutation paths, history semantics, test evidence and residual risk.
