## 1. Canonical Tool Schema

- [x] 1.1 Add producer tests proving every actual Pi provider Tool uses a top-level object schema without provider-rejected combinators while retaining nested constraints
- [x] 1.2 Sanitize top-level Tool schema projection and preserve the canonical `ListDirectory` exact-argument validation path
- [x] 1.3 Run focused Agent runtime tests proving invalid directory arguments fail locally without filesystem or alternate Tool execution

## 2. Agent Generation Credential Policy

- [x] 2.1 Add policy tests for configuration-file and auth-login credentials through the canonical CredentialStore, with secret-free Provider metadata
- [x] 2.2 Replace Agent media-purpose `Provider.apiKey` inspection with asynchronous exact-provider CredentialStore status checks
- [x] 2.3 Add fail-local tests proving a missing image credential omits only `GenerateImage` while `agent.main`, Workspace Tools, sibling purposes and unrelated sessions remain usable

## 3. Media Execution Credential Routing

- [x] 3.1 Define a narrow package-owned asynchronous execution-provider resolver port and cover exact identity, ephemeral credential and unavailable-provider behavior
- [x] 3.2 Make media routing, execution, external-task observation and cancellation resolve the exact current provider through the injected port, deleting secret-free `Provider.apiKey` reads
- [x] 3.3 Wire the Desktop concrete adapter from the exact Host-owned ConfigManager view and shared CredentialStore without mutating configuration, caching secrets or adding provider fallback
- [x] 3.4 Add producer, consumer and complete-path tests proving credential source priority, exact provider/model use, no secret persistence/projection and visible current-Job failure when the credential disappears

## 4. Evaluation And Verification

- [x] 4.1 Update `agent-runtime.model-binding` with the ordinary-message/default-image-purpose negative Tool case and validate the reused directory and creative-media Evaluation coverage
- [x] 4.2 Run OpenSpec strict validation, focused unit/contract tests, relevant typechecks, key-free Agent Evaluation authoring checks and architecture boundary gates
- [x] 4.3 Record paid real-provider Evaluation as blocked unless explicit provider, model and cost authorization is supplied; document the exact unexecuted cases and residual risk
- [x] 4.4 Perform the Neko quality self-review and record actual verification commands, canonical-path evidence, UI-validation applicability and remaining risks

## 5. Generation Owner And Assistant Persistence

- [x] 5.1 Replace the Workspace-only Generation application contract with one closed Workspace/Assistant owner binding and prove exact owner/root reuse, conflict isolation and disposal
- [x] 5.2 Keep `MediaRoutingManager`, executor and adapter registry internal to the Generation media composition while preserving one exact provider/model execution path
- [x] 5.3 Add the canonical Node Generation owner that retains Workspace UUID validation and persists Assistant Jobs/projections under the exact user-owned Assistant Space root without a Project descriptor, active Workspace or tmp fallback
- [x] 5.4 Wire Agent and Desktop through the explicit Generation owner and add producer/consumer tests for Assistant and Project bindings
- [x] 5.5 Add or update focused Agent Evaluation authoring for Assistant generation, durable artifact recovery and Workspace isolation; run key-free validation and record real-provider authorization blockers
- [x] 5.6 Run focused package tests, typechecks, OpenSpec strict validation, architecture/legacy gates and the Neko quality self-review; update the verification record and residual risk

## 6. Assistant Artifact Delivery Ownership

- [x] 6.1 Carry the exact Workspace/Assistant owner into the Agent conversation runtime and skip creator-visible Workspace Board collection and delivery for Assistant owners
- [x] 6.2 Add path-level tests proving Assistant artifacts retain their terminal transcript result without a Board request or diagnostic while Workspace artifacts still use the exact Board delivery port
- [x] 6.3 Update the Assistant generation Evaluation contract, run focused tests, typechecks, key-free Evaluation, OpenSpec strict validation and affected architecture gates, then refresh the verification record and residual risk

## Verification Record

- OpenSpec: `openspec validate fix-agent-tool-schema-and-media-credential-routing --strict` passed.
- Agent: `pnpm --filter @neko/agent-runtime typecheck` and the full 1,133-test package suite passed, including Pi schema, CredentialStore, model-policy, exact Generation owner, capability-bridge and Assistant/Workspace artifact-delivery owner coverage. The added path-level test proves an Assistant terminal artifact remains in the conversation projection with no delivery outcome or Board request, while the sibling Workspace artifact reaches the exact Board port once.
- Generation and metadata: `pnpm --filter @neko/generation typecheck`, the full 179-test Generation suite, `pnpm --filter @neko/local-metadata typecheck`, and the full 90-test Local Metadata suite passed. Coverage proves exact Workspace/Assistant owner reuse and conflict isolation, Assistant user-root containment, Job/output reopen recovery, sibling projection isolation, no Workspace descriptor and no tmp locator.
- Desktop: `pnpm --filter @neko/app-desktop typecheck` and the full 620-test package suite passed; focused controller, credential resolver and preload consumer coverage also passed 20 tests after the canonical launch fixture was synchronized.
- Evaluation: `pnpm test:agent:eval` passed 304 key-free harness tests and strict dry-run discovery for 25 suites / 72 cases. `assistant-generated-output-recovery` now requires conversation-only artifact retention with no Workspace Board delivery or diagnostic. Real `ordinary-message-with-image-purpose`, `directory-format-routing`, `generated-output-workspace-board`, and `assistant-generated-output-recovery` runs were not started because `OPENNEKO_AGENT_EVAL_PROVIDER_ID`, `OPENNEKO_AGENT_EVAL_MODEL_ID`, and `OPENNEKO_AGENT_EVAL_COST_APPROVED=true` were not authorized; the user config was readable but does not itself authorize paid execution.
- Repository boundaries: `pnpm check:agent-boundaries`, `pnpm check:application-boundaries`, `pnpm check:legacy-debt`, `pnpm check:no-internal-versioning`, `pnpm check:local-metadata-runtimes`, and `pnpm check:storage-authorities` passed. Changed-file ESLint passed with no errors; full-repository `pnpm lint` remains blocked by the pre-existing `prefer-const` error in `apps/neko-desktop/src/main/desktop-canvas-runtime.test.ts`. `pnpm check:unused` remains blocked by pre-existing `jsdom` and `NODE_DEFAULT_SIZES` findings outside this change.
- UI validation: applicable because Assistant mode no longer presents a Workspace Board delivery error after a successful generated artifact. The authoritative visible Desktop/provider path is blocked by missing explicit provider/model/cost authorization; deterministic Agent and Desktop tests prove the owning result and diagnostic input are absent, but no post-fix screenshot is claimed.
- Residual risk: real provider acceptance still needs visible ordinary-chat and Assistant recovery runs plus focused hidden directory/Workspace image-generation runs with authorized credentials and cost. Deterministic reopen, owner isolation and Board-delivery suppression coverage is complete; provider-backed output quality and visible Desktop recovery remain unverified. Foundational session compaction and unrelated conversation switching were behaviorally unaffected and were not rerun.
