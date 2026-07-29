## 1. Workbench v2 contract and migration

- [x] 1.1 Add red-capable contract tests for orthogonal display, one/two Main Groups, unique View
      membership, bounded rows/columns split and explicit Timeline Cut owner.
- [x] 1.2 Replace the v1 preset/active/side contract with Workbench v2 and pure open/focus/close/
      reorder/split/move presentation operations.
- [x] 1.3 Add the deterministic persisted v1-to-v2 repository migration and prove only v2 is written.

## 2. Shell and domain open paths

- [x] 2.1 Migrate Shell projection/identity validation and Home primary-sidebar-only mutation checks
      to grouped Main Views without overwriting the existing Home change.
- [x] 2.2 Migrate Canvas, Preview and Cut open/focus/close paths to the shared Main presentation
      operations and add path assertions proving Chat display remains unchanged.
- [x] 2.3 Bind Timeline to an explicit Cut View and make Canvas + Timeline default to Canvas above
      the owner-bound Timeline.
- [x] 2.4 Remove Project-owned Main Views in the same transaction as recent Project removal,
      including while Home is active, and prove restart leaves no dangling identity.

## 3. Main Tab Group presentation

- [x] 3.1 Reuse `WorkbenchEditorTabs` to render group-local Main Tabs with safe labels, activation,
      close and reorder actions.
- [x] 3.2 Extend `ControlledWorkbenchShell` with bounded rows/columns split ratio and resize, then
      expose split-right/split-down/move actions from the Main Tab surface.
- [x] 3.3 Remove Main composition choices from the display menu and update English/Chinese labels,
      accessibility and renderer regressions.

## 4. Cut Root composition

- [x] 4.1 Extend the package-owned Cut Root with a Timeline-only presentation while keeping at most
      one mounted Cut Root for the owner identity.
- [x] 4.2 Add runtime tests proving Canvas + Timeline reuses one Cut identity and repeated opens do
      not recreate or duplicate the Cut session.
- [x] 4.3 Scope Canvas package layout overrides so lazily loading Cut/shared Workbench styles cannot
      collapse the active Canvas Main viewport.

## 5. Validation

- [x] 5.1 Run focused Workbench/UI/Desktop tests, Desktop typecheck/build, strict OpenSpec validation
      and diff checks.
- [x] 5.2 Run the real packaged Electron scenarios for Chat preservation, multiple Main Tabs,
      columns/rows split, restart recovery and Canvas-above-Timeline; verify split resize through
      the shared Shell interaction test and record any blocked external media/provider validation.
