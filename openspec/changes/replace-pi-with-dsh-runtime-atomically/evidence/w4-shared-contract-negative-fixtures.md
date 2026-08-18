# W4 Shared Contract Negative Fixtures

`@neko/agent-contracts/testing` owns one shared negative fixture catalog for the DSH cutover. It is a
test-only package subpath and is not re-exported from the production root.

The fixture freezes rejection of:

- retired `runId`, `branchId` and `turnId` aliases;
- nullable DSH Session, turn and Tool Call identities;
- internal `version`, `schemaVersion` and `contractVersion` fields;
- Conversation owners that overlap Workspace and Assistant surfaces.

Agent Home, DSH Session Host and DSH Permission Host contract tests consume the shared fixtures.
Desktop preload also consumes the internal-version fixtures and proves the consumer rejects them before
projecting a Session result to Renderer. This gives producer/parser and cross-runtime consumer evidence
without adding compatibility decoding or a production fixture registry.

Task 2.7 remains open as the continuing integration-owner rule for future shared contract changes.

Evaluation disposition: `excluded`. This freezes strict decoding failures only and cannot change Agent
execution behavior. Contract and preload consumer tests are the authoritative evidence; no provider run
or Evaluation case is required for this unit.
