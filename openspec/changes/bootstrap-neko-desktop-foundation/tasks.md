## 1. Contract And Dependency Baseline

- [x] 1.1 Lock Electron, Forge/Vite and renderer dependency versions with an explicit supply-chain
      decision
- [x] 1.2 Audit `neko-home` references and known storage roots across repository, fixtures and local
      application metadata without reading credential values
- [x] 1.3 Replace canonical `neko-home` identity with `neko-desktop`, add migration disposition and
      rejection tests, and update boundary guards

## 2. Desktop Composition Root

- [x] 2.1 Create `apps/neko-desktop` package, strict TypeScript configs, Vite renderer and
      Electron build/packaging configuration
- [x] 2.2 Implement security policy, CSP, navigation/permission denial and window registry
- [x] 2.3 Implement Desktop AppHost lifecycle and `ElectronNekoHostPorts`
- [x] 2.4 Implement the fixed preload bridge and shared runtime parsers
- [x] 2.5 Implement the minimal React renderer bootstrap without mock domain state

## 3. Tests And Verification

- [x] 3.1 Add bridge parser, sender identity, security preference, window lifecycle and Host port
      contract tests
- [x] 3.2 Add architecture tests forbidding React in main and Node/Electron/VS Code in renderer
- [x] 3.3 Add isolated Electron startup/reload/window-close/app-quit smoke coverage
- [x] 3.4 Run focused package typecheck/build/test, application and Webview boundary checks,
      dependency/unused checks, full build/test/check/quality gates and strict OpenSpec validation
- [x] 3.5 Record any unavailable graphical smoke condition and remaining packaging/signing risk
