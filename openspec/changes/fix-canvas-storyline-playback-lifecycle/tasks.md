## 1. Contract and regression

- [x] 1.1 Define the separation between Host-plan freshness and playback transport state.
- [x] 1.2 Add a store regression test for clearing freshness during active playback.
- [x] 1.3 Add a `PlaybackWorkspace` regression test where Play precedes the Host plan response.

## 2. Implementation

- [x] 2.1 Make stale clearing preserve valid transport state while retaining fail-visible stale invalidation.
- [x] 2.2 Confirm fullscreen continues to reuse the same Preview instance and request identity.

## 3. Validation

- [x] 3.1 Run focused Canvas playback/store tests.
- [x] 3.2 Run the affected Canvas Webview test/build gates and `git diff --check`.
- [x] 3.3 Validate Storyline and fullscreen video playback in the real VS Code Webview using only `~/Git/neko-test`.
- [x] 3.4 Record validation evidence and remaining risks.
