## 1. Settings Overlay Ownership

- [x] 1.1 Remove the Settings Scene context, surface refs, transition intent and Host composition branch atomically with their fixtures and tests.
- [x] 1.2 Compose a Renderer-owned Settings overlay from the shared Dialog primitive, keeping the current Scene mounted and restoring focus on close.
- [x] 1.3 Keep section selection overlay-local and render the Settings title/description exactly once.

## 2. Settings Presentation

- [x] 2.1 Refine overlay navigation, group/card typography, rows and controls with theme-safe focus and diagnostic styling.
- [x] 2.2 Add overlay-width responsive navigation and row stacking without changing application-settings authority.

## 3. Verification And Delivery Evidence

- Evidence 3.1: Focused Host contract/service, Settings component, Desktop composition and style tests cover overlay ownership, close/cancel, non-transition and responsive behavior.
- Evidence 3.2: Focused tests, Host/Desktop typechecks, `pnpm check:openspec` and `git diff --check` were run with unrelated pre-existing failures recorded separately.
- Evidence 3.3: Real Electron open/section/close cycles over representative background Scenes and direct overlay pixel inspection are recorded in `verification.md`.

## 4. Settings Density Correction

- [x] 4.1 Prevent the shared search control flex basis from stretching along the Settings sidebar column and keep navigation start-aligned.
- [x] 4.2 Replace the oversized Settings card elevation with the compact Desktop management-surface border hierarchy.
- Evidence 4.3: Focused style regression assertions and repeated real Electron visual validation cover the representative supported Window size; the 720px stylesheet branch remains assertion-covered because Desktop enforces a 960px minimum Window width.

## 5. Dialog Size Correction

- [x] 5.1 Override the shared compact Dialog width with a Settings-specific bounded landscape size.
- [x] 5.2 Preserve independent navigation/content scrolling and the narrow-window stacked layout under the stronger selector.
- Evidence 5.3: Focused tests and visible Electron validation cover General, Appearance, Creative Workspace and Agent sections.

## 6. Window-Adaptive Overlay Size

- [x] 6.1 Replace the fixed Settings canvas with responsive Window safety margins and desktop-scale maximum dimensions.
- [x] 6.2 Preserve the header/body grid, independent content scrolling and supported minimum-Window usability.
- Evidence 6.3: Focused style contracts and visible Electron evidence cover representative, minimum-height and large-Window states.

## 7. Remove Visual Settings Header

- [x] 7.1 Remove the visible Settings title/description band while preserving the Dialog's accessible name and description.
- [x] 7.2 Let navigation and current-section content consume the full overlay body and keep the close action unobstructed.
- Evidence 7.3: Focused tests and visible Electron evidence cover open, section-switch and close states.

## 8. Split Provider Directories

- [x] 8.1 Audit Provider/model ownership and define canonical model-family classification without a Renderer-only or parallel config path.
- [x] 8.2 Add Provider model-family contract persistence, strict decoding and Host projection/validation tests.
- [x] 8.3 Replace the outer Provider panel, shared add action and pending group with two direct sibling directories and per-directory add actions.
- [x] 8.4 Keep exact config-backed Provider deletion available with model/credential safeguards and local diagnostics; remove `builtin`-based UI and Host blocking.
- Evidence 8.5: Focused tests, affected typechecks, strict OpenSpec, quality review and visible Electron validation results, including runtime blockers, are recorded in `verification.md`.

## 9. Compact Provider Deletion

- [x] 9.1 Replace the full-height Provider delete segment with the compact action language used by model management.
- [x] 9.2 Keep explicit confirmation and add an adjacent cancel action without changing the Provider card's primary open/edit target.
- Evidence 9.3: Focused component/style tests, affected typecheck, strict OpenSpec and UI validation are recorded in `verification.md`.

## 10. Reduce Agent Configuration Fills

- [x] 10.1 Replace broad control-gray fills on Provider directories and the expanded Provider editor with raised surfaces and quiet borders.
- [x] 10.2 Give model cards an explicit raised surface so their hierarchy remains stable inside the low-fill editor.
- Evidence 10.3: Focused component validation, affected typecheck, strict OpenSpec and visible Electron inspection are recorded in `verification.md`.

## 11. Unify Provider Card Feedback

- [x] 11.1 Move primary hover/focus feedback from the card's left segment to the complete Provider card surface.
- [x] 11.2 Keep open/edit and delete as independent accessible controls without rendering the delete action as a second panel.
- Evidence 11.3: Focused component validation, affected typecheck, strict OpenSpec and visible Electron inspection are recorded in `verification.md`.
