## 1. Canonical Contract And Service

- [x] 1.1 Add the Canvas-owned exact text-file preview request/result contract, strict parsers, supported-kind policy and bounded formatting helpers without changing File durable data.
- [x] 1.2 Add the host-neutral Canvas Node preview service on the public package entry, backed only by `ContentReadService` with fixed byte and presentation limits.
- [x] 1.3 Add domain and Node tests for supported formats, strict UTF-8/JSON, empty/truncated output, content diagnostics, bounded reads and proof that malformed JSON cannot succeed through raw-text fallback.

## 2. Host Runtime And Desktop Boundary

- [x] 2.1 Extend the canonical Canvas host-runtime route and session query, validating active Canvas identity, File node identity and exact authoritative locator before delegation.
- [x] 2.2 Wire one sender-bound Desktop IPC/preload query and workspace-scoped Canvas Node service through public package entries, keeping Desktop free of format and rendering policy.
- [x] 2.3 Add session, Main IPC and preload producer/consumer tests that prove exact canonical delegation, malformed request rejection, stale/forged locator fail-closed behavior and unaffected sibling/runtime capability.

## 3. Canvas Webview Presentation

- [x] 3.1 Extend `CanvasWebviewHostPort` with the exact query and bind File-node request lifecycle to current node, locator and request identity.
- [x] 3.2 Render JSON, referenced Markdown and plain text directly on the existing white File-node surface, with restrained loading, empty, truncated and local diagnostic states while retaining the generic icon for unsupported files.
- [x] 3.3 Add component and Canvas regression tests for all presentation states, stale-response disposal, sibling isolation, unchanged Markdown editing and absence of preview fields in persisted Canvas facts.

## 4. Verification And Acceptance

- [x] 4.1 Run focused Canvas domain/node/webview and Desktop bridge tests plus package typechecks/builds, `pnpm check:package-boundaries`, `pnpm check:no-internal-versioning` and `openspec validate preview-text-files-on-canvas --strict`.
- [x] 4.2 Run `neko-quality-review`, classify the L2 cross-runtime risk, inspect residual/debt and canonical-path evidence, and record any unexecuted broader gate as residual risk.
- [x] 4.3 Run `neko-ui-validation` in an isolated visible Electron Desktop runtime for JSON, Markdown, plain, empty, unsupported, loading/error, selected and smaller-window states; inspect captured pixels directly and record blocked evidence rather than substituting a browser-only success.
