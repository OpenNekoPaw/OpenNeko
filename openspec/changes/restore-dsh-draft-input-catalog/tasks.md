## 1. Contract and DSH ownership

- [x] 1.1 Permit the canonical DSH input-catalog client request to select exact pre-turn `{ cwd }` or live `{ sessionId }` scope.
- [x] 1.2 Implement bounded preset-scoped discovery in the DSH bridge with fail-visible teardown and no durable Session publication.
- [x] 1.3 Add deterministic bridge/client tests for catalog contents, exact Session scoping, malformed requests, discovery failure and persisted Session non-leakage.

## 2. Desktop composition

- [x] 2.1 Route Draft composer snapshots to the stable DSH pre-turn catalog client and existing Conversations to the Conversation-bound client.
- [x] 2.2 Add producer/consumer tests proving Draft catalog availability, exact Conversation delegation, failure propagation, and removal of the absent-catalog branch.
- [x] 2.3 Preserve Workspace mention authority and atomic first-submit command/Skill execution without a second controller or hidden Conversation.

## 3. Evaluation, UI validation and quality

- [x] 3.1 Update the existing `desktop-agent-entry-workspace-skill` scenario to assert Draft `/`, `$`, `@`, no pre-submit identity creation, and one exact first-submit Conversation/DSH Session.
- [x] 3.2 Run affected package tests, type checks, strict architecture/OpenSpec gates and deterministic DSH qualification; record exact commands and outcomes.
- [ ] 3.3 Run the authoritative isolated visible Electron scenario through the real composer/provider path and collect functional plus direct image-capable UI evidence at wide and narrow sizes.
- [x] 3.4 Apply the Neko quality review, record adjacent regressions, blocked evidence and residual risks, and mark tasks complete only for executed evidence.
