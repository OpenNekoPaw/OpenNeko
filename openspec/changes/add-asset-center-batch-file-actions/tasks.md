## 1. Membership Batch Contract

- [x] 1.1 Add atomic `removeMany` and `relocateMany` operations to the Asset Library membership contract with strict identity/path validation.
- [x] 1.2 Implement the SQLite repository operations in one state-write transaction and add producer tests for success, stale identity, target conflict, and all-or-nothing behavior.

## 2. Assets Batch Runtime

- [x] 2.1 Replace the single Asset remove runtime/Host route with canonical batch removal across global-library, Asset Center, renderer adapter, preload, AppHost, and fixtures.
- [x] 2.2 Add package-owned batch move contracts and parsers carrying only exact opaque item identities.
- [x] 2.3 Implement Assets Node move planning, same-owner/root authorization, destination selection port, conflict preflight, rename rollback, Asset membership relocation, and Media Library locator rebuild behavior.
- [x] 2.4 Add Node and domain tests proving valid Asset/Media moves, cancellation, stale/mixed/cross-library rejection, conflict rejection, rollback, preserved Asset identity, and no source-file deletion during batch removal.
- [x] 2.5 Wire the Electron native destination picker as a thin Desktop adapter and add AppHost/preload path-level tests proving sender binding and canonical route delegation.

## 3. Resource Center Interaction

- [x] 3.1 Add deterministic selection helpers for single, toggle, range, select-all, stale reconciliation, and operation capability calculation.
- [x] 3.2 Implement pointer-captured collection marquee selection with a stable threshold, additive modifiers, intersection geometry, cancellation, and no activation from interactive descendants.
- [x] 3.3 Add a responsive batch toolbar with selection count, move, remove, and clear commands using icons and accessible labels.
- [x] 3.4 Replace the Asset trash-only entry interaction with shared selection actions and `@neko/ui` context menus while preserving directory activation, preview, hover, and Media Library connection controls.
- [x] 3.5 Add Webview tests for click/range/toggle/select-all/marquee behavior, right-click selection policy, batch toolbar/menu delegation, disabled mixed operations, preview isolation, and mutation refresh.

## 4. Verification And Review

- [x] 4.1 Run affected local-metadata, Assets domain, Assets Node, Assets Webview, and Desktop tests plus typecheck/build commands.
- [x] 4.2 Run formatting, OpenSpec, application-boundary, legacy-debt, unused-code, and scoped diff checks while preserving unrelated dirty-worktree changes.
- [ ] 4.3 Build and validate a visible Electron Asset Center fixture for grid/list multi-select, marquee, context menu, batch removal, successful move, conflict diagnostic, and compact-window layout.
- [x] 4.4 Run the Neko quality review with L3 user-file mutation classification, canonical-path evidence, user-data rollback analysis, and explicit residual risk.
