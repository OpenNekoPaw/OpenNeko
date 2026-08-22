## 1. Remove unreachable presentation and management

- [x] 1.1 Delete `@neko/automation-webview`, its Desktop dependency, styles and translations.
- [x] 1.2 Delete dormant Desktop Automation renderer runtimes, preload/IPC handlers, Main services and
      wiring.
- [x] 1.3 Delete local-runtime/permission management contracts, Node services, exports and tests.

## 2. Retain the safety kernel honestly

- [x] 2.1 Mark Automation contracts/node as `retained-kernel` and prove they are unreachable from Desktop
      production entries.
- [x] 2.2 Update Automation architecture/status documentation so it does not claim a current Renderer or
      management path.
- [x] 2.3 Add absence checks for the removed workspace, channels, exports and Desktop files.

## 3. Verify

- [x] 3.1 Run retained Automation contracts/node tests and typechecks.
- [x] 3.2 Run package-role/product-status, application/dependency, unused and legacy gates; aggregate
      unused/legacy blockers are recorded in verification evidence.
- [x] 3.3 Record deterministic Agent Evaluation exclusion and residual future-integration risk.
