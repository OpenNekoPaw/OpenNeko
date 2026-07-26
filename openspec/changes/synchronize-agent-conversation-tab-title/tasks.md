## 1. Contract and regression

- [x] 1.1 Add a red bridge regression for first-input title persistence and preservation of existing titles.
- [x] 1.2 Add a red Provider regression proving committed titles update every matching ordinary Tab through revisioned TabState while role labels remain unchanged.
- [x] 1.3 Add a message-handler path assertion proving title initialization runs before preparation/dispatch.

## 2. Canonical implementation

- [x] 2.1 Add one async ConversationBridge first-input title operation with committed-title callback.
- [x] 2.2 Wire Agent/media message preflight to the bridge operation.
- [x] 2.3 Reconcile matching ordinary Tab titles, persist a new revision and project it to the Webview.

## 3. Verification

- [x] 3.1 Run focused Extension tests, typecheck/build, OpenSpec strict validation and quality review.
- [x] 3.2 Verify the visible Header Tab label in the isolated Extension Development Host.
