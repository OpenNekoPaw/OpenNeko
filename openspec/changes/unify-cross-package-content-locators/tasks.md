## 1. Shared Contract

- [x] 1.1 Add locator-only creator-visible artifact helpers and strengthen portable path validation tests
- [x] 1.2 Add compile/runtime poison tests for ResourceRef, ContentSourceRef, absolute path, runtime URI, and base64 fields on migrated contracts
- [x] 1.3 Add dependency guards preventing migrated product contracts from importing Resource Cache types

## 2. Generation Control And Data Planes

- [x] 2.1 Replace Generation durable media input fields with typed ContentLocator fields
- [x] 2.2 Define separate provider-materialized request types for bytes/base64/URL wire payloads
- [x] 2.3 Migrate request materialization and provider adapters to read locators through Host ContentReadService
- [x] 2.4 Replace Generation Job `resultRefs` and result committer output with generated-output ContentLocators
- [x] 2.5 Update Generation Job codec/coordinator tests to assert locator commit and poison legacy persisted fields

## 3. Agent Projection

- [x] 3.1 Migrate media Tool inputs/results and detached Job observation to locator-backed payloads
- [x] 3.2 Migrate Timeline media result and creator-visible artifact collection to ContentLocator
- [x] 3.3 Remove localPath/provider URL/base64 persistence from Agent Tool and Timeline projections
- [x] 3.4 Update Extension Host provider/Webview materialization to derive transient bytes or render URI from locators
- [x] 3.5 Add Agent path tests proving canonical locator handlers are hit and ResourceRef fallback is not used

## 4. Workspace Board And Canvas

- [x] 4.1 Replace non-Markdown Board artifact `resourceRef`/`documentResourceRef` with exactly one ContentLocator
- [x] 4.2 Migrate artifact planner, generated-output delivery, identity comparison, and ledger codec to locators
- [x] 4.3 Migrate Canvas node persistence and Extension Webview projection to locator-backed render state
- [x] 4.4 Add save/reopen and generated-output Board tests with legacy payload poison assertions

## 5. Cleanup And Documentation

- [x] 5.1 Remove replaced public fields, fallback resolvers, exports, and legacy fixtures from migrated paths
- [x] 5.2 Update affected Agent, Generation, Canvas, and architecture documentation
- [x] 5.3 Cross-reference this locator contract from the active Generation Job and Workspace Board OpenSpecs
- [x] 5.4 Isolate rejected rebuildable generated-output projection rows behind one Host-owned catalog during embedded activation while preserving diagnostics, metadata, and generated files

## 6. Verification

- [x] 6.1 Run focused shared, Generation, Agent, Board, and Canvas producer/consumer tests
- [x] 6.2 Run affected package typecheck/build plus repository build, test, and check gates
- [x] 6.3 Run focused Agent evaluation for real generated-output locator handoff
- [x] 6.4 Run Extension Development Host scenarios for Agent generation card/result and Board save/reopen rendering
- [x] 6.5 Record commands, sanitized evidence, blockers, and residual risk in verification.md
