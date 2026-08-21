# UI Validation Evidence

## Acceptance inventory

- Conversation row and context menu expose “Archive conversation”.
- Workspace/project group actions expose archive rather than delete.
- Project catalog keeps project removal separate from Conversation archive.
- Archive actions use a non-destructive package/archive icon and no danger styling.
- Confirmation copy states that Conversation records, Sessions and project files are retained.
- Successful archive removes only the exact Conversation from the normal Home projection.

## Functional and visual disposition

Renderer tests cover row, group, context-menu and project-catalog actions, confirmation/cancellation and exact bridge delegation. Desktop build and Webview boundary checks passed.

Authoritative visible Electron validation was attempted through `desktop-project-sidebar-management`, but the fixture was blocked before CDP startup because an existing Desktop development process owns the checkout bundle. No screenshot or pixel review was produced, so visual acceptance remains `blocked`, not `passed`.

Sanitized failure report:

`evidence/ui-validation-blocker-report.json`

Adjacent regression evidence: Desktop package tests (`102 files / 608 tests`), Project Webview tests (`2 files / 13 tests`), focused ESLint, Desktop typecheck, production build and Webview boundary gate passed.
