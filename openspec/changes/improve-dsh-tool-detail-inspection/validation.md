# UI Validation Evidence

- The existing OpenNeko DSH tool card remains the presentation owner; no DSH UI replacement was introduced.
- Webview component validation covers collapsed vertical scrolling, full expansion, collapse, exact full-payload clipboard content, and visible copied feedback.
- `@neko/agent-webview` tests and typecheck pass.
- Authoritative visual validation is blocked because the available Desktop fixture does not seed a long completed DSH tool payload. Manual verification should exercise copy and expand/collapse after producing a long tool result in the packaged app.
