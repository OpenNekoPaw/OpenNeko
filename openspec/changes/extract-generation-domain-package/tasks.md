## 1. Domain contracts

- [x] 1.1 Create first-level `@neko/generation` package with strict TypeScript and architecture guards
- [x] 1.2 Move generation request/result/provider capability contracts and define the narrow execution port
- [x] 1.3 Move GenerationJob contract/coordinator/store/codec/migration and owning tests

## 2. Production migration

- [x] 2.1 Adapt Platform provider runtime to implement Generation contracts without a reverse dependency
- [x] 2.2 Migrate TUI direct runtime and other Job consumers to `@neko/generation`
- [x] 2.3 Delete Platform Job files/exports and add no-compatibility path poison
- [x] 2.4 Preserve the existing SQLite namespace/schema and prove restart recovery continuity

## 3. Configuration and Host boundary

- [x] 3.1 Document canonical Host config/credential ownership and domain purpose/capability ownership
- [x] 3.2 Prove Generation contains no config reader, watcher, credential store or ConfigManager
- [x] 3.3 Prove extraction creates no new Extension Host, process or global mutable runtime

## 4. Follow-up migration boundary

- [x] 4.1 Inventory remaining Platform provider/routing/execution/finalization files and assign target owners
- [x] 4.2 Track provider implementation migration without introducing a Platform compatibility facade
- [x] 4.3 Update package boundaries and active Domain Job artifacts to the new canonical owner

## 5. Evaluation and verification

- [x] 5.1 Record the workflow-controller disposition, deterministic package/path evidence and Platform Job forbidden fallback
- [x] 5.2 Run Generation/shared/Platform/TUI focused tests, build and dependency/architecture gates
- [x] 5.3 Run key-free Agent Evaluation and record that it is not provider-backed acceptance
- [ ] 5.4 Run one configured-provider case only with explicit cost authorization; record model/artifact/path evidence
- [x] 5.5 Record unused/debt baselines, unexecuted Host/Webview paths and remaining provider migration risk
