## 1. Q0 DSH Qualification

- [ ] 1.1 Inventory the required DSH/Cordis packages, select one reviewed RC family and pin every direct package plus lockfile resolution to exact versions without dist-tags, caret, tilde or mixed RCs.
- [ ] 1.2 Record package licenses, peer dependency closure and the exact indirect `pi-ai` dependency retained by qualified DSH adapters; reject unowned or conflicting runtime packages.
- [ ] 1.3 Qualify the pinned closure on Electron 43.2.0 and Node >=24 for minimal Cordis Context create/dispose, application exit and an isolated non-release production-mode bundle.
- [ ] 1.4 Define quantitative startup and bundle thresholds and record the isolated qualification fixture measurements without generating a releaseable Desktop artifact.
- [ ] 1.5 Add Q0 Session fixtures for create, append, close, reopen, resume, fork and qualified compaction using the exact persistent format selected for production.
- [ ] 1.6 Add Q0 failure fixtures proving a malformed or unsupported Session fails only its exact Conversation and leaves source bytes, sibling Sessions and the root Context intact.
- [ ] 1.7 Qualify a real authorized provider through DSH for credential resolution, normal text turns, Tool success/error/cancel and model/provider failure diagnostics.
- [ ] 1.8 Qualify DSH inbox append, replace, remove, clear and cancel-with-retained-inbox semantics and identify every current product queue operation that has no exact mapping.
- [ ] 1.9 Publish the Q0 evidence and unresolved blockers in the change implementation record; stop production consumer switching if any required qualification fails rather than adding Pi fallback or reducing acceptance.

## 2. Shared Contract Freeze

- [ ] 2.1 Assign one integration owner and publish a file-owner manifest that gives contract, composition, projection, catalog, Evaluation and final deletion surfaces to non-overlapping workstreams.
- [ ] 2.2 Freeze the canonical Conversation-to-Session, turn/call, inbox, clear/compact, Credential and virtual cwd/path contracts.
- [ ] 2.3 Freeze the Tool model schema, canonical validator delegation, Skill, MCP, Plugin and diagnostic projection contracts.
- [ ] 2.4 Freeze the legacy Pi record unavailable shape and the byte-preservation policy for JSONL, `pi_*` rows/unknown fields, retired databases and `.neko/` data.
- [ ] 2.5 Freeze the cross-store new Conversation/Session publication protocol, exact provisional cleanup boundary and post-publication Window-selection failure semantics.
- [ ] 2.6 Add contract fixtures that every workstream consumes unchanged and reject local compatibility aliases, nullable legacy fields, internal versions and owner-surface overlap.
- [ ] 2.7 Require any shared-contract change to return to the integration owner and require every affected workstream to rebase before continuing.

## 3. Release Isolation

- [ ] 3.1 Create one migration integration branch plus isolated W0-W8 worktrees and mark every partial branch as integration-only repository state.
- [ ] 3.2 Implement a machine-verifiable release guard that requires Q0, all consumer cutovers, final deletion, byte-preservation and real Evaluation evidence.
- [ ] 3.3 Add negative tests proving a partial workstream branch cannot enter normal release automation, produce a Desktop release package, create a tag or create a release candidate.
- [ ] 3.4 Add a negative test proving the isolated Q0 compatibility bundle cannot be promoted or classified as a Desktop product artifact.
- [ ] 3.5 Limit workstream branches to focused tests and non-release builds until the unified release guard passes on the integration branch.

## 4. W1 DSH Agent Session And Tool Spine

- [ ] 4.1 Implement the package-owned minimal Cordis Context composition in `@neko/agent-runtime` using only Q0-qualified DSH services and without `dsh-base`.
- [ ] 4.2 Implement deterministic Context start/dispose ownership and explicit missing-service diagnostics without a generic multi-engine runtime port.
- [ ] 4.3 Implement the user-global DSH Session persistence adapter partitioned by exact Session identity under the Desktop-provided program data root.
- [ ] 4.4 Generate virtual Session cwd metadata and prove physical Workspace paths never enter Session headers, model context, Renderer projections or logs.
- [ ] 4.5 Implement exact Conversation-to-current-DSH-Session binding and reject missing, stale or cross-Conversation identities without active/recent fallback.
- [ ] 4.6 Implement DSH Agent creation and turn execution from the frozen Conversation, model and provider contracts.
- [ ] 4.7 Implement the OpenNeko DSH credentials service backed only by the package port to program-owned CredentialStore.
- [ ] 4.8 Wire the Desktop SecretStorage/keychain concrete adapter to the DSH credentials service without environment, settings or in-memory credential fallback.
- [ ] 4.9 Implement first-party DSH Tool registration that projects model-facing schemas and invokes package-owned validators before authorization or domain mutation.
- [ ] 4.10 Implement DSH inbox-backed enqueue, edit, remove, discard, continuation and turn-cancel operations for only the semantics frozen in Q0.
- [ ] 4.11 Emit version-free DSH-derived Agent application events without editing product contract, Webview projection or Evaluation owner files.
- [ ] 4.12 Add W1 producer tests for exact identities, Session persistence, virtual paths, canonical validation, Credential failures, inbox mutation and Context disposal.
- [ ] 4.13 Add Desktop consumer/delegation tests proving Main only decodes, authorizes, wires and disposes while `@neko/agent-runtime` owns Agent/Session/Tool behavior.
- [ ] 4.14 Run a complete Desktop-owner W1 fixture for create, execute, cancel, close, reopen and resume and retain canonical-path evidence.
- [ ] 4.15 Add poison tests proving absent DSH services, invalid Tool input or credential failure cannot invoke Pi, another Tool registry, environment credentials or a test-only direct runtime.

## 5. W2 DSH MCP Runtime

- [ ] 5.1 Adapt the canonical product-authorized MCP server configuration into the qualified DSH MCP transport contract without transferring trust or configuration authority.
- [ ] 5.2 Implement per-server DSH connection, Tool enumeration, invocation, timeout, cancellation and disposal with exact server identity.
- [ ] 5.3 Project MCP Tool definitions through the W1 Tool boundary while preserving canonical argument validation, authorization and explicit result diagnostics.
- [ ] 5.4 Add MCP producer tests for valid transports, invalid configuration, startup failure, Tool failure, cancellation and disposal.
- [ ] 5.5 Add Agent/Desktop consumer tests proving enabled MCP servers appear only through DSH and one failed server leaves sibling servers, first-party Tools and Conversations usable.
- [ ] 5.6 Run an authorized MCP server through the complete Desktop owner and retain connection, invocation and shutdown evidence.
- [ ] 5.7 Add poison tests proving retired `MCPManager`, client, bootstrap and Tool wrapper paths cannot register or execute; leave shared file deletion to W8.

## 6. W3 Trusted Skill Provider

- [ ] 6.1 Implement a thin DSH Skill provider that consumes exact trusted, enabled records from the OpenNeko Skill catalog.
- [ ] 6.2 Project allowed Skill metadata and content without exposing catalog mutation, physical directories, Host locators or permission grants to DSH.
- [ ] 6.3 Reconcile Skill add, update, disable and removal by exact catalog identity and fingerprint without filesystem discovery becoming an authority.
- [ ] 6.4 Add Skill producer tests for trust, enablement, fingerprint, containment, parsing and model-visible path redaction.
- [ ] 6.5 Add Agent/Desktop consumer tests proving one invalid Skill is locally unavailable while sibling Skills, Conversations and Workspaces remain usable.
- [ ] 6.6 Run trusted builtin, personal and Plugin-contributed data-only Skill projections through the complete DSH Agent path.
- [ ] 6.7 Add poison tests proving `PiSkillHost`, ordinary Skill-root discovery and trusted filesystem-provider shortcuts cannot supply production Skill success; leave shared file deletion to W8.

## 7. W4 Plugin Loader Boundary

- [ ] 7.1 Define the exact reviewed OpenNeko factory allowlist and validated data-only Skill, MCP and explicit automation-adapter contribution shapes consumed by Cordis Loader.
- [ ] 7.2 Implement catalog-to-Loader reconciliation for exact authorized enable, disable, mount and unmount operations without transferring catalog authority.
- [ ] 7.3 Implement effect-scoped disposal so one failed or disabled Plugin releases only its own registrations and resources.
- [ ] 7.4 Implement a rebuildable read-only runtime inventory that cannot write catalog facts or select another Plugin after failure.
- [ ] 7.5 Reject arbitrary third-party JavaScript, unreviewed Cordis factories and direct Electron/Node access before Main-process execution.
- [ ] 7.6 Add Plugin producer tests for source, trust, enablement, fingerprint, allowlist and independently validated data-only contributions.
- [ ] 7.7 Add Loader consumer tests for exact mount/unmount, partial-effect disposal, duplicate registration rejection and sibling failure isolation.
- [ ] 7.8 Run reviewed builtin factories and third-party data-only contributions through the complete Desktop composition and retain runtime inventory evidence.
- [ ] 7.9 Add poison tests proving the retired Plugin runtime, wildcard/default factories and try-next registration cannot provide success; leave shared file deletion to W8.

## 8. W6 Domain Tool Adapters

- [ ] 8.1 Inventory every production Agent Tool and assign its canonical schema, semantic validator, permission, resource authorization, domain service and durable Job owner before adapter work starts.
- [ ] 8.2 Migrate Canvas and content-authoring Tool adapters and add owning-domain producer, DSH delegation, semantic-negative, permission/path and bounded-result tests.
- [ ] 8.3 Migrate Cut and media Tool adapters and add owning-domain producer, DSH delegation, semantic-negative, permission/path and bounded-result tests.
- [ ] 8.4 Migrate Generation and Asset Tool adapters and add owning-domain producer, DSH delegation, semantic-negative, permission/path and durable-Job tests.
- [ ] 8.5 Migrate Character and World Tool adapters and add owning-domain producer, DSH delegation, semantic-negative, version-identity and lifecycle tests.
- [ ] 8.6 Migrate each remaining first-party Capability Tool adapter with its own producer/delegation/negative test and account for every inventory item.
- [ ] 8.7 Preserve short model references, bounded document/media results and `ContentLocator` behavior in DSH adapters without editing the shared Pi-specific protocol file.
- [ ] 8.8 Correlate exact DSH call identity to owning-domain Job identity without allowing call identity to own Job cancellation, recovery or results.
- [ ] 8.9 Run representative synchronous and durable-Job Tools through the complete Desktop owner and retain exact call-to-Job evidence.
- [ ] 8.10 Add poison tests proving no raw-path, direct-domain, Pi Tool bridge, alternate validator or test-only runtime shortcut can complete the same Tool intent; leave shared file deletion to W8.

## 9. W5a Product Contract And Projection Cutover

- [ ] 9.1 Replace Agent contracts with the exact Q0-qualified DSH Session, turn, call and inbox identities and remove generic `branchId`, `runId` and Pi identity fields.
- [ ] 9.2 Update every contract producer, codec and fixture atomically to the one canonical identity shape without compatibility aliases or internal version fields.
- [ ] 9.3 Update Desktop IPC, preload and renderer consumers to the frozen canonical shape with exact sender, Conversation, Session, turn and call routing.
- [ ] 9.4 Project transcript, inbox, approval, Tool, Timeline and failure views only from DSH-derived application events without creating a second transcript authority.
- [ ] 9.5 Update Agent Home and Conversation Webview for new-Conversation clear UX, DSH compact diagnostics and unavailable legacy record operations.
- [ ] 9.6 Add contract producer/consumer tests proving exact canonical shape and stale or cross-Session identity rejection.
- [ ] 9.7 Add Desktop delegation tests proving product consumers call only the W1 public application boundary and never a direct runtime.
- [ ] 9.8 Add projection poison tests proving stale preview, Pi-derived history, raw Session bytes and renderer state cannot restore transcript or queue success.
- [ ] 9.9 Run Webview interaction tests for clear navigation, compact diagnostics, approvals, queue edits, Tool Timeline and sibling Conversation continuity.

## 10. W5b Conversation Catalog And Legacy Data

- [ ] 10.1 Implement provisional DSH Session creation, flush and reopen validation before publishing a new Conversation/Session binding.
- [ ] 10.2 Publish the complete new Conversation/Session binding in one catalog transaction and clean only the current request's exact unpublished Session on pre-publish failure.
- [ ] 10.3 Apply Window selection only after durable publication and return the new identity on selection failure while preserving the new record and current source selection.
- [ ] 10.4 Add failure injection for Session create, flush, reopen, catalog commit and Window selection and prove no visible half-binding or source transcript mutation.
- [ ] 10.5 Implement compact through only the Q0-qualified DSH compaction operation with exact Conversation failure diagnostics.
- [ ] 10.6 Add compact continuation, close/reopen and unsupported/failure tests without self-authored compaction or hidden Session rebinding.
- [ ] 10.7 Retain bounded identity/metadata for Pi-only catalog records and emit `conversation-runtime-unavailable` without decoding retired transcript content.
- [ ] 10.8 Disable transcript-dependent operations for unavailable legacy records while keeping sibling Conversations, Workspaces and catalog navigation usable.
- [ ] 10.9 Hash Pi JSONL, `pi_*` rows/unknown fields, retired databases and `.neko/` fixtures before and after startup, list, open, clear, compact and failure scenarios and require byte equality.
- [ ] 10.10 Poison retired reader, open, import, repair, cleanup and delete paths and prove normal product execution never invokes them.
- [ ] 10.11 Add catalog producer tests for valid DSH, malformed DSH, missing Workspace and Pi-only records with per-record failure isolation.
- [ ] 10.12 Add Desktop consumer tests proving a legacy record remains visible but only its execution-dependent operations are unavailable.

## 11. W7 Agent Evaluation Evidence

- [ ] 11.1 Update `scripts/agent-eval` canonical facts, assertions and reports for DSH Session/turn/call/inbox paths without adding a direct runtime runner or product Evaluation entry.
- [ ] 11.2 Add Evaluation poison assertions that reject Pi, fallback provider, stale projection and test-only direct-runtime success.
- [ ] 11.3 Run `pnpm test:agent:eval` to prove the key-free harness and canonical path assertions are ready without treating that result as Agent behavior evidence.
- [ ] 11.4 Run `pnpm test:local:api` with explicit `~/.neko/config.toml` provider/model authorization through the hidden complete Desktop session owner.
- [ ] 11.5 Run `pnpm test:local:ui` on visible real Electron through user-operable composer, Conversation navigation, approval and domain controls with a real authorized provider.
- [ ] 11.6 Verify normal turn convergence, compaction continuation, full owner/application reopen, transcript restoration, Tool/Job/artifact recovery, multiple Conversation switching and session isolation.
- [ ] 11.7 Verify Skill, MCP, Plugin, credential, malformed Session and legacy Conversation failures remain visible and local while valid siblings and unrelated Workspaces remain usable.
- [ ] 11.8 Record actual Evaluation commands, provider/model identity, redacted evidence locations, unexecuted cases and residual risks without storing secrets.

## 12. W8 Atomic Deletion And Deterministic Gates

- [ ] 12.1 Verify every production, Desktop, fixture, test and Evaluation consumer uses integrated W1-W7 public entries before deleting any retired producer.
- [ ] 12.2 Delete the `@neko/agent-runtime/pi` implementation, public export and all `PiConversationRuntime` and `NodePiConversationAuthority` registrations.
- [ ] 12.3 Delete Pi Skill host, personal Skill runtime, Pi event/history/portability projectors and their public exports.
- [ ] 12.4 Delete the OpenNeko Tool registry, Pi Capability/Tool bridges and `PiContentToolModelProtocol`.
- [ ] 12.5 Delete `AgentConversationMessageQueue`, independent pending maps, pause state and old queue projectors.
- [ ] 12.6 Delete retired MCP manager/client/bootstrap/Tool wrappers and their public exports.
- [ ] 12.7 Delete the retired Extension Plugin runtime and parallel registration paths.
- [ ] 12.8 Remove direct `@earendil-works/pi-agent-core` manifests and lockfile closure while retaining only the exact Q0-approved indirect DSH adapter dependency on `pi-ai`.
- [ ] 12.9 Remove Pi-specific configuration, package exports, test fixtures, build aliases and Desktop wiring without deleting or rewriting retired user data.
- [ ] 12.10 Add repository source, public-export, registration, dependency and built-output scans that fail on retired paths, fallback selectors and test-only direct-runtime shortcuts.
- [ ] 12.11 Add a dual-registration poison fixture proving DSH/Pi, duplicate Tool, duplicate MCP and wildcard Plugin registration fail the integration gate.
- [ ] 12.12 Run `pnpm --dir packages/agent/contracts run typecheck` and `pnpm --dir packages/agent/contracts run test`; record canonical contract-path evidence.
- [ ] 12.13 Run `pnpm --dir packages/agent/runtime run typecheck` and `pnpm --dir packages/agent/runtime run test`; record Session, Tool, Skill, MCP, Plugin and deletion-proof results.
- [ ] 12.14 Run `pnpm --dir packages/agent/webview run build` and `pnpm --dir packages/agent/webview run test`; record projection, diagnostic and interaction results.
- [ ] 12.15 Run focused tests and typechecks for every owning domain package changed by W6 and record the exact package commands and results.
- [ ] 12.16 Run `pnpm --dir apps/neko-desktop run typecheck`, focused Desktop delegation tests and `pnpm test:functional:headless`.
- [ ] 12.17 Run `pnpm check:agent-boundaries`, `pnpm check:application-boundaries`, `pnpm check:package-boundaries` and `pnpm check:storage-authorities`.
- [ ] 12.18 Run `pnpm check:no-internal-versioning`, `pnpm check:legacy-debt`, `pnpm check:unused` and the retired-path scans.
- [ ] 12.19 Re-run legacy-data hashes after all deterministic and Evaluation gates and require byte equality for every retired fixture.

## 13. Documentation And Atomic Release

- [ ] 13.1 Update `docs/architecture/adr-dsh-cordis-replace-agent-extension-runtime.md` from proposed assumptions to the accepted exact DSH package closure, qualified contracts and atomic cutover result.
- [ ] 13.2 Update `docs/architecture/agent.md`, `docs/architecture/package-boundaries.md` and the Agent runtime package README to describe the final DSH/Cordis authority and retained OpenNeko boundaries.
- [ ] 13.3 Update affected accepted storage, Agent and Extension specs so stable architecture matches the implemented single canonical runtime and legacy-data policy.
- [ ] 13.4 Mark `adopt-pi-agent-runtime` as superseded by this change without absorbing the independent `purify-agent-contracts` or Agent Evaluation platform ownership.
- [ ] 13.5 Run `openspec validate replace-pi-with-dsh-runtime-atomically --strict` and `pnpm check:openspec` after all task and stable-spec updates.
- [ ] 13.6 Run the `neko-quality-review` workflow, close every blocking finding and record exact commands, evidence locations, unexecuted checks and residual risks.
- [ ] 13.7 Satisfy the machine release guard with Q0, W1-W8, deterministic, data-protection and real Desktop Evaluation evidence together.
- [ ] 13.8 Run `pnpm build:desktop` and `pnpm package:desktop` only after task 13.7 passes and verify the packaged app contains the pinned DSH closure with no retired runtime files.
- [ ] 13.9 Produce exactly one release candidate from the migration integration branch and record its identity, dependency closure, deletion inventory and per-workstream integration commits.
