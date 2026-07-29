## 1. Renderer ownership

- [x] 1.1 Add renderer tests that require the project display-mode control in the primary sidebar and exclude it from Home.
- [x] 1.2 Move the existing Workbench display menu into the project primary-sidebar footer without adding a new state owner.
- [x] 1.3 Remove the floating Main layout toolbar and standalone Timeline button while preserving Cut-owned Timeline rendering.

## 2. Tab presentation

- [x] 2.1 Add shared UI style tests for active, hover, focus, bounded-label, overflow, and close-button presentation.
- [x] 2.2 Refine the canonical `WorkbenchEditorTabs` styling and align Desktop group actions with the new tab strip.
- [x] 2.3 Verify keyboard selection, close isolation, drag reorder, split-right, and split-down behavior remain covered.

## 3. Validation

- [x] 3.1 Run focused Desktop and `@neko/ui` tests, typecheck/build, OpenSpec strict validation, and diff checks.
- [x] 3.2 Run applicable dependency, legacy-debt, and unused-export quality gates and classify baseline failures.
- [x] 3.3 Package and inspect the real Electron Desktop with a synthetic fixture, verifying tab hierarchy, sidebar menu placement, compact access, and absence of floating/Timeline controls.
- [x] 3.4 Complete the Neko quality self-review and record remaining visual or runtime risk.
