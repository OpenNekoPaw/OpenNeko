## 1. Contract and presentation preparation

- [x] 1.1 Add a renderer-owned quick-creation orchestration module that validates the originating
      Main group, awaits exact group activation, establishes the unfiltered Files projection and
      submits the existing canonical Resources intent.
- [x] 1.2 Add path-level tests proving Workbench activation precedes Resources dispatch and that no
      alternate create/open handler participates.

## 2. Main quick-creation UI

- [x] 2.1 Add one reusable localized quick-create control for File, Folder, Canvas and Cut with an
      explicit Workspace-root target, fixed creative suffixes, keyboard cancellation, pending state
      and fail-visible diagnostics.
- [x] 2.2 Place the compact control immediately after the Main tab list and add the labelled variant
      to the empty Main placeholder without changing non-Workspace empty surfaces.
- [x] 2.3 Add component, Desktop composition, i18n and style tests for populated, empty, pending,
      invalid, conflict and split-group behavior.

## 3. Validation and review

- [x] 3.1 Run focused Desktop renderer tests/typecheck, Resources/Content adjacent tests, OpenSpec
      validation, boundary checks and `git diff --check`.
- [ ] 3.2 Use the isolated visible Electron Desktop runtime to exercise empty and populated Main,
      Canvas/Cut/File/Folder creation, cancellation, a name conflict, split-group targeting, dense
      tabs and a smaller supported window; inspect current screenshots directly.
- [x] 3.3 Run `neko-quality-review`, record commands and residual risks, and update this task list with
      the actual results.

> 2026-08-24: the dedicated visible scenario is registered as `workspace-main-quick-creation`, but
> its current run was infrastructure-blocked because Desktop process `30133` already owns this
> checkout's Vite bundle. The existing process was left untouched to protect the user's active app.
