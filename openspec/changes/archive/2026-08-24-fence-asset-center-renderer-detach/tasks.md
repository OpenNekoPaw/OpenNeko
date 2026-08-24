## 1. Canonical contract

- [x] 1.1 Add `rendererSessionId` to every Asset Center Host request and define explicit `detached` and `stale` detach results.
- [x] 1.2 Update contract tests to reject the removed unfenced shape and validate both detach outcomes.

## 2. Runtime fencing

- [x] 2.1 Pass the current Shell Renderer identity through `DesktopAssetCenterRuntime` for every request.
- [x] 2.2 Fence requests in Desktop Main before Assets Node delegation; allow stale cleanup only through the typed `stale` result.
- [x] 2.3 Preserve current-owner duplicate-detach failure and exact-once resource release in Assets Node tests.

## 3. Verification

- [x] 3.1 Run focused Assets Domain, Assets Node, Desktop Renderer and Desktop Main tests plus affected typechecks.
- [x] 3.2 Run application/Webview boundary checks, strict OpenSpec validation, scoped lint/format and `git diff --check`.
- [x] 3.3 Reproduce a Renderer replacement while Asset Center is active and verify the stale cleanup produces no IPC handler error and does not invalidate the replacement session; record residual risk.
