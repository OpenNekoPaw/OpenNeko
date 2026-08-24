## 1. Ordered node-bound reads

- [x] 1.1 Add Host adapter tests that hold an earlier `replace-document` intent open and assert copied image preview resolution is not forwarded until the new node becomes authoritative.
- [x] 1.2 Route `preview:resolveResource` through the existing Canvas Host operation queue while keeping descriptor release independent.
- [x] 1.3 Add a Host adapter test asserting copied file text preview waits for the same document operation and then reaches the runtime with the exact node and locator.
- [x] 1.4 Make `readTextFilePreview` wait for the operation queue to settle before runtime authorization.

## 2. Regression and acceptance

- [x] 2.1 Run focused Canvas Host adapter/runtime tests and the complete Canvas Webview test/build commands.
- [x] 2.2 Run strict OpenSpec validation and relevant Webview, package and content-access boundary checks.
- [x] 2.3 Use `neko-quality-review` to audit the L2 ownership, single mutation path, fail-closed authorization and async resource lifecycle.
- [x] 2.4 Use `neko-ui-validation` with the isolated Electron Canvas runtime to validate immediate copied image/file rendering, error absence and reopen persistence; record blocked visual evidence explicitly if the runtime is unavailable.
