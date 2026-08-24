## 1. Settings Overlay Ownership

- [x] 1.1 Remove the Settings Scene context, surface refs, transition intent and Host composition branch atomically with their fixtures and tests.
- [x] 1.2 Compose a Renderer-owned Settings overlay from the shared Dialog primitive, keeping the current Scene mounted and restoring focus on close.
- [x] 1.3 Keep section selection overlay-local and render the Settings title/description exactly once.

## 2. Settings Presentation

- [x] 2.1 Refine overlay navigation, group/card typography, rows and controls with theme-safe focus and diagnostic styling.
- [x] 2.2 Add overlay-width responsive navigation and row stacking without changing application-settings authority.

## 3. Verification And Delivery

- [x] 3.1 Update focused Host contract/service, Settings component, Desktop composition and style tests for overlay ownership, close/cancel, non-transition and responsive behavior.
- [x] 3.2 Run focused tests, Host/Desktop typechecks, `pnpm check:openspec` and `git diff --check`, recording unrelated pre-existing failures separately.
- [x] 3.3 Validate real Electron open/section/close cycles over representative background Scenes and inspect the overlay pixels directly.

## 4. Settings Density Correction

- [x] 4.1 Prevent the shared search control flex basis from stretching along the Settings sidebar column and keep navigation start-aligned.
- [x] 4.2 Replace the oversized Settings card elevation with the compact Desktop management-surface border hierarchy.
- [x] 4.3 Add focused style regression assertions and repeat real Electron visual validation at the representative supported Window size; the 720px stylesheet branch remains assertion-covered because Desktop enforces a 960px minimum Window width.

## 5. Dialog Size Correction

- [x] 5.1 Override the shared compact Dialog width with a Settings-specific bounded landscape size.
- [x] 5.2 Preserve independent navigation/content scrolling and the narrow-window stacked layout under the stronger selector.
- [x] 5.3 Run focused tests and validate General, Appearance, Creative Workspace and Agent sections in the visible Electron runtime.

## 6. Window-Adaptive Overlay Size

- [x] 6.1 Replace the fixed Settings canvas with responsive Window safety margins and desktop-scale maximum dimensions.
- [x] 6.2 Preserve the header/body grid, independent content scrolling and supported minimum-Window usability.
- [x] 6.3 Update focused style contracts and validate representative, minimum-height and large-Window states in visible Electron.

## 7. Remove Visual Settings Header

- [x] 7.1 Remove the visible Settings title/description band while preserving the Dialog's accessible name and description.
- [x] 7.2 Let navigation and current-section content consume the full overlay body and keep the close action unobstructed.
- [x] 7.3 Update focused tests and verify open, section-switch and close states in visible Electron.

## 8. Split Provider Directories

- [x] 8.1 Audit Provider/model ownership and define canonical model-family classification without a Renderer-only or parallel config path.
- [x] 8.2 Add Provider model-family contract persistence, strict decoding and Host projection/validation tests.
- [x] 8.3 Replace the outer Provider panel, shared add action and pending group with two direct sibling directories and per-directory add actions.
- [x] 8.4 Keep exact config-backed Provider deletion available with model/credential safeguards and local diagnostics; remove `builtin`-based UI and Host blocking.
- [x] 8.5 Run focused tests, affected typechecks, strict OpenSpec, quality review and visible Electron validation; record any runtime blocker.

## 9. Compact Provider Deletion

- [x] 9.1 Replace the full-height Provider delete segment with the compact action language used by model management.
- [x] 9.2 Keep explicit confirmation and add an adjacent cancel action without changing the Provider card's primary open/edit target.
- [x] 9.3 Run focused component/style tests, affected typecheck, strict OpenSpec and UI validation.

## 10. Reduce Agent Configuration Fills

- [x] 10.1 Replace broad control-gray fills on Provider directories and the expanded Provider editor with raised surfaces and quiet borders.
- [x] 10.2 Give model cards an explicit raised surface so their hierarchy remains stable inside the low-fill editor.
- [x] 10.3 Run focused component validation, affected typecheck, strict OpenSpec and visible Electron inspection.
