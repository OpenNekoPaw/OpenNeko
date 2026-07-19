## 1. Entry intent contract and regression coverage

- [x] 1.1 Add a red-capable Controller regression proving open/cancel of the asset picker creates no conversation or Tab
- [x] 1.2 Add selection-path coverage proving one confirmed mode creates exactly one Tab and transfers the unsent draft
- [x] 1.3 Add ChatWorkspace coverage proving the identity-bearing initial mode request is consumed once and projects media defaults

## 2. Canonical Webview implementation

- [x] 2.1 Keep Generate Assets click and send actions in the tabless picker without calling `newConversation()`
- [x] 2.2 Add the explicit InputArea entry-generation confirmation callback and keep normal Tab mode switching unchanged
- [x] 2.3 Project confirmed mode and optional draft into the new Tab through one-time initialization requests with explicit cleanup

## 3. Validation and quality review

- [x] 3.1 Run focused Controller, InputArea, ChatWorkspace and i18n tests plus Agent Webview build, lint, format and diff checks
- [x] 3.2 Run the full Agent Webview test suite and record unrelated failures separately
- [x] 3.3 Verify open/cancel and confirm behavior in an isolated Extension Development Host using `vscode-extension-debugger`
- [x] 3.4 Complete the Neko quality review and record remaining risks and verification evidence
